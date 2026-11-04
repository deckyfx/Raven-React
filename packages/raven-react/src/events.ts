import { CString, JSCallback, type FFITypeOrString, type Pointer } from "bun:ffi";
import * as r from "./raven";
import type { EventHandler } from "./props";

/** The second argument of a native callback, before it is decoded. */
type RawValue = number | Pointer | null;

/** Connects a native callback to a widget. Each kind of widget has its own function in the C API. */
type Connect = (widget: r.Rid, callback: Pointer | null) => void;

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
	 * Runs a handler from a native callback. The one catch of this package: an exception
	 * must not cross the frames of C, which cannot unwind.
	 */
	run(handler: () => void, afterwards?: () => void): void {
		if (this.ignoring > 0) {
			return;
		}
		updatePriority.discrete(() => {
			try {
				handler();
				this.flush();
				afterwards?.();
			} catch (error) {
				console.error("raven-react: exception in an event handler:", error);
			}
		});
	}
}

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
export const eventScope = new EventScope();

/**
 * One event of one kind of widget, such as the change of a TextInput. It owns one native
 * callback, shared by all the widgets: a JSCallback per handler would stay alive for
 * ever, and an interface that changes would make many.
 */
class NativeEvent<V> {
	private readonly handlers = new Map<r.Rid, (value: V) => void>();
	private callback: JSCallback | null = null;

	constructor(
		private readonly connect: Connect,
		private readonly rawType: FFITypeOrString,
		private readonly decode: (raw: RawValue) => V,
	) {}

	/** The callback of this event, made the first time it is needed. */
	private pointer(): Pointer | null {
		this.callback ??= new JSCallback(
			(widget: number, raw: RawValue): void => {
				const handler = this.handlers.get(widget);
				if (handler) {
					eventScope.run(() => handler(this.decode(raw)), () => controlledSync.run(widget));
				}
			},
			{ args: ["u32", this.rawType, "ptr"], returns: "void" },
		);
		return this.callback.ptr;
	}

	/** Sets the function of a widget. */
	on(widget: r.Rid, handler: EventHandler): void {
		if (!this.handlers.has(widget)) {
			this.connect(widget, this.pointer());
		}
		this.handlers.set(widget, handler as (value: V) => void);
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

const textOf = (raw: RawValue): string => (raw ? new CString(raw as Pointer).toString() : "");
const textEvent = (connect: Connect) => new NativeEvent<string>(connect, "ptr", textOf);
const flagEvent = (connect: Connect) => new NativeEvent<boolean>(connect, "i32", (raw) => raw !== 0);
const indexEvent = (connect: Connect) => new NativeEvent<number>(connect, "i32", Number);
const idEvent = (connect: Connect) => new NativeEvent<r.Rid>(connect, "u32", Number);
const floatEvent = (connect: Connect) => new NativeEvent<number>(connect, "f32", Number);
const doubleEvent = (connect: Connect) => new NativeEvent<number>(connect, "f64", Number);

/** A widget event with a value of its own, reached through its own callback in the C API. */
type AnyNativeEvent = NativeEvent<string> | NativeEvent<boolean> | NativeEvent<number>;

/**
 * The events with a value, by tag. `OnClicked`, `OnChanged`, `OnCommitted` and `OnActivated`
 * as XML attributes all set the one action of a widget, without a value, and for a TextInput
 * it only fires on Enter. These callbacks fire at each change, with the value.
 */
const WIDGET_EVENTS: Readonly<Record<string, Readonly<Record<string, AnyNativeEvent>>>> = {
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
};

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

/** Sets, changes or removes the handlers of a widget, from one state of its props to the next. */
export function applyHandlers(tag: string, widget: r.Rid, previous: ReadonlyMap<string, EventHandler>, next: ReadonlyMap<string, EventHandler>): void {
	const events = WIDGET_EVENTS[tag];
	for (const [name, handler] of next) {
		const event = events?.[name];
		if (event) {
			event.on(widget, handler);
		} else {
			actionEvents.on(widget, handler);
		}
	}
	for (const name of previous.keys()) {
		if (next.has(name)) {
			continue;
		}
		const event = events?.[name];
		if (event) {
			event.off(widget, true);
		} else if (![...next.keys()].some((other) => !events?.[other])) {
			actionEvents.off(widget, true);
		}
	}
}

/** Removes every handler of a widget. `alive` is false once the widget is gone. */
export function forgetHandlers(tag: string, widget: r.Rid, alive: boolean): void {
	for (const event of Object.values(WIDGET_EVENTS[tag] ?? {})) {
		event.off(widget, alive);
	}
	actionEvents.off(widget, alive);
	controlledSync.forget(widget);
}

/** What the tests read to see that nothing grows. */
export function eventStats(): { handlers: number; nativeCallbacks: number } {
	const events = Object.values(WIDGET_EVENTS).flatMap((group) => Object.values(group));
	return {
		handlers: actionEvents.size + events.reduce((sum, event) => sum + event.size, 0),
		nativeCallbacks: 1 + events.filter((event) => event.hasCallback).length,
	};
}
