/**
 * Solid components as tags of Raven: what `<Widget Name="...">` does in XML, with a component.
 * The core does the part that speaks to Raven; this renders the component, a root of its own per
 * element, whose props follow what the element in XML gives.
 */

import { $PROXY, createComponent, createRoot, createSignal, getOwner, runWithOwner, type Component, type JSX, type Owner } from "solid-js";
import type * as r from "../core/raven";
import { registerTagWith, type TagAdapter, type TagContent, type TagOptions as CoreTagOptions } from "../core/tags";
import { RavenError } from "../core/errors";
import { SolidNode } from "./node";
import { RavenRoot } from "./root";

/** What a tag takes from its element. */
export type TagOptions<P> = CoreTagOptions<P, JSX.Element>;

/** What a registered component is given: its attributes, and its places with their widgets. */
type TagProps = Readonly<Record<string, string | number | boolean | JSX.Element>>;

/**
 * The props of a component, read from what its element gives now: a prop read in an effect or in
 * JSX follows the element. The widgets of its children are placed where it renders them.
 * Their nodes belong to `owner`, which lasts as long as the element: hiding one does not delete it.
 */
function propsOf(content: () => TagContent, owner: Owner | null): TagProps {
	// (a widget keeps its node, so that Solid sees the same child and does not move it)
	const nodes = new Map<r.Rid, SolidNode>();
	const adopted = (widgets: readonly r.Rid[]): JSX.Element => {
		if (widgets.length === 0) {
			return undefined;
		}
		return widgets.map((widget) => {
			let node = nodes.get(widget);
			if (!node) {
				// (not the owner of what reads `children`: `{shown() && props.children}` would delete it when hidden)
				const made = runWithOwner(owner, () => SolidNode.adopted(widget));
				// (Solid gives nothing back when what it ran threw to a boundary of the owner, which has none)
				if (!made) {
					RavenError.throw("raven-tsx: the child of a registered tag could not be adopted");
				}
				node = made;
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
		// (the nodes of its children: they go after the tree, those it holds deleted with it, the others then)
		const [owner, disposeNodes] = createRoot((dispose) => [getOwner(), dispose] as const);
		const props = propsOf(current, owner);
		const root = new RavenRoot(container);
		root.render(() => createComponent(component, props));
		return {
			update: (next) => setCurrent(next),
			unmount: () => {
				try {
					root.unmount();
				} finally {
					disposeNodes();
				}
			},
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
