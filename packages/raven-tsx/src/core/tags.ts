/**
 * Components as tags of Raven: what a `<Widget Name="...">` declaration of XML does, with a
 * component instead. Raven then builds the component from XML (a document, `Markup`, a file of
 * someone else) as it builds `<Button>`:
 *
 *     registerTag("Card", Card, { attributes: { Title: "string", Wide: "boolean" }, slots: ["footer"] });
 *     // <Card Title="Sales"><Stat/><Into Name="footer"><Button/></Into></Card>
 *
 * This is the half that speaks to Raven: the callbacks, the attributes, the widgets of the children.
 * A framework comes in through a `TagAdapter`, which only knows how to render a component into a widget.
 */

import { CString, JSCallback, type Pointer } from "bun:ffi";
import { RavenError } from "./errors";
import * as r from "./raven";

/** How the text of an attribute becomes a prop. */
export type AttributeKind = "string" | "number" | "boolean";

/** The kind of attribute a prop can be given from, or never for a prop text cannot give. */
type KindOf<T> = T extends string ? "string" : T extends number ? "number" : T extends boolean ? "boolean" : never;

/**
 * The props of a component that take widgets, by the `Node` of its framework: its places for the
 * children of `<Into>`. (in brackets, so that a prop taking only a part of `Node`, a `string`, is not one)
 */
type SlotOf<P, Node> = { [K in keyof P]-?: K extends "children" ? never : [Node] extends [P[K]] ? K : never }[keyof P];

/** What a tag takes from its element. `Node` is what its framework renders. */
export interface TagOptions<P, Node> {
	/** The attributes it takes, each with the kind of its prop. The others stay the widget's: `Name`, `Width`, `Slot`... */
	readonly attributes?: { readonly [K in keyof P]?: KindOf<NonNullable<P[K]>> | undefined } | undefined;
	/** Its props that take widgets, by name: the children of `<Into Name="...">` go there; the other children go to `children`. */
	readonly slots?: readonly SlotOf<P, Node>[] | undefined;
}

/** What an element gives its component: its attributes, and the widgets Raven made for its children. */
export interface TagContent {
	/** The props taken from attributes. */
	readonly attributes: Readonly<Record<string, string | number | boolean>>;
	/** The widgets of its children, for an adapter to show as adopted (`WidgetInstance.adopt`). */
	readonly children: readonly r.Rid[];
	/** The widgets of its named places, by name. */
	readonly slots: Readonly<Record<string, readonly r.Rid[]>>;
}

/** A component rendered in a widget of a tag, as an adapter gives it back. */
export interface TagMount {
	/** Renders the component again, with what it has now. */
	update(props: TagContent): void;
	/** Takes the component away. Its widget stays: Raven destroys that. */
	unmount(): void;
}

/** How a framework shows a registered component in a widget. `Component` is its kind of component. */
export interface TagAdapter<Component> {
	/** Renders a component into a widget, which it fills, and returns how to change it and take it away. */
	mount(component: Component, props: TagContent, container: r.Rid): TagMount;
}

/** A registered tag. */
interface Registration {
	readonly mount: (props: TagContent, container: r.Rid) => TagMount;
	readonly attributes: Readonly<Record<string, AttributeKind>>;
	readonly slots: ReadonlySet<string>;
}

/** An element of a registered tag, as Raven built it. */
interface Element {
	readonly tag: string;
	readonly widget: r.Rid;
	props: Record<string, string | number | boolean>;
	/** The widgets of the children of the element, once Raven added them all. */
	children: readonly r.Rid[];
	slots: Record<string, readonly r.Rid[]>;
	/** Rendered once its children are known: until then, attributes are only kept. */
	ready: boolean;
	/** The widgets of its children, which the adapter only places: those it does not show are destroyed with the element. */
	adopted: readonly r.Rid[];
	/** Its component, with the registration it came from: a tag registered again renders the new one. */
	mounted: { readonly registration: Registration; readonly mount: TagMount } | null;
}

/** The tag that sends its children to a named place of the component around it. */
const INTO = "Into";

const registrations = new Map<string, Registration>();
const elements = new Map<r.Rid, Element>();
/** The widgets of `<Into>` elements, with the name of their place. */
const intos = new Set<r.Rid>();

/** The children of a widget, in order. */
function childrenOf(widget: r.Rid): r.Rid[] {
	return Array.from({ length: r.Rwidget_get_child_count(widget) }, (_, index) => r.Rwidget_get_child(widget, index));
}

/** Renders an element with what it has now, through the adapter of its tag. */
function render(element: Element): void {
	const registration = registrations.get(element.tag);
	if (!registration || !element.ready) {
		return;
	}
	const content: TagContent = { attributes: element.props, children: element.children, slots: element.slots };
	if (element.mounted?.registration === registration) {
		element.mounted.mount.update(content);
		return;
	}
	// (forgotten first: taken away once, even if this or the new mount throws)
	const previous = element.mounted;
	element.mounted = null;
	previous?.mount.unmount();
	element.mounted = { registration, mount: registration.mount(content, element.widget) };
}

/**
 * Raven adds the children of an element after making it, and before its attributes: once the
 * call that built it returns, they are all there, and go to their places.
 */
function place(widget: r.Rid, element: Element): void {
	const registration = registrations.get(element.tag);
	const children: r.Rid[] = [];
	const slots: Record<string, r.Rid[]> = {};
	// (each one taken out is the element's at once: destroyed with it, even if this stops half way)
	const taken: r.Rid[] = [];
	element.adopted = taken;
	for (const child of childrenOf(widget)) {
		if (!intos.has(child)) {
			// (taken out, as those of <Into>: only what the component renders is shown)
			r.Rwidget_remove_child(widget, child);
			taken.push(child);
			children.push(child);
			continue;
		}
		const name = r.Rwidget_get_name(child) ?? "";
		const inside = childrenOf(child);
		if (registration?.slots.has(name)) {
			slots[name] = [...(slots[name] ?? []), ...inside];
		} else {
			console.error(`raven-tsx: <${element.tag}>: <Into Name="${name}">: no place of this name; its widgets go with the others`);
			children.push(...inside);
		}
		// (the widgets it held are taken out of it first: the adapter places them)
		for (const held of inside) {
			r.Rwidget_remove_child(child, held);
			taken.push(held);
		}
		intos.delete(child);
		r.Rwidget_destroy(child);
	}
	element.adopted = [...children, ...Object.values(slots).flat()];
	element.children = children;
	element.slots = slots;
	element.ready = true;
	render(element);
}

/** Makes the widget of an element: a box the adapter renders the component into. */
function create(tag: string): r.Rid {
	const widget = r.Rwidget_create_from_xml("<VBox/>");
	if (tag === INTO) {
		intos.add(widget);
		r.Rwidget_set_destroy_callback(widget, nativeCallbacks().destroy);
		return widget;
	}
	const element: Element = { tag, widget, props: {}, children: [], slots: {}, ready: false, adopted: [], mounted: null };
	elements.set(widget, element);
	r.Rwidget_set_destroy_callback(widget, nativeCallbacks().destroy);
	queueMicrotask(() => {
		try {
			if (elements.get(widget) === element) {
				place(widget, element);
			}
		} catch (error) {
			console.error(`raven-tsx: error placing the children of <${tag}>:`, error);
		}
	});
	return widget;
}

/** The prop of an attribute, or null when the text is not of its kind. */
function parse(kind: AttributeKind, value: string): string | number | boolean | null {
	if (kind === "string") {
		return value;
	}
	if (kind === "number") {
		const number = Number(value);
		return value.trim() !== "" && Number.isFinite(number) ? number : null;
	}
	return value === "true" ? true : value === "false" ? false : null;
}

/** Takes an attribute of an element, if its component has a prop for it. */
function setAttribute(widget: r.Rid, name: string, value: string): boolean {
	const element = elements.get(widget);
	const kind = element ? registrations.get(element.tag)?.attributes[name] : undefined;
	if (!element || !kind) {
		return false;
	}
	const prop = parse(kind, value);
	if (prop === null) {
		return false;
	}
	element.props = { ...element.props, [name]: prop };
	render(element);
	return true;
}

/** Unmounts the component of an element whose widget Raven destroys. */
function destroyed(widget: r.Rid): void {
	const element = elements.get(widget);
	elements.delete(widget);
	intos.delete(widget);
	try {
		element?.mounted?.mount.unmount();
	} finally {
		// (those in its tree went with it; those the component did not show are held by nothing)
		for (const child of element?.adopted ?? []) {
			if (r.Rwidget_is_valid(child) && r.Rwidget_get_parent(child) === r.R_INVALID_ID) {
				r.Rwidget_destroy(child);
			}
		}
	}
}

/** The pointers of the functions Raven calls for every registered tag and element. */
interface NativeCallbacks {
	readonly create: Pointer;
	readonly attribute: Pointer;
	readonly destroy: Pointer;
}

/** Made once and shared by every tag and element: a callback given to Raven stays alive for good. */
let callbacks: NativeCallbacks | null = null;

/** The pointers of the callbacks, made on first use. */
function nativeCallbacks(): NativeCallbacks {
	if (!callbacks) {
		const make = new JSCallback((tag: Pointer | null): number => {
			try {
				return create(tag ? new CString(tag).toString() : "");
			} catch (error) {
				console.error("raven-tsx: error making a registered tag:", error);
				return r.R_INVALID_ID;
			}
		}, { args: ["ptr", "ptr"], returns: "u32" });
		const attribute = new JSCallback((widget: number, name: Pointer | null, value: Pointer | null): number => {
			try {
				return name && value && setAttribute(widget, new CString(name).toString(), new CString(value).toString()) ? 1 : 0;
			} catch (error) {
				console.error("raven-tsx: error giving an attribute to a registered tag:", error);
				return 0;
			}
		}, { args: ["u32", "ptr", "ptr", "ptr"], returns: "i32" });
		const destroy = new JSCallback((widget: number): void => {
			try {
				destroyed(widget);
			} catch (error) {
				console.error("raven-tsx: error unmounting a registered tag:", error);
			}
		}, { args: ["u32", "ptr"], returns: "void" });
		if (!make.ptr || !attribute.ptr || !destroy.ptr) {
			RavenError.throw("raven-tsx: cannot make the callbacks of registered tags");
		}
		callbacks = { create: make.ptr, attribute: attribute.ptr, destroy: destroy.ptr };
	}
	return callbacks;
}

/** Registers `<Into>`, which every registered tag uses for its named places. */
function registerInto(): void {
	if (!r.Rxml_is_tag_registered(INTO)) {
		const { create: make, attribute } = nativeCallbacks();
		if (!r.Rxml_register_tag(INTO, make, attribute)) {
			RavenError.fromLibrary("registerTag: <Into>");
		}
	}
}

/**
 * Makes a component a tag Raven knows, built from XML as its own tags are: in documents, in
 * `Markup`, in files. Its attributes become props of the kinds given; the widgets of its children
 * are placed where it renders `children`, and those of `<Into Name="...">` where it renders the
 * prop of that name. Registering a name again replaces it. Returns what unregisters it. An
 * adapter calls this with what renders its components, and gives the application its own `registerTag`.
 */
export function registerTagWith<Component, P extends object, Node>(adapter: TagAdapter<Component>, name: string, component: Component, options: TagOptions<P, Node> = {}): () => void {
	if (name === INTO) {
		RavenError.throw(`registerTag: <${INTO}> is the tag of the named places of registered tags`);
	}
	registerInto();
	const { create: make, attribute } = nativeCallbacks();
	if (!r.Rxml_register_tag(name, make, attribute)) {
		RavenError.fromLibrary(`registerTag(${JSON.stringify(name)})`);
	}
	const registration: Registration = {
		mount: (props, container) => adapter.mount(component, props, container),
		attributes: Object.fromEntries(Object.entries(options.attributes ?? {}).filter((entry): entry is [string, AttributeKind] => typeof entry[1] === "string")),
		slots: new Set(options.slots?.map(String)),
	};
	registrations.set(name, registration);
	return () => {
		if (registrations.get(name) === registration) {
			registrations.delete(name);
			r.Rxml_unregister_tag(name);
		}
	};
}
