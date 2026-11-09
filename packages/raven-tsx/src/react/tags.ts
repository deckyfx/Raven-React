/**
 * React components as tags of Raven: what `<Widget Name="...">` does in XML, with a component.
 * The core does the part that speaks to Raven; this renders the component, a root of its own per
 * element, so context does not reach it from the tree around it.
 */

import { createElement, type ComponentType, type ReactNode } from "react";
import * as r from "../core/raven";
import { registerTagWith, type TagAdapter, type TagContent, type TagOptions as CoreTagOptions } from "../core/tags";
import { ADOPTED_TAG } from "../core/widget-instance";
import { RavenRoot } from "./root";

/** What a tag takes from its element. */
export type TagOptions<P> = CoreTagOptions<P, ReactNode>;

/** What a registered component is given: its attributes, and its places with their widgets. */
type TagProps = Readonly<Record<string, string | number | boolean | ReactNode>>;

/** The elements of adopted widgets, in their order. */
function adopted(widgets: readonly r.Rid[]): ReactNode {
	return widgets.length === 0 ? undefined : widgets.map((widget) => createElement(ADOPTED_TAG, { key: widget, widget }));
}

/** The element of a component, with what its element in XML gives it. */
function elementOf(component: ComponentType<TagProps>, content: TagContent): ReactNode {
	const slots = Object.fromEntries(Object.entries(content.slots).map(([name, widgets]) => [name, adopted(widgets)]));
	return createElement(component, { ...content.attributes, ...slots, children: adopted(content.children) });
}

/** Renders a registered component in a root of its own. */
const reactAdapter: TagAdapter<ComponentType<TagProps>> = {
	mount(component, props, container) {
		const root = new RavenRoot(container);
		root.render(elementOf(component, props));
		return {
			update: (next) => root.render(elementOf(component, next)),
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
export function registerTag<P extends object>(name: string, component: ComponentType<P>, options: TagOptions<P> = {}): () => void {
	return registerTagWith<ComponentType<TagProps>, P, ReactNode>(reactAdapter, name, component as ComponentType<TagProps>, options);
}
