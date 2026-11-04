import type { ReactNode } from "react";

/** A function given to an `On...` prop. What it receives depends on the widget and the event. */
export type EventHandler = (...values: never[]) => void;

/** A row of a `TreeView` given by its `Items` prop, with the rows inside it. */
export interface TreeItem {
	readonly Text: string;
	readonly Expanded?: boolean;
	readonly Children?: readonly TreeItem[];
}

/** One value of an attribute, in the forms a component accepts. */
export type AttributeValue = string | number | boolean | readonly string[] | readonly number[] | readonly TreeItem[];

/** `Slot={{ Padding: 24 }}`: JSX has no dots in names, so `Slot.Padding` is written as a group. */
export type AttributeGroup = { readonly [key: string]: AttributeValue | null | undefined };

/** What an attribute holds for `null` in a group: `Color={{ Text: null }}` takes the override away. */
export const CLEARED = "\0cleared";

/** A prop of a component. */
export type PropValue = AttributeValue | AttributeGroup | EventHandler | ReactNode;

/** The props of a widget, as the renderer receives them. */
export type RavenProps = { readonly [name: string]: PropValue };

/** What props mean for a widget once they are read. */
export interface ResolvedProps {
	/** Attribute name to its text, as XML would hold it. */
	readonly attributes: ReadonlyMap<string, string>;
	/** `On...` name to its function. */
	readonly handlers: ReadonlyMap<string, EventHandler>;
}

/** Tells whether a prop is a function. */
function isHandler(value: PropValue): value is EventHandler {
	return typeof value === "function";
}

/** Tells whether a prop is a group of attributes, as opposed to a list or a React element. */
function isGroup(value: PropValue): value is AttributeGroup {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !("$$typeof" in value);
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
export function childrenText(children: PropValue): string | null {
	if (typeof children === "string" || typeof children === "number") {
		return String(children);
	}
	if (Array.isArray(children) && children.length > 0 && children.every((item) => typeof item === "string" || typeof item === "number")) {
		return children.join("");
	}
	return null;
}

/** Reads props into attributes and handlers. Text in the children means the attribute `Text`. */
export function resolveProps(props: RavenProps): ResolvedProps {
	const attributes = new Map<string, string>();
	const handlers = new Map<string, EventHandler>();
	for (const [name, value] of Object.entries(props)) {
		if (name === "children" || name === "key" || name === "ref" || value === undefined || value === null) {
			continue;
		}
		if (isHandler(value)) {
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
	const text = childrenText(props.children);
	if (text !== null) {
		attributes.set("Text", text);
	}
	return { attributes, handlers };
}

/** Text with what XML would take for markup escaped, for an attribute value. */
export function escapeXml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
