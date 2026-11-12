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

/** The painter `OnPaint` of a `Custom` receives, for the `Rdraw_` functions. */
export type Painter = Pointer | null;

/** What `OnPaint` of a `Custom` receives: the painter, and the size. */
type PaintHandler = (painter: Painter, width: number, height: number) => void;
type MeasureHandler = () => MeasuredSize;
type ListTextHandler = (index: number) => string;
type TileFillHandler = (index: number, item: r.RTileItem) => void;
type CellTextHandler = (row: number, column: number) => string;

/** What a `Plot` shows, by axis: the lowest and the highest value of each. */
export interface PlotView {
	readonly X: readonly [number, number];
	readonly Y: readonly [number, number];
	readonly X2: readonly [number, number];
	readonly Y2: readonly [number, number];
}

/** What a function of two values from C receives: an index, and a flag. */
type IndexAndFlagHandler = (index: number, flag: boolean) => void;

/**
 * Runs what a native event starts: the handler, then the commit of what it changed.
 * The commit happens before the next event, as in a browser: a discrete event must not
 * leave state behind for the next click to read.
 */
class EventScope {
	private flush: () => void = () => {};
	private wrap: (run: () => void) => void = (run) => run();
	private ignoring = 0;

	/** Gives the function that commits pending updates: an adapter says how, for its framework. */
	setFlush(flush: () => void): void {
		this.flush = flush;
	}

	/** Gives what surrounds the run of a native event, for a framework that wants to know of one. */
	setWrapper(wrap: (run: () => void) => void): void {
		this.wrap = wrap;
	}

	/** Runs a change made by the renderer: an event it causes is not from the user. */
	ignoringEvents(change: () => void): void {
		this.ignoring++;
		try {
			change();
		} finally {
			this.ignoring--;
		}
	}

	/**
	 * Calls application code from a native callback. The one catch of this package: an
	 * exception must not cross the frames of C, which cannot unwind.
	 */
	guard(run: () => void): void {
		try {
			run();
		} catch (error) {
			console.error("raven-tsx: exception in an event handler:", error);
		}
	}

	/** Runs a handler of the user, and commits what it changed. */
	run(handler: () => void, afterwards?: () => void): void {
		if (this.ignoring > 0) {
			return;
		}
		this.wrap(() => {
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
 * Makes a function for a callback of the C API behave as a prop would: an exception stays on this
 * side, and what it changes in the interface is committed before the next event, not some time later.
 * What it returns goes back to C, or `otherwise` if it threw.
 *
 *     raven.Rwidget_set_gesture_callback(widget, inEventScope((_widget, event) => { setZoom(event.scale); return 1; }, 0));
 */
export function inEventScope<A extends readonly (number | string | object | null)[], R>(callback: (...values: A) => R, otherwise?: R): (...values: A) => R {
	return (...values) => {
		let result = otherwise as R;
		eventScope.run(() => {
			result = callback(...values);
		});
		return result;
	};
}

/**
 * A widget that holds its own value, which the user changes before the framework knows: what the
 * props say comes back when a handler refused the change, as a controlled input in a browser.
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

	/** The C function that connects it, for the tests. */
	get connectName(): string {
		return this.connect.name;
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

/** An event that gives what C gives as it is. `args` are the types after the widget. */
function directEvent(connect: Connect, args: readonly FFITypeOrString[]): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => new JSCallback(
		(widget: number, ...values: number[]): void => {
			const handler = handlerOf(widget) as ((...values: number[]) => void) | undefined;
			if (handler) {
				eventScope.run(() => handler(...values.slice(0, args.length)), () => controlledSync.run(widget));
			}
		},
		{ args: ["u32", ...args, "ptr"], returns: "void" },
	));
}

/** An event whose value is read from the widget, as C gives none of it, or not as its attribute is written. */
function readEvent<V>(connect: Connect, args: readonly FFITypeOrString[], read: (widget: r.Rid) => V): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => new JSCallback(
		(widget: number): void => {
			const handler = handlerOf(widget) as ((value: V) => void) | undefined;
			if (handler) {
				eventScope.run(() => handler(read(widget)), () => controlledSync.run(widget));
			}
		},
		{ args: ["u32", ...args, "ptr"], returns: "void" },
	));
}

/**
 * An event that asks: the function says yes by returning true, and anything else is no, an
 * exception included. A change made by the renderer is not asked about.
 */
function requestEvent(connect: Connect, args: readonly FFITypeOrString[]): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => new JSCallback(
		(widget: number, ...values: number[]): number => {
			const handler = handlerOf(widget) as ((...values: number[]) => boolean | void) | undefined;
			let answer = 1;
			if (handler) {
				eventScope.run(() => {
					answer = 0;
					answer = handler(...values.slice(0, args.length)) === true ? 1 : 0;
				});
			}
			return answer;
		},
		{ args: ["u32", ...args, "ptr"], returns: "i32" },
	));
}

/** A right click: what is under the pointer, and where. */
const contextEvent = (connect: Connect, item: FFITypeOrString): NativeEvent => directEvent(connect, [item, "f32", "f32"]);

/**
 * An event that gives a structure, valid during the call, and consumes what it receives when
 * the function returns true.
 */
function structEvent<S>(connect: Connect, read: (raw: Pointer | null) => S | null): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => new JSCallback(
		(widget: number, raw: Pointer | null): number => {
			const handler = handlerOf(widget) as ((event: S) => boolean | void) | undefined;
			const event = read(raw);
			let consumed = 0;
			if (handler && event) {
				eventScope.run(() => {
					consumed = handler(event) === true ? 1 : 0;
				});
			}
			return consumed;
		},
		{ args: ["u32", "ptr", "ptr"], returns: "i32" },
	));
}

/** The events of a window, which are not widgets. `OnClose` is apart: without it, Raven closes. */
export const WINDOW_EVENTS: Readonly<Record<string, NativeEvent>> = {
	OnResize: directEvent(r.Rwindow_set_resize_callback, ["i32", "i32"]),
	OnDrop: structEvent(r.Rwindow_set_drop_callback, (raw) => r.RDropEvent.from(raw)),
};

/**
 * The events every widget has. `OnEvent` is its input before the widget sees it, for what has no
 * prop of its own, as the pointer over a `Custom`. `OnDrop` is what is dropped on it.
 */
const COMMON_EVENTS: Readonly<Record<string, NativeEvent>> = {
	OnEvent: structEvent(r.Rwidget_set_event_callback, (raw) => r.REvent.from(raw)),
	OnDrop: structEvent(r.Rwidget_set_drop_callback, (raw) => r.RDropEvent.from(raw)),
};

/** Two digits, for a date or a time. */
const two = (value: number): string => String(value).padStart(2, "0");

/** An event that gives three numbers from C as one text: a date or a time, as its attribute is written. */
function threeNumbersEvent(connect: Connect, write: (a: number, b: number, c: number) => string): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => new JSCallback(
		(widget: number, a: number, b: number, c: number): void => {
			const handler = handlerOf(widget) as ((value: string) => void) | undefined;
			if (handler) {
				eventScope.run(() => handler(write(a, b, c)), () => controlledSync.run(widget));
			}
		},
		{ args: ["u32", "i32", "i32", "i32", "ptr"], returns: "void" },
	));
}

/** An event that gives an index and a flag: the column of a Table and its direction, a series of a Plot and whether it shows. */
const indexAndFlagEvent = (connect: Connect): NativeEvent => new NativeEvent(connect, (handlerOf) => new JSCallback(
	(widget: number, index: number, flag: number): void => {
		const handler = handlerOf(widget) as IndexAndFlagHandler | undefined;
		if (handler) {
			eventScope.run(() => handler(index, flag !== 0), () => controlledSync.run(widget));
		}
	},
	{ args: ["u32", "i32", "i32", "ptr"], returns: "void" },
));

/** `OnClicked` of a Toast: the button of its message. */
const toastActionEvent = new NativeEvent(r.Rtoast_set_action_callback, (handlerOf) => new JSCallback(
	(widget: number): void => {
		const handler = handlerOf(widget) as (() => void) | undefined;
		if (handler) {
			eventScope.run(handler);
		}
	},
	{ args: ["u32", "ptr"], returns: "void" },
));

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
	TabView: {
		OnChanged: indexEvent(r.Rtab_view_set_changed_callback),
		OnClose: requestEvent(r.Rtab_view_set_close_callback, ["i32", "u32"]),
	},
	Expander: { OnChanged: flagEvent(r.Rexpander_set_changed_callback) },
	ListView: {
		OnChanged: indexEvent(r.Rlist_view_set_selection_changed_callback),
		OnActivated: indexEvent(r.Rlist_view_set_activated_callback),
	},
	TreeView: {
		OnChanged: idEvent(r.Rtree_view_set_selection_changed_callback),
		OnActivated: idEvent(r.Rtree_view_set_activated_callback),
		OnContext: contextEvent(r.Rtree_view_set_context_callback, "u32"),
	},
	TileView: {
		OnChanged: indexEvent(r.Rtile_view_set_selection_changed_callback),
		OnActivated: indexEvent(r.Rtile_view_set_activated_callback),
		OnContext: contextEvent(r.Rtile_view_set_context_callback, "i32"),
	},
	Custom: { OnPaint: paintEvent, OnMeasure: measureEvent },
	Table: {
		OnChanged: indexEvent(r.Rtable_set_selection_changed_callback),
		OnActivated: indexEvent(r.Rtable_set_activated_callback),
		OnSort: indexAndFlagEvent(r.Rtable_set_sort_callback),
	},
	DatePicker: { OnChanged: threeNumbersEvent(r.Rdate_picker_set_changed_callback, (year, month, day) => `${year}-${two(month)}-${two(day)}`) },
	TimePicker: { OnChanged: threeNumbersEvent(r.Rtime_picker_set_changed_callback, (hour, minute, second) => `${two(hour)}:${two(minute)}:${two(second)}`) },
	Rating: { OnChanged: floatEvent(r.Rrating_set_changed_callback) },
	Pagination: { OnChanged: indexEvent(r.Rpagination_set_changed_callback) },
	Plot: {
		OnChanged: directEvent(r.Rplot_set_drag_line_callback, ["i32", "f64"]),
		OnViewChanged: readEvent(r.Rplot_set_view_changed_callback, [], (plot): PlotView => ({
			X: r.Rplot_get_axis_range(plot, r.R_PLOT_X),
			Y: r.Rplot_get_axis_range(plot, r.R_PLOT_Y),
			X2: r.Rplot_get_axis_range(plot, r.R_PLOT_X2),
			Y2: r.Rplot_get_axis_range(plot, r.R_PLOT_Y2),
		})),
		OnSeriesToggled: indexAndFlagEvent(r.Rplot_set_series_toggled_callback),
	},
	Breadcrumb: { OnClicked: indexEvent(r.Rbreadcrumb_set_clicked_callback) },
	Toast: { OnClicked: toastActionEvent },
	TextEditor: {
		OnChanged: readEvent(r.Rtext_editor_set_changed_callback, [], (widget) => r.Rtext_editor_get_text(widget) ?? ""),
		OnZoom: floatEvent(r.Rtext_editor_set_zoom_callback),
		OnCompletion: textEvent(r.Rtext_editor_set_completion_callback),
	},
	ColorPicker: { OnChanged: readEvent(r.Rcolor_picker_set_changed_callback, ["f32", "f32", "f32", "f32"], (widget) => r.Rcolor_picker_get_hex(widget) ?? "") },
	Label: { OnLink: textEvent(r.Rlabel_set_link_callback) },
	MenuItem: { OnClicked: readEvent(r.Rmenu_item_set_clicked_callback, [], (widget) => r.Rmenu_item_is_checked(widget) !== 0) },
	Island: { OnChanged: flagEvent(r.Risland_set_changed_callback) },
	Viewport: { OnResize: directEvent(r.Rviewport_set_resize_callback, ["i32", "i32"]) },
	FileBrowser: {
		OnChanged: textEvent(r.Rfile_browser_set_selection_changed_callback),
		OnAccepted: textEvent(r.Rfile_browser_set_accepted_callback),
		OnCancelled: textEvent(r.Rfile_browser_set_cancelled_callback),
	},
	DockArea: {
		OnChanged: readEvent(r.Rdock_area_set_changed_callback, [], (widget) => r.Rdock_area_save_layout(widget) ?? ""),
		OnClose: requestEvent(r.Rdock_area_set_close_callback, ["u32"]),
	},
	Timeline: {
		OnTime: doubleEvent(r.Rtimeline_set_time_callback),
		OnItemChanged: indexEvent(r.Rtimeline_set_changed_callback),
		OnSelection: indexEvent(r.Rtimeline_set_selection_callback),
		OnActivated: indexEvent(r.Rtimeline_set_activated_callback),
		OnRemoved: indexEvent(r.Rtimeline_set_removed_callback),
	},
	NodeGraph: {
		OnLinked: indexEvent(r.Rnode_graph_set_linked_callback),
		OnUnlinked: indexEvent(r.Rnode_graph_set_unlinked_callback),
		OnMoved: indexEvent(r.Rnode_graph_set_moved_callback),
		OnSelection: indexEvent(r.Rnode_graph_set_selection_callback),
		OnRemoved: indexEvent(r.Rnode_graph_set_removed_callback),
		OnActivated: indexEvent(r.Rnode_graph_set_activated_callback),
		OnContext: contextEvent(r.Rnode_graph_set_context_callback, "i32"),
		OnConnect: requestEvent(r.Rnode_graph_set_connect_callback, ["i32", "i32"]),
	},
	BlockEditor: {
		OnChanged: indexEvent(r.Rblock_editor_set_changed_callback),
		OnClicked: indexEvent(r.Rblock_editor_set_clicked_callback),
		OnContext: contextEvent(r.Rblock_editor_set_context_callback, "i32"),
	},
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

	/** The C function that connects it, for the tests. */
	get connectName(): string {
		return this.connect.name;
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

/** What makes a list virtual: the prop with its number of items, and the prop with its function. */
export interface VirtualItemsProps {
	readonly count: string;
	readonly prop: string;
}

const VIRTUAL_ITEMS: Readonly<Record<string, VirtualItemsProps & { readonly items: VirtualItems }>> = {
	ListView: {
		count: "ItemCount",
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
		count: "ItemCount",
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
	Table: {
		count: "RowCount",
		prop: "CellText",
		items: new VirtualItems(r.Rtable_set_virtual_rows, (handlerOf) => new JSCallback(
			(widget: number, row: number, column: number): Pointer | null => {
				const handler = handlerOf(widget) as CellTextHandler | undefined;
				eventScope.guard(() => {
					listText = Buffer.from(`${handler?.(row, column) ?? ""}\0`);
				});
				return ptr(listText);
			},
			{ args: ["u32", "i32", "i32", "ptr"], returns: "ptr" },
		)),
	},
};

/** The props that give the items of a tag, if it has them. */
export function virtualItemsOf(tag: string): VirtualItemsProps | undefined {
	return VIRTUAL_ITEMS[tag];
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
	Table: { OnActivated: "number" },
	DatePicker: { OnChanged: "string" },
	TimePicker: { OnChanged: "string" },
	Rating: { OnChanged: "number" },
	Pagination: { OnChanged: "number" },
	Plot: { OnChanged: "line: number, value: number" },
	Breadcrumb: { OnClicked: "number" },
	TextEditor: { OnChanged: "string" },
	ColorPicker: { OnChanged: "string" },
	MenuItem: { OnClicked: "boolean" },
	BlockEditor: { OnChanged: "number" },
};

/** What fills a widget from the elements XML takes inside it: `<Track>`, `<Node>`... */
const MARKUP = "readonly Markup?: string";

/**
 * What every axis of a Plot takes: `XMin`, `Y2Format`... The schema lists most of these for X only,
 * and says the others exist in a description. (those it does list keep the type it gives)
 */
const PLOT_AXIS_PROPS: readonly string[] = ["X", "Y", "X2", "Y2"].flatMap((axis) => [
	`readonly ${axis}Label?: string`,
	`readonly ${axis}Scale?: "Linear" | "Log" | "SymLog"`,
	`readonly ${axis}Min?: number`,
	`readonly ${axis}Max?: number`,
	`readonly ${axis}Range?: readonly [number, number]`,
	`readonly ${axis}AutoFit?: boolean`,
	`readonly ${axis}Format?: string`,
	`readonly ${axis}LinearThreshold?: number`,
	`readonly ${axis}Grid?: boolean`,
	`readonly ${axis}Inverted?: boolean`,
	`readonly ${axis}Locked?: boolean`,
	`readonly ${axis}Visible?: boolean`,
]);

/** The props this package adds to those in Raven's schema, as TypeScript, for the generator. */
export const EXTRA_PROPS: Readonly<Record<string, readonly string[]>> = {
	Window: ["readonly Opacity?: number", "readonly ContinuousRedraw?: boolean"],
	Custom: [
		"readonly OnPaint?: (painter: Painter, width: number, height: number) => void",
		"readonly OnMeasure?: () => MeasuredSize",
	],
	ListView: ["readonly ItemCount?: number", "readonly ItemText?: (index: number) => string"],
	// (the schema of Raven does not list this event, which exists)
	TileView: [
		"readonly ItemCount?: number",
		"readonly ItemFill?: (index: number, item: RTileItem) => void",
		"readonly OnChanged?: (value: number) => void",
		"readonly OnContext?: (index: number, x: number, y: number) => void",
	],
	Table: [
		"readonly RowCount?: number",
		"readonly CellText?: (row: number, column: number) => string",
		"readonly OnChanged?: (row: number) => void",
		"readonly OnSort?: (column: number, descending: boolean) => void",
		MARKUP,
	],
	Image: ["readonly Texture?: Rid"],
	Plot: [
		"readonly Series?: readonly PlotSeries[]",
		"readonly DragLines?: readonly PlotDragLine[]",
		"readonly OnViewChanged?: (view: PlotView) => void",
		"readonly OnSeriesToggled?: (series: number, visible: boolean) => void",
		...PLOT_AXIS_PROPS,
	],
	TabView: [
		"readonly Documents?: boolean",
		"readonly OnClose?: (index: number, content: Rid) => boolean | void",
	],
	TreeView: [
		"readonly Items?: readonly TreeItem[]",
		"readonly OnContext?: (item: Rid, x: number, y: number) => void",
		MARKUP,
	],
	TextEditor: ["readonly OnZoom?: (zoom: number) => void", "readonly OnCompletion?: (prefix: string) => void"],
	Label: ['readonly FontStyle?: "Regular" | "Bold" | "Italic" | "BoldItalic"', "readonly OnLink?: (url: string) => void"],
	Island: ["readonly OnChanged?: (expanded: boolean) => void"],
	Viewport: ["readonly OnResize?: (width: number, height: number) => void"],
	FileBrowser: [
		"readonly OnChanged?: (path: string) => void",
		"readonly OnAccepted?: (path: string) => void",
		"readonly OnCancelled?: () => void",
	],
	DockArea: [
		"readonly OnChanged?: (layout: string) => void",
		"readonly OnClose?: (panel: Rid) => boolean | void",
	],
	Timeline: [
		"readonly OnTime?: (seconds: number) => void",
		"readonly OnItemChanged?: (item: number) => void",
		"readonly OnSelection?: (item: number) => void",
		"readonly OnActivated?: (item: number) => void",
		"readonly OnRemoved?: (item: number) => void",
		MARKUP,
	],
	NodeGraph: [
		"readonly OnLinked?: (link: number) => void",
		"readonly OnUnlinked?: (link: number) => void",
		"readonly OnMoved?: (node: number) => void",
		"readonly OnSelection?: (node: number) => void",
		"readonly OnRemoved?: (node: number) => void",
		"readonly OnActivated?: (node: number) => void",
		"readonly OnContext?: (node: number, x: number, y: number) => void",
		"readonly OnConnect?: (outputPin: number, inputPin: number) => boolean",
		MARKUP,
	],
	BlockEditor: [
		"readonly OnClicked?: (block: number) => void",
		"readonly OnContext?: (block: number, x: number, y: number) => void",
		MARKUP,
	],
};

/** The props every widget has from this package, as TypeScript, for the generator. */
export const COMMON_PROPS: readonly string[] = [
	"readonly OnEvent?: (event: REvent) => boolean | void",
	"readonly OnDrop?: (event: RDropEvent) => boolean | void",
];

/**
 * Events without a value, through the action of the widget: `OnClicked` of a Button, for
 * one. One action name per widget, and one native callback for them all.
 */
class ActionEvents {
	private readonly handlers = new Map<string, (sender: r.Rid) => void>();
	private readonly nameOf = new Map<r.Rid, string>();
	private callback: JSCallback | null = null;
	private next = 0;

	/** The callback of every action, made the first time it is needed. */
	private pointer(): Pointer | null {
		this.callback ??= new JSCallback(
			(sender: number, action: Pointer | null): void => {
				const handler = action ? this.handlers.get(new CString(action).toString()) : undefined;
				if (handler) {
					eventScope.run(() => handler(sender));
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
			name = `raven-tsx.${++this.next}`;
			this.nameOf.set(widget, name);
			r.Raction_bind(name, this.pointer());
			r.Rwidget_set_action(widget, name);
		}
		// (a prop receives nothing, as its type says: `OnClicked={toggle}` must not get a handle)
		this.handlers.set(name, () => (handler as () => void)());
	}

	/** Gives a function to an action of a name chosen by the application. It receives the sender. */
	bind(name: string, handler: (sender: r.Rid) => void): void {
		this.handlers.set(name, handler);
		r.Raction_bind(name, this.pointer());
	}

	/** Takes the function of such an action away. */
	unbind(name: string, handler?: (sender: r.Rid) => void): void {
		// (a name given again since belongs to the one that gave it last: the first one going leaves it)
		if (handler !== undefined && this.handlers.get(name) !== handler) {
			return;
		}
		this.handlers.delete(name);
		r.Raction_unbind(name);
	}

	/** Removes the function of a widget. */
	off(widget: r.Rid, alive: boolean): void {
		const name = this.nameOf.get(widget);
		if (name) {
			this.handlers.delete(name);
			this.nameOf.delete(widget);
			r.Raction_unbind(name);
			// (a prop that went from a function to a name has set that name by now: it stays)
			if (alive && r.Rwidget_get_action(widget) === name) {
				r.Rwidget_set_action(widget, null);
			}
		}
	}

	/** How many widgets have a function, for the tests. */
	get size(): number {
		return this.handlers.size;
	}
}

export const actionEvents = new ActionEvents();

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

/** The native event of a prop of a tag, if it has one: the rest goes through the action of the widget. */
const eventOf = (tag: string, name: string): NativeEvent | undefined => WIDGET_EVENTS[tag]?.[name] ?? COMMON_EVENTS[name];

/** Sets, changes or removes the handlers of a widget, from one state of its props to the next. */
export function applyHandlers(tag: string, widget: r.Rid, previous: ReadonlyMap<string, EventHandler>, next: ReadonlyMap<string, EventHandler>): void {
	const itemsProp = VIRTUAL_ITEMS[tag]?.prop;
	for (const [name, handler] of next) {
		if (name === itemsProp) {
			continue;
		}
		const event = eventOf(tag, name);
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
		const event = eventOf(tag, name);
		if (event) {
			event.off(widget, true);
		} else if (![...next.keys()].some((other) => other !== itemsProp && !eventOf(tag, other))) {
			actionEvents.off(widget, true);
		}
	}
}

/** Removes every handler of a widget. `alive` is false once the widget is gone. */
export function forgetHandlers(tag: string, widget: r.Rid, alive: boolean): void {
	for (const event of Object.values(WIDGET_EVENTS[tag] ?? {})) {
		event.off(widget, alive);
	}
	for (const event of Object.values(COMMON_EVENTS)) {
		event.off(widget, alive);
	}
	VIRTUAL_ITEMS[tag]?.items.clear(widget, alive);
	actionEvents.off(widget, alive);
	controlledSync.forget(widget);
}

/** Every native event. */
const allEvents = (): NativeEvent[] => [...Object.values(WIDGET_EVENTS).flatMap((group) => Object.values(group)), ...Object.values(COMMON_EVENTS), ...Object.values(WINDOW_EVENTS)];

/** What the tests read to see that nothing grows. */
export function eventStats(): { handlers: number; nativeCallbacks: number } {
	const events = allEvents();
	const virtual = Object.values(VIRTUAL_ITEMS).reduce((sum, entry) => sum + entry.items.size, 0);
	return {
		handlers: actionEvents.size + closeEvents.size + virtual + events.reduce((sum, event) => sum + event.size, 0),
		nativeCallbacks: 1 + events.filter((event) => event.hasCallback).length,
	};
}

/** The C functions the tables above connect, for the test of what is covered. */
export function wiredCallbacks(): string[] {
	return [
		...allEvents().map((event) => event.connectName),
		...Object.values(VIRTUAL_ITEMS).map((entry) => entry.items.connectName),
		r.Rwindow_set_close_callback.name,
	];
}

/** Which props of which tags have a native event, for the test of what is covered. */
export function wiredProps(): Array<readonly [string, string]> {
	return Object.entries(WIDGET_EVENTS).flatMap(([tag, group]) => Object.keys(group).map((name) => [tag, name] as const));
}
