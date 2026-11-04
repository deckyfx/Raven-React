import { CString, JSCallback, ptr, toArrayBuffer, type FFITypeOrString, type Pointer } from "bun:ffi";
import * as r from "./raven";
import type { EventHandler } from "./props";

/** The second argument of a native callback, before it is decoded. */
type RawValue = number | Pointer | null;

/** Connects a native callback to a widget. Each kind of widget has its own function in the C API. */
type Connect = (widget: r.Rid, callback: Pointer | null) => void;

/** What `OnMeasure` of a `Custom` gives back. */
export interface MeasuredSize {
	readonly Width: number;
	readonly Height: number;
}

/** What `OnPaint` of a `Custom` receives: the painter for the `Rdraw_` functions, and the size. */
type PaintHandler = (painter: Pointer | null, width: number, height: number) => void;
type MeasureHandler = () => MeasuredSize;
type ListTextHandler = (index: number) => string;
type TileFillHandler = (index: number, item: r.RTileItem) => void;

/** The priority React asks about: discrete while a native event runs, as a click in React DOM. */
class UpdatePriority {
	/** The value of `DefaultEventPriority`, set by the host configuration. */
	default = 0;
	/** The value of `DiscreteEventPriority`, set by the host configuration. */
	discreteValue = 0;
	/** What React set, or 0. */
	current = 0;

	/** Runs something at the discrete priority. */
	discrete(run: () => void): void {
		const before = this.current;
		this.current = this.discreteValue;
		run();
		this.current = before;
	}
}

export const updatePriority = new UpdatePriority();

/**
 * Runs what a native event starts: the handler, then the commit of what it changed.
 * The commit happens before the next event, as in React DOM: a discrete event must not
 * leave state behind for the next click to read.
 */
class EventScope {
	private flush: () => void = () => {};
	private ignoring = 0;

	/** Gives the function that commits pending updates. */
	setFlush(flush: () => void): void {
		this.flush = flush;
	}

	/** Runs a change made by the renderer: an event it causes is not from the user. */
	ignoringEvents(change: () => void): void {
		this.ignoring++;
		change();
		this.ignoring--;
	}

	/**
	 * Calls application code from a native callback. The one catch of this package: an
	 * exception must not cross the frames of C, which cannot unwind.
	 */
	guard(run: () => void): void {
		try {
			run();
		} catch (error) {
			console.error("raven-react: exception in an event handler:", error);
		}
	}

	/** Runs a handler of the user, and commits what it changed. */
	run(handler: () => void, afterwards?: () => void): void {
		if (this.ignoring > 0) {
			return;
		}
		updatePriority.discrete(() => {
			this.guard(() => {
				handler();
				this.flush();
				afterwards?.();
			});
		});
	}
}

export const eventScope = new EventScope();

/**
 * A widget that holds its own value, which the user changes before React knows: what the
 * props say comes back when a handler refused the change, as a controlled input in React DOM.
 */
class ControlledSync {
	private readonly restore = new Map<r.Rid, () => void>();

	/** Gives what to do after an event of this widget. */
	set(widget: r.Rid, restore: () => void): void {
		this.restore.set(widget, restore);
	}

	/** Forgets a widget. */
	forget(widget: r.Rid): void {
		this.restore.delete(widget);
	}

	/** Runs after the handler of a widget and the commit it caused. */
	run(widget: r.Rid): void {
		this.restore.get(widget)?.();
	}
}

export const controlledSync = new ControlledSync();

/**
 * One event of one kind of widget, such as the change of a TextInput. It owns one native
 * callback, shared by all the widgets: a JSCallback per handler would stay alive for
 * ever, and an interface that changes would make many.
 */
class NativeEvent {
	private readonly handlers = new Map<r.Rid, EventHandler>();
	private callback: JSCallback | null = null;

	constructor(
		private readonly connect: Connect,
		private readonly make: (handlerOf: (widget: r.Rid) => EventHandler | undefined) => JSCallback,
	) {}

	/** Sets the function of a widget. */
	on(widget: r.Rid, handler: EventHandler): void {
		const known = this.handlers.has(widget);
		this.handlers.set(widget, handler);
		if (!known) {
			this.callback ??= this.make((id) => this.handlers.get(id));
			this.connect(widget, this.callback.ptr);
		}
	}

	/** Removes the function of a widget. */
	off(widget: r.Rid, alive: boolean): void {
		if (this.handlers.delete(widget) && alive) {
			this.connect(widget, null);
		}
	}

	/** How many widgets have a function, for the tests. */
	get size(): number {
		return this.handlers.size;
	}

	/** Whether a native callback was made, for the tests. */
	get hasCallback(): boolean {
		return this.callback !== null;
	}
}

/** An event that gives one value to its function. */
function valueEvent<V>(connect: Connect, rawType: FFITypeOrString, decode: (raw: RawValue) => V): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => new JSCallback(
		(widget: number, raw: RawValue): void => {
			const handler = handlerOf(widget) as ((value: V) => void) | undefined;
			if (handler) {
				eventScope.run(() => handler(decode(raw)), () => controlledSync.run(widget));
			}
		},
		{ args: ["u32", rawType, "ptr"], returns: "void" },
	));
}

const textOf = (raw: RawValue): string => (raw ? new CString(raw as Pointer).toString() : "");
const textEvent = (connect: Connect): NativeEvent => valueEvent<string>(connect, "ptr", textOf);
const flagEvent = (connect: Connect): NativeEvent => valueEvent<boolean>(connect, "i32", (raw) => raw !== 0);
const indexEvent = (connect: Connect): NativeEvent => valueEvent<number>(connect, "i32", Number);
const idEvent = (connect: Connect): NativeEvent => valueEvent<r.Rid>(connect, "u32", Number);
const floatEvent = (connect: Connect): NativeEvent => valueEvent<number>(connect, "f32", Number);
const doubleEvent = (connect: Connect): NativeEvent => valueEvent<number>(connect, "f64", Number);

/** `OnPaint`: runs while a frame is drawn, so nothing is committed after it. */
const paintEvent = new NativeEvent(r.Rcustom_set_paint_callback, (handlerOf) => new JSCallback(
	(widget: number, painter: Pointer | null, width: number, height: number): void => {
		const handler = handlerOf(widget) as PaintHandler | undefined;
		if (handler) {
			eventScope.guard(() => handler(painter, width, height));
		}
	},
	{ args: ["u32", "ptr", "f32", "f32", "ptr"], returns: "void" },
));

/** `OnMeasure`: says the size a `Custom` wants, through the two floats C gives. */
const measureEvent = new NativeEvent(r.Rcustom_set_measure_callback, (handlerOf) => new JSCallback(
	(widget: number, width: Pointer | null, height: Pointer | null): void => {
		const handler = handlerOf(widget) as MeasureHandler | undefined;
		if (handler && width && height) {
			eventScope.guard(() => {
				const size = handler();
				new Float32Array(toArrayBuffer(width, 0, 4))[0] = size.Width;
				new Float32Array(toArrayBuffer(height, 0, 4))[0] = size.Height;
			});
		}
	},
	{ args: ["u32", "ptr", "ptr", "ptr"], returns: "void" },
));

/**
 * The events with a value, by tag. `OnClicked`, `OnChanged`, `OnCommitted` and `OnActivated`
 * as XML attributes all set the one action of a widget, without a value, and for a TextInput
 * it only fires on Enter. These callbacks fire at each change, with the value.
 */
const WIDGET_EVENTS: Readonly<Record<string, Readonly<Record<string, NativeEvent>>>> = {
	TextInput: {
		OnChanged: textEvent(r.Rtext_input_set_changed_callback),
		OnCommitted: textEvent(r.Rtext_input_set_committed_callback),
	},
	Checkbox: { OnChanged: flagEvent(r.Rcheckbox_set_changed_callback) },
	Slider: { OnChanged: floatEvent(r.Rslider_set_changed_callback) },
	SpinBox: { OnChanged: doubleEvent(r.Rspin_box_set_changed_callback) },
	ComboBox: { OnChanged: indexEvent(r.Rcombo_box_set_changed_callback) },
	TabView: { OnChanged: indexEvent(r.Rtab_view_set_changed_callback) },
	Expander: { OnChanged: flagEvent(r.Rexpander_set_changed_callback) },
	ListView: {
		OnChanged: indexEvent(r.Rlist_view_set_selection_changed_callback),
		OnActivated: indexEvent(r.Rlist_view_set_activated_callback),
	},
	TreeView: {
		OnChanged: idEvent(r.Rtree_view_set_selection_changed_callback),
		OnActivated: idEvent(r.Rtree_view_set_activated_callback),
	},
	TileView: {
		OnChanged: indexEvent(r.Rtile_view_set_selection_changed_callback),
		OnActivated: indexEvent(r.Rtile_view_set_activated_callback),
	},
	Custom: { OnPaint: paintEvent, OnMeasure: measureEvent },
};

/** The items of a list asked for as they are shown: `ItemCount`, and a function for one item. */
class VirtualItems {
	private readonly handlers = new Map<r.Rid, EventHandler>();
	private callback: JSCallback | null = null;

	constructor(
		private readonly connect: (widget: r.Rid, count: number, callback: Pointer | null) => void,
		private readonly make: (handlerOf: (widget: r.Rid) => EventHandler | undefined) => JSCallback,
	) {}

	/** Sets the items of a widget. */
	set(widget: r.Rid, count: number, handler: EventHandler): void {
		this.handlers.set(widget, handler);
		this.callback ??= this.make((id) => this.handlers.get(id));
		this.connect(widget, count, this.callback.ptr);
	}

	/** Takes the function of a widget away. */
	clear(widget: r.Rid, alive: boolean): void {
		if (this.handlers.delete(widget) && alive) {
			this.connect(widget, 0, null);
		}
	}

	/** How many widgets have a function, for the tests. */
	get size(): number {
		return this.handlers.size;
	}
}

/** The text C reads when the callback returns: it lives until the next call. */
let listText: Buffer = Buffer.from([0]);
/** The structure C reads when the callback returns, with the texts it points to. */
let tileItem: r.RTileItem | null = null;

const VIRTUAL_ITEMS: Readonly<Record<string, { readonly prop: string; readonly items: VirtualItems }>> = {
	ListView: {
		prop: "ItemText",
		items: new VirtualItems(r.Rlist_view_set_virtual_items, (handlerOf) => new JSCallback(
			(widget: number, index: number): Pointer | null => {
				const handler = handlerOf(widget) as ListTextHandler | undefined;
				eventScope.guard(() => {
					listText = Buffer.from(`${handler?.(index) ?? ""}\0`);
				});
				return ptr(listText);
			},
			{ args: ["u32", "i32", "ptr"], returns: "ptr" },
		)),
	},
	TileView: {
		prop: "ItemFill",
		items: new VirtualItems(r.Rtile_view_set_items, (handlerOf) => new JSCallback(
			(widget: number, index: number, item: Pointer | null): void => {
				const handler = handlerOf(widget) as TileFillHandler | undefined;
				tileItem = r.RTileItem.from(item);
				if (handler && tileItem) {
					const filled = tileItem;
					eventScope.guard(() => handler(index, filled));
				}
			},
			{ args: ["u32", "i32", "ptr", "ptr"], returns: "void" },
		)),
	},
};

/** The attribute that says how many items a list has: it is not an attribute of Raven. */
export const ITEM_COUNT = "ItemCount";

/** The name of the prop that gives the items of a tag, if it has one. */
export function virtualItemsProp(tag: string): string | undefined {
	return VIRTUAL_ITEMS[tag]?.prop;
}

/** Gives a list its items. */
export function setVirtualItems(tag: string, widget: r.Rid, count: number, handler: EventHandler): void {
	VIRTUAL_ITEMS[tag]?.items.set(widget, count, handler);
}

/** What an `On...` prop receives, as TypeScript, for the generator. Other events receive nothing. */
export const EVENT_VALUE_TYPES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	TextInput: { OnChanged: "string", OnCommitted: "string" },
	Checkbox: { OnChanged: "boolean" },
	Slider: { OnChanged: "number" },
	SpinBox: { OnChanged: "number" },
	ComboBox: { OnChanged: "number" },
	TabView: { OnChanged: "number" },
	Expander: { OnChanged: "boolean" },
	ListView: { OnChanged: "number", OnActivated: "number" },
	TreeView: { OnChanged: "number", OnActivated: "number" },
	TileView: { OnChanged: "number", OnActivated: "number" },
};

/** The props this package adds to those in Raven's schema, as TypeScript, for the generator. */
export const EXTRA_PROPS: Readonly<Record<string, readonly string[]>> = {
	Custom: [
		"readonly OnPaint?: (painter: Pointer | null, width: number, height: number) => void",
		"readonly OnMeasure?: () => MeasuredSize",
	],
	ListView: ["readonly ItemCount?: number", "readonly ItemText?: (index: number) => string"],
	// (the schema of Raven does not list this event, which exists)
	TileView: ["readonly ItemCount?: number", "readonly ItemFill?: (index: number, item: RTileItem) => void", "readonly OnChanged?: (value: number) => void"],
};

/**
 * Events without a value, through the action of the widget: `OnClicked` of a Button, for
 * one. One action name per widget, and one native callback for them all.
 */
class ActionEvents {
	private readonly handlers = new Map<string, () => void>();
	private readonly nameOf = new Map<r.Rid, string>();
	private callback: JSCallback | null = null;
	private next = 0;

	/** The callback of every action, made the first time it is needed. */
	private pointer(): Pointer | null {
		this.callback ??= new JSCallback(
			(_sender: number, action: Pointer | null): void => {
				const handler = action ? this.handlers.get(new CString(action).toString()) : undefined;
				if (handler) {
					eventScope.run(handler);
				}
			},
			{ args: ["u32", "ptr", "ptr"], returns: "void" },
		);
		return this.callback.ptr;
	}

	/** Sets the function of a widget. */
	on(widget: r.Rid, handler: EventHandler): void {
		let name = this.nameOf.get(widget);
		if (!name) {
			name = `raven-react.${++this.next}`;
			this.nameOf.set(widget, name);
			r.Raction_bind(name, this.pointer());
			r.Rwidget_set_action(widget, name);
		}
		this.handlers.set(name, handler as () => void);
	}

	/** Removes the function of a widget. */
	off(widget: r.Rid, alive: boolean): void {
		const name = this.nameOf.get(widget);
		if (name) {
			this.handlers.delete(name);
			this.nameOf.delete(widget);
			r.Raction_unbind(name);
			if (alive) {
				r.Rwidget_set_action(widget, null);
			}
		}
	}

	/** How many widgets have a function, for the tests. */
	get size(): number {
		return this.handlers.size;
	}
}

const actionEvents = new ActionEvents();

/**
 * `OnClose` of a window. With a function, closing is a request: Raven keeps the window, and
 * the application takes the element out when it agrees. One native callback for all windows.
 */
class CloseEvents {
	private readonly handlers = new Map<r.Rid, () => void>();
	private callback: JSCallback | null = null;

	/** Sets, changes or removes the function of a window. */
	set(window: r.Rid, handler: EventHandler | undefined, alive = true): void {
		if (!handler) {
			if (this.handlers.delete(window) && alive) {
				r.Rwindow_set_close_callback(window, null);
			}
			return;
		}
		const known = this.handlers.has(window);
		this.handlers.set(window, handler as () => void);
		if (!known) {
			this.callback ??= new JSCallback(
				(id: number): number => {
					const close = this.handlers.get(id);
					if (!close) {
						return 1;
					}
					eventScope.run(close);
					return 0;
				},
				{ args: ["u32", "ptr"], returns: "i32" },
			);
			r.Rwindow_set_close_callback(window, this.callback.ptr);
		}
	}

	/** How many windows have a function, for the tests. */
	get size(): number {
		return this.handlers.size;
	}
}

export const closeEvents = new CloseEvents();

/** Sets, changes or removes the handlers of a widget, from one state of its props to the next. */
export function applyHandlers(tag: string, widget: r.Rid, previous: ReadonlyMap<string, EventHandler>, next: ReadonlyMap<string, EventHandler>): void {
	const events = WIDGET_EVENTS[tag];
	const itemsProp = virtualItemsProp(tag);
	for (const [name, handler] of next) {
		if (name === itemsProp) {
			continue;
		}
		const event = events?.[name];
		if (event) {
			event.on(widget, handler);
		} else {
			actionEvents.on(widget, handler);
		}
	}
	for (const name of previous.keys()) {
		if (next.has(name) || name === itemsProp) {
			continue;
		}
		const event = events?.[name];
		if (event) {
			event.off(widget, true);
		} else if (![...next.keys()].some((other) => other !== itemsProp && !events?.[other])) {
			actionEvents.off(widget, true);
		}
	}
}

/** Removes every handler of a widget. `alive` is false once the widget is gone. */
export function forgetHandlers(tag: string, widget: r.Rid, alive: boolean): void {
	for (const event of Object.values(WIDGET_EVENTS[tag] ?? {})) {
		event.off(widget, alive);
	}
	VIRTUAL_ITEMS[tag]?.items.clear(widget, alive);
	actionEvents.off(widget, alive);
	controlledSync.forget(widget);
}

/** What the tests read to see that nothing grows. */
export function eventStats(): { handlers: number; nativeCallbacks: number } {
	const events = Object.values(WIDGET_EVENTS).flatMap((group) => Object.values(group));
	const virtual = Object.values(VIRTUAL_ITEMS).reduce((sum, entry) => sum + entry.items.size, 0);
	return {
		handlers: actionEvents.size + closeEvents.size + virtual + events.reduce((sum, event) => sum + event.size, 0),
		nativeCallbacks: 1 + events.filter((event) => event.hasCallback).length,
	};
}
