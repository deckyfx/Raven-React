/**
 * Solid components as tags of Raven: what `<Widget Name="...">` does in XML, with a component.
 * The core does the part that speaks to Raven; this renders the component, a root of its own per
 * element, whose props follow what the element in XML gives.
 */

import { $PROXY, createComponent, createSignal, type Component, type JSX } from "solid-js";
import type * as r from "../core/raven";
import { registerTagWith, type TagAdapter, type TagContent, type TagOptions as CoreTagOptions } from "../core/tags";
import { SolidNode } from "./node";
import { RavenRoot } from "./root";

/** What a tag takes from its element. */
export type TagOptions<P> = CoreTagOptions<P, JSX.Element>;

/** What a registered component is given: its attributes, and its places with their widgets. */
type TagProps = Readonly<Record<string, string | number | boolean | JSX.Element>>;

/**
 * The props of a component, read from what its element gives now: a prop read in an effect or in
 * JSX follows the element. The widgets of its children are placed where it renders them.
 */
function propsOf(content: () => TagContent): TagProps {
	// (a widget keeps its node, so that Solid sees the same child and does not move it)
	const nodes = new Map<r.Rid, SolidNode>();
	const adopted = (widgets: readonly r.Rid[]): JSX.Element => {
		if (widgets.length === 0) {
			return undefined;
		}
		return widgets.map((widget) => {
			let node = nodes.get(widget);
			if (!node) {
				node = SolidNode.adopted(widget);
				nodes.set(widget, node);
			}
			return node as unknown as JSX.Element;
		});
	};
	const read = (): Record<string, string | number | boolean | JSX.Element> => {
		const { attributes, slots, children } = content();
		const places = Object.fromEntries(Object.entries(slots).map(([name, widgets]) => [name, adopted(widgets)]));
		return { ...attributes, ...places, children: adopted(children) };
	};
	// (`$PROXY` says to Solid that the keys can change: `splitProps` then reads through, and sees a key added later)
	return new Proxy({} as TagProps, {
		get: (_, key, receiver) => (key === $PROXY ? receiver : typeof key === "string" ? read()[key] : undefined),
		has: (_, key) => key === $PROXY || (typeof key === "string" && key in read()),
		ownKeys: () => Object.keys(read()),
		getOwnPropertyDescriptor: (_, key) => (typeof key === "string" && key in read() ? { configurable: true, enumerable: true, get: () => read()[key] } : undefined),
	});
}

/** Renders a registered component in a root of its own. */
const solidAdapter: TagAdapter<Component<TagProps>> = {
	mount(component, content, container) {
		const [current, setCurrent] = createSignal(content, { equals: false });
		const props = propsOf(current);
		const root = new RavenRoot(container);
		root.render(() => createComponent(component, props));
		return {
			update: (next) => setCurrent(next),
			unmount: () => root.unmount(),
		};
	},
};

/**
 * Makes a component a tag Raven knows, built from XML as its own tags are: in documents, in
 * `Markup`, in files. Its attributes become props of the kinds given; the widgets of its children
 * are placed where it renders `children`, and those of `<Into Name="...">` where it renders the
 * prop of that name. Registering a name again replaces it. Returns what unregisters it.
 */
export function registerTag<P extends object>(name: string, component: Component<P>, options: TagOptions<P> = {}): () => void {
	return registerTagWith<Component<TagProps>, P, JSX.Element>(solidAdapter, name, component as unknown as Component<TagProps>, options);
}
