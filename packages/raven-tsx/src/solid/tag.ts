/** How a tag of Raven becomes a Solid component: what the generated components are made with. */

import { splitProps, type JSX } from "solid-js";
import { WidgetInstance, type HostNode } from "../core/widget-instance";
import { SolidNode } from "./node";
import { spread } from "./renderer";

/** The props every component has from Solid. */
export interface SolidProps<R> {
	/** Receives the widget (or the window) as React's `ref` does: `WidgetInstance`, `WindowInstance`. */
	readonly ref?: R | ((instance: R) => void) | undefined;
	readonly children?: JSX.Element | undefined;
}

/**
 * A component for a tag of Raven, or one given to `Rxml_register_tag` with its props.
 * JSX takes a capitalized name for a component, not for a tag.
 */
export function tag<P extends object, R = WidgetInstance>(name: string): (props: P & SolidProps<R>) => JSX.Element {
	return (props) => {
		const node = SolidNode.element(name);
		const [local, others] = splitProps(props, ["ref"]);
		spread(node, others);
		// (Solid compiles `ref={variable}` to a function that sets the variable. As React's, it comes
		// once Raven has the widget, placed: a window comes at once, as it opens only when placed)
		const ref = local.ref;
		if (typeof ref === "function") {
			const give = (instance: HostNode): void => (ref as (instance: R) => void)(instance as R);
			node.withInstance((instance) => (instance instanceof WidgetInstance ? instance.whenPlaced(give) : give(instance)));
		}
		// (a node of Raven: Solid's JSX types know only the nodes of the DOM)
		return node as unknown as JSX.Element;
	};
}
