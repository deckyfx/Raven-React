import type { Pointer } from "bun:ffi";
import { nativeCallback } from "#backend";
import type { NativeArg, NativeCallback, NativeValue, StructType } from "./backend/types";
import * as r from "./raven";
import type { EventHandler } from "./props";

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
 * callback, shared by all the widgets: on Bun, a JSCallback per handler would stay alive for
 * ever, and an interface that changes would make many.
 */
class NativeEvent {
	private readonly handlers = new Map<r.Rid, EventHandler>();
	private callback: NativeCallback | null = null;

	constructor(
		private readonly connect: Connect,
		private readonly make: (handlerOf: (widget: r.Rid) => EventHandler | undefined) => NativeCallback,
	) {}

	/** Sets the function of a widget. */
	on(widget: r.Rid, handler: EventHandler): void {
		const known = this.handlers.has(widget);
		this.handlers.set(widget, handler);
		if (!known) {
			this.callback ??= this.make((id) => this.handlers.get(id));
			this.connect(widget, this.callback);
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

/** The widget a native callback was called for: its first argument. */
const widgetOf = (value: NativeValue | undefined): r.Rid => Number(value);
/** A number C gave, as the function receives it. */
const numberOf = (value: NativeValue | undefined): number => Number(value);

/** An event that gives one value to its function. */
function valueEvent<V>(connect: Connect, arg: NativeArg, convert: (value: NativeValue) => V): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => nativeCallback(["u32", arg], "void", (id, value = null) => {
		const widget = widgetOf(id);
		const handler = handlerOf(widget) as ((value: V) => void) | undefined;
		if (handler) {
			eventScope.run(() => handler(convert(value)), () => controlledSync.run(widget));
		}
	}));
}

const textOf = (value: NativeValue): string => (typeof value === "string" ? value : "");
const textEvent = (connect: Connect): NativeEvent => valueEvent<string>(connect, "text", textOf);
const flagEvent = (connect: Connect): NativeEvent => valueEvent<boolean>(connect, "i32", (value) => value !== 0);
const indexEvent = (connect: Connect): NativeEvent => valueEvent<number>(connect, "i32", numberOf);
const idEvent = (connect: Connect): NativeEvent => valueEvent<r.Rid>(connect, "u32", numberOf);
const floatEvent = (connect: Connect): NativeEvent => valueEvent<number>(connect, "f32", numberOf);
const doubleEvent = (connect: Connect): NativeEvent => valueEvent<number>(connect, "f64", numberOf);

/** An event that gives what C gives as it is. `args` are the types after the widget. */
function directEvent(connect: Connect, args: readonly NativeArg[]): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => nativeCallback(["u32", ...args], "void", (id, ...values) => {
		const widget = widgetOf(id);
		const handler = handlerOf(widget) as ((...values: NativeValue[]) => void) | undefined;
		if (handler) {
			eventScope.run(() => handler(...values.slice(0, args.length)), () => controlledSync.run(widget));
		}
	}));
}

/** An event whose value is read from the widget, as C gives none of it, or not as its attribute is written. */
function readEvent<V>(connect: Connect, args: readonly NativeArg[], read: (widget: r.Rid) => V): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => nativeCallback(["u32", ...args], "void", (id) => {
		const widget = widgetOf(id);
		const handler = handlerOf(widget) as ((value: V) => void) | undefined;
		if (handler) {
			eventScope.run(() => handler(read(widget)), () => controlledSync.run(widget));
		}
	}));
}

/**
 * An event that asks: the function says yes by returning true, and anything else is no, an
 * exception included. A change made by the renderer is not asked about.
 */
function requestEvent(connect: Connect, args: readonly NativeArg[]): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => nativeCallback(["u32", ...args], "i32", (id, ...values) => {
		const handler = handlerOf(widgetOf(id)) as ((...values: NativeValue[]) => boolean | void) | undefined;
		let answer = 1;
		if (handler) {
			eventScope.run(() => {
				answer = 0;
				answer = handler(...values.slice(0, args.length)) === true ? 1 : 0;
			});
		}
		return answer;
	}));
}

/** A right click: what is under the pointer, and where. */
const contextEvent = (connect: Connect, item: NativeArg): NativeEvent => directEvent(connect, [item, "f32", "f32"]);

/** A point of a NodeGraph, with what is there: a pin. Or only the point, for the empty canvas. */
function pointEvent(connect: Connect, withItem: boolean): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => nativeCallback(["u32", "i32", "f32", "f32"], "void", (id, item, x, y) => {
		const handler = handlerOf(widgetOf(id)) as ((...values: number[]) => void) | undefined;
		if (handler) {
			eventScope.run(() => (withItem ? handler(numberOf(item), numberOf(x), numberOf(y)) : handler(numberOf(x), numberOf(y))));
		}
	}));
}

/**
 * An event whose function answers with a text, which C copies before it calls again: the
 * tooltip of a TextEditor. Nothing, or "", is no text.
 */
function textAnswerEvent(connect: Connect, args: readonly NativeArg[]): NativeEvent {
	// (the backend keeps the text valid until the next call, as C asks: it copies it at once)
	return new NativeEvent(connect, (handlerOf) => nativeCallback(["u32", ...args], "text", (id, ...values) => {
		const handler = handlerOf(widgetOf(id)) as ((...values: NativeValue[]) => string | null | void) | undefined;
		let text = "";
		if (handler) {
			eventScope.run(() => {
				text = handler(...values.slice(0, args.length)) ?? "";
			});
		}
		return text;
	}));
}

/**
 * An event that gives a structure, valid during the call, and consumes what it receives when
 * the function returns true.
 */
function structEvent(connect: Connect, struct: StructType): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => nativeCallback(["u32", struct], "i32", (id, event) => {
		const handler = handlerOf(widgetOf(id)) as ((event: NativeValue) => boolean | void) | undefined;
		let consumed = 0;
		if (handler && event) {
			eventScope.run(() => {
				consumed = handler(event) === true ? 1 : 0;
			});
		}
		return consumed;
	}));
}

/** The events of a window, which are not widgets. `OnClose` is apart: without it, Raven closes. */
export const WINDOW_EVENTS: Readonly<Record<string, NativeEvent>> = {
	OnResize: directEvent(r.Rwindow_set_resize_callback, ["i32", "i32"]),
	OnDrop: structEvent(r.Rwindow_set_drop_callback, r.RDropEvent),
};

/**
 * The events every widget has. `OnEvent` is its input before the widget sees it, for what has no
 * prop of its own, as the pointer over a `Custom`. `OnDrop` is what is dropped on it.
 */
const COMMON_EVENTS: Readonly<Record<string, NativeEvent>> = {
	OnEvent: structEvent(r.Rwidget_set_event_callback, r.REvent),
	OnDrop: structEvent(r.Rwidget_set_drop_callback, r.RDropEvent),
};

/** Two digits, for a date or a time. */
const two = (value: number): string => String(value).padStart(2, "0");

/** An event that gives three numbers from C as one text: a date or a time, as its attribute is written. */
function threeNumbersEvent(connect: Connect, write: (a: number, b: number, c: number) => string): NativeEvent {
	return new NativeEvent(connect, (handlerOf) => nativeCallback(["u32", "i32", "i32", "i32"], "void", (id, a, b, c) => {
		const widget = widgetOf(id);
		const handler = handlerOf(widget) as ((value: string) => void) | undefined;
		if (handler) {
			eventScope.run(() => handler(write(numberOf(a), numberOf(b), numberOf(c))), () => controlledSync.run(widget));
		}
	}));
}

/** An event that gives an index and a flag: the column of a Table and its direction, a series of a Plot and whether it shows. */
const indexAndFlagEvent = (connect: Connect): NativeEvent => new NativeEvent(connect, (handlerOf) => nativeCallback(["u32", "i32", "i32"], "void", (id, index, flag) => {
	const widget = widgetOf(id);
	const handler = handlerOf(widget) as IndexAndFlagHandler | undefined;
	if (handler) {
		eventScope.run(() => handler(numberOf(index), flag !== 0), () => controlledSync.run(widget));
	}
}));

/** `OnClicked` of a Toast: the button of its message. */
const toastActionEvent = new NativeEvent(r.Rtoast_set_action_callback, (handlerOf) => nativeCallback(["u32"], "void", (id) => {
	const handler = handlerOf(widgetOf(id)) as (() => void) | undefined;
	if (handler) {
		eventScope.run(handler);
	}
}));

/** `OnPaint`: runs while a frame is drawn, so nothing is committed after it. */
const paintEvent = new NativeEvent(r.Rcustom_set_paint_callback, (handlerOf) => nativeCallback(["u32", "pointer", "f32", "f32"], "void", (id, painter, width, height) => {
	const handler = handlerOf(widgetOf(id)) as PaintHandler | undefined;
	if (handler) {
		eventScope.guard(() => handler((painter ?? null) as Painter, numberOf(width), numberOf(height)));
	}
}));

/** `OnMeasure`: says the size a `Custom` wants, through the two floats C gives. */
const measureEvent = new NativeEvent(r.Rcustom_set_measure_callback, (handlerOf) => nativeCallback(["u32", "float", "float"], "void", (id, width, height) => {
	const handler = handlerOf(widgetOf(id)) as MeasureHandler | undefined;
	if (handler && width instanceof Float32Array && height instanceof Float32Array) {
		eventScope.guard(() => {
			const size = handler();
			width[0] = size.Width;
			height[0] = size.Height;
		});
	}
}));

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
		// (the tooltip for the text under the pointer where no marker is: nothing, or "", for none)
		OnHover: textAnswerEvent(r.Rtext_editor_set_hover_callback, ["i32", "i32"]),
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
		// (a double click on the empty canvas: given, it no longer frames all the nodes)
		OnCanvasActivated: pointEvent(r.Rnode_graph_set_canvas_activated_callback, false),
		// (a wire dropped on no pin, where; a pin clicked without dragging a wire from it)
		OnWireDropped: pointEvent(r.Rnode_graph_set_wire_dropped_callback, true),
		OnPinClicked: pointEvent(r.Rnode_graph_set_pin_clicked_callback, true),
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
	private callback: NativeCallback | null = null;

	constructor(
		private readonly connect: (widget: r.Rid, count: number, callback: Pointer | null) => void,
		private readonly make: (handlerOf: (widget: r.Rid) => EventHandler | undefined) => NativeCallback,
	) {}

	/** Sets the items of a widget. */
	set(widget: r.Rid, count: number, handler: EventHandler): void {
		this.handlers.set(widget, handler);
		this.callback ??= this.make((id) => this.handlers.get(id));
		this.connect(widget, count, this.callback);
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
		items: new VirtualItems(r.Rlist_view_set_virtual_items, (handlerOf) => nativeCallback(["u32", "i32"], "text", (id, index) => {
			const handler = handlerOf(widgetOf(id)) as ListTextHandler | undefined;
			let text = "";
			eventScope.guard(() => {
				text = handler?.(numberOf(index)) ?? "";
			});
			return text;
		})),
	},
	TileView: {
		count: "ItemCount",
		prop: "ItemFill",
		items: new VirtualItems(r.Rtile_view_set_items, (handlerOf) => nativeCallback(["u32", "i32", r.RTileItem], "void", (id, index, item) => {
			const handler = handlerOf(widgetOf(id)) as TileFillHandler | undefined;
			tileItem = item instanceof r.RTileItem ? item : null;
			if (handler && tileItem) {
				const filled = tileItem;
				eventScope.guard(() => handler(numberOf(index), filled));
			}
		})),
	},
	Table: {
		count: "RowCount",
		prop: "CellText",
		items: new VirtualItems(r.Rtable_set_virtual_rows, (handlerOf) => nativeCallback(["u32", "i32", "i32"], "text", (id, row, column) => {
			const handler = handlerOf(widgetOf(id)) as CellTextHandler | undefined;
			let text = "";
			eventScope.guard(() => {
				text = handler?.(numberOf(row), numberOf(column)) ?? "";
			});
			return text;
		})),
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
	TextEditor: [
		"readonly OnZoom?: (zoom: number) => void",
		"readonly OnCompletion?: (prefix: string) => void",
		"readonly OnHover?: (line: number, column: number) => string | null | void",
	],
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
		"readonly OnCanvasActivated?: (x: number, y: number) => void",
		"readonly OnWireDropped?: (pin: number, x: number, y: number) => void",
		"readonly OnPinClicked?: (pin: number, x: number, y: number) => void",
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
	/** The functions given to each name the application chose, in order: the last one has the name. */
	private readonly named = new Map<string, ((sender: r.Rid) => void)[]>();
	private callback: NativeCallback | null = null;
	private next = 0;

	/** The callback of every action, made the first time it is needed. */
	private pointer(): NativeCallback {
		this.callback ??= nativeCallback(["u32", "text"], "void", (sender, action) => {
			const handler = typeof action === "string" ? this.handlers.get(action) : undefined;
			if (handler) {
				eventScope.run(() => handler(widgetOf(sender)));
			}
		});
		return this.callback;
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

	/**
	 * Gives a function to an action of a name chosen by the application. It receives the sender.
	 * A name given again belongs to the last one, until it stops: then to the one before.
	 */
	bind(name: string, handler: (sender: r.Rid) => void): void {
		const registrations = this.named.get(name) ?? [];
		registrations.push(handler);
		this.named.set(name, registrations);
		this.handlers.set(name, handler);
		r.Raction_bind(name, this.pointer());
	}

	/** Takes such a function away: the one given, or all of the name. */
	unbind(name: string, handler?: (sender: r.Rid) => void): void {
		const registrations = this.named.get(name) ?? [];
		if (handler !== undefined) {
			const index = registrations.indexOf(handler);
			if (index < 0) {
				return;
			}
			registrations.splice(index, 1);
			// (the last one still there has the name again)
			const active = registrations.at(-1);
			if (active) {
				this.handlers.set(name, active);
				return;
			}
		}
		this.named.delete(name);
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
	/** The `OnClose` of each window: it decides, and the window stays open. */
	private readonly handlers = new Map<r.Rid, () => void>();
	/** What is told that a window with no `OnClose` closes, as Raven closes it: its cleanups. */
	private readonly notices = new Map<r.Rid, () => void>();
	private callback: NativeCallback | null = null;

	/** Sets, changes or removes the function of a window. */
	set(window: r.Rid, handler: EventHandler | undefined, alive = true): void {
		const known = this.handlers.has(window) || this.notices.has(window);
		if (!handler) {
			this.handlers.delete(window);
			this.release(window, known, alive);
			return;
		}
		this.handlers.set(window, handler as () => void);
		if (!known) {
			this.listen(window);
		}
	}

	/** Sets or removes what is told that a window closes when it has no `OnClose`: the user closed it. */
	notice(window: r.Rid, run: (() => void) | undefined, alive = true): void {
		const known = this.handlers.has(window) || this.notices.has(window);
		if (!run) {
			this.notices.delete(window);
			this.release(window, known, alive);
			return;
		}
		this.notices.set(window, run);
		if (!known) {
			this.listen(window);
		}
	}

	/** Asks Raven for the requests to close a window. */
	private listen(window: r.Rid): void {
		this.callback ??= nativeCallback(["u32"], "i32", (value) => {
			const id = widgetOf(value);
			const close = this.handlers.get(id);
			if (close) {
				eventScope.run(close);
				return 0;
			}
			// (no OnClose: Raven closes it, once what is told of it has run)
			const notice = this.notices.get(id);
			if (notice) {
				eventScope.run(notice);
			}
			return 1;
		});
		r.Rwindow_set_close_callback(window, this.callback);
	}

	/** Stops asking Raven once a window has neither. */
	private release(window: r.Rid, known: boolean, alive: boolean): void {
		if (known && alive && !this.handlers.has(window) && !this.notices.has(window)) {
			r.Rwindow_set_close_callback(window, null);
		}
	}

	/** How many windows have a function, for the tests. */
	get size(): number {
		return this.handlers.size + this.notices.size;
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
