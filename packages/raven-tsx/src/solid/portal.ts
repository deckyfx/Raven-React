import { onCleanup, untrack, type JSX } from "solid-js";
import type * as r from "../core/raven";
import { SolidNode } from "./node";
import { insert } from "./renderer";

/**
 * Renders its children into a widget outside this part of the tree, as `<Portal>` of solid-js/web:
 * context goes on as if they were here, which a second `RavenRoot` cannot do. For a widget given
 * to Raven by hand, the content of a graph node for one:
 *
 *     const box = raven.Rwidget_create_from_xml("<VBox/>");
 *     onMount(() => raven.Rnode_graph_set_node_content(graph.widget, node, box));
 *     return <Portal widget={box}><Button>Run</Button></Portal>;
 *
 * What holds the widget owns it: the portal only adds and removes the children. The widget is the
 * one it was first given.
 */
export function Portal(props: { readonly widget: r.Rid; readonly children?: JSX.Element | undefined }): JSX.Element {
	const container = SolidNode.container(untrack(() => props.widget));
	insert(container, () => props.children);
	onCleanup(() => container.clear());
	return undefined;
}
