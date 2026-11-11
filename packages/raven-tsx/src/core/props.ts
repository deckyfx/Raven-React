import type { ThemeColor } from "./theme";

/** A function given to an `On...` prop. What it receives depends on the widget and the event. */
export type EventHandler = (...values: never[]) => void;

/** A row of a `TreeView` given by its `Items` prop, with the rows inside it. */
export interface TreeItem {
	readonly Text: string;
	readonly Expanded?: boolean | undefined;
	readonly Children?: readonly TreeItem[] | undefined;
}

/** Numbers given to Raven as they are: a list, or a typed array when there are many. */
export type PlotNumbers = Float64Array | readonly number[];

/** A curve of a `Plot`: what `<Series>` is in XML. Curves are known by their place in the list. */
export interface PlotSeries {
	/** Its name in the legend. Without one it is not in the legend. */
	readonly Name?: string | undefined;
	/** The Y of its points; NaN leaves a gap. New values are a new array: the same array is taken for the same values. */
	readonly Y?: PlotNumbers | undefined;
	/** The X of its points, as many as Y. Without it they are numbered 0, 1, 2... */
	readonly X?: PlotNumbers | undefined;
	readonly Color?: ThemeColor | undefined;
	/** `None` leaves only the markers: a scatter plot. */
	readonly Line?: "Solid" | "Dashed" | "Dotted" | "DashDot" | "None" | undefined;
	readonly LineWidth?: number | undefined;
	readonly Marker?: "None" | "Circle" | "Square" | "Diamond" | "TriangleUp" | "TriangleDown" | "Cross" | "Plus" | "Asterisk" | undefined;
	readonly MarkerSize?: number | undefined;
	readonly MarkerFilled?: boolean | undefined;
	/** Draws the line in steps. */
	readonly Step?: boolean | undefined;
	/** The opacity of the area between the line and zero, from 0 to 1. */
	readonly Fill?: number | undefined;
	readonly XAxis?: "X" | "X2" | undefined;
	readonly YAxis?: "Y" | "Y2" | undefined;
	/** The user also hides a series, from the legend. */
	readonly Visible?: boolean | undefined;
	/** Keeps only the last points, for data that streams in with `Rplot_add_point`. */
	readonly MaxPoints?: number | undefined;
}

/** A line across the data of a `Plot` that the user drags: what `<DragLine>` is in XML. */
export interface PlotDragLine {
	readonly Value: number;
	/** `X` or `X2` makes it vertical, `Y` or `Y2` horizontal. `X` by default. */
	readonly Axis?: "X" | "Y" | "X2" | "Y2" | undefined;
	/** Written on the line, before its value. */
	readonly Label?: string | undefined;
	readonly Color?: ThemeColor | undefined;
}

/** A prop given to Raven by calling it, as it is, and never as text. */
export type DataValue = readonly PlotSeries[] | readonly PlotDragLine[];

/** One value of an attribute, in the forms a component accepts. */
export type AttributeValue = string | number | boolean | readonly string[] | readonly number[] | readonly TreeItem[];

/** `Slot={{ Padding: 24 }}`: JSX has no dots in names, so `Slot.Padding` is written as a group. */
export type AttributeGroup = { readonly [key: string]: AttributeValue | null | undefined };

/** What an attribute holds for `null` in a group: `Color={{ Text: null }}` takes the override away. */
export const CLEARED = "\0cleared";

/**
 * A prop of a component. `Child` is what an adapter's framework gives as children: the core only
 * looks in it for text (`childrenText`), so it has no need to know that type.
 */
export type PropValue<Child = never> = AttributeValue | AttributeGroup | EventHandler | DataValue | Child | null | undefined;

/** The props of a widget, as an adapter gives them. */
export type RavenProps<Child = never> = { readonly [name: string]: PropValue<Child> };

/** What props mean for a widget once they are read. */
export interface ResolvedProps {
	/** Attribute name to its text, as XML would hold it. */
	readonly attributes: ReadonlyMap<string, string>;
	/** `On...` name to its function. */
	readonly handlers: ReadonlyMap<string, EventHandler>;
	/** The props of `dataProps`, by name, as they were given. */
	readonly data: ReadonlyMap<string, DataValue>;
}

/** Tells whether a prop is a function. */
function isHandler<Child>(value: PropValue<Child>): value is EventHandler {
	return typeof value === "function";
}

/** Tells whether a prop is a group of attributes, as opposed to a list or an element of a framework, which marks itself with a symbol. */
function isGroup<Child>(value: PropValue<Child>): value is AttributeGroup {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !Object.values(value).some((item) => typeof item === "symbol");
}

/** An attribute value as text: lists of numbers are comma separated, and lists of texts `|` separated. */
function toText(value: AttributeValue): string {
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (value.some((item) => typeof item === "object")) {
		return JSON.stringify(value);
	}
	return value.every((item) => typeof item === "number") ? value.join(",") : value.join("|");
}

/**
 * The text held by the children of a widget, or null when they are not only text:
 * `<Label>Clicked {count} times</Label>` has the children `["Clicked ", 3, " times"]`.
 */
export function childrenText<Child>(children: PropValue<Child>): string | null {
	if (typeof children === "string" || typeof children === "number") {
		return String(children);
	}
	if (Array.isArray(children) && children.length > 0 && children.every((item) => typeof item === "string" || typeof item === "number")) {
		return children.join("");
	}
	return null;
}

/**
 * Reads props into attributes and handlers. Text in the children means the attribute `Text`.
 * The props named in `dataProps` are kept as they are: they do not go through XML.
 */
export function resolveProps<Child>(props: RavenProps<Child>, dataProps: readonly string[] = []): ResolvedProps {
	const attributes = new Map<string, string>();
	const handlers = new Map<string, EventHandler>();
	const data = new Map<string, DataValue>();
	for (const [name, value] of Object.entries(props)) {
		if (name === "children" || name === "key" || name === "ref" || value === undefined || value === null) {
			continue;
		}
		if (dataProps.includes(name)) {
			data.set(name, value as DataValue);
		} else if (isHandler(value)) {
			handlers.set(name, value);
		} else if (isGroup(value)) {
			for (const [key, item] of Object.entries(value)) {
				if (item !== undefined) {
					attributes.set(`${name}.${key}`, item === null ? CLEARED : toText(item));
				}
			}
		} else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value)) {
			attributes.set(name, toText(value));
		}
	}
	const text = childrenText(props["children"]);
	if (text !== null) {
		attributes.set("Text", text);
	}
	return { attributes, handlers, data };
}

/** Text with what XML would take for markup escaped, for an attribute value. */
export function escapeXml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
