/**
 * Solid's renderer for Raven: what TSX compiled for Solid calls (`createElement`, `insert`,
 * `spread`...). The plugin of `@decky.fx/raven-tsx/solid/plugin` compiles it to import from here;
 * an application imports `@decky.fx/raven-tsx/solid`.
 */

import { createRenderer } from "solid-js/universal";
import { SolidNode } from "./node";

export const {
	render,
	effect,
	memo,
	createComponent,
	createElement,
	createTextNode,
	insertNode,
	insert,
	spread,
	setProp,
	mergeProps,
	use,
} = createRenderer<SolidNode>({
	createElement: (tag) => SolidNode.element(tag),
	createTextNode: (value) => SolidNode.text(value),
	replaceText: (node, value) => node.setText(value),
	isTextNode: (node) => node.isText,
	setProperty: (node, name, value) => node.setProp(name, value),
	insertNode: (parent, node, anchor) => parent.insert(node, anchor ?? null),
	removeNode: (parent, node) => parent.release(node),
	getParentNode: (node) => node.parent ?? undefined,
	getFirstChild: (node) => node.children[0],
	getNextSibling(node) {
		const siblings = node.parent?.children ?? [];
		return siblings[siblings.indexOf(node) + 1];
	},
});
