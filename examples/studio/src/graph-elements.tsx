import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { raven, RavenRoot, type WidgetInstance } from "@decky.fx/raven-react";

/** The ref of the `<NodeGraph>` the elements of this file belong to. */
type GraphRef = RefObject<WidgetInstance | null>;

/** A pin of a node. A pin with no type links to anything. */
export interface PinSpec {
	readonly name: string;
	readonly label: string;
	readonly type?: string;
}

/** A node of the graph: what it starts with, since the user moves it and tints it. */
export interface NodeSpec {
	readonly name: string;
	readonly title: string;
	readonly x: number;
	readonly y: number;
	readonly color?: string;
	/** An image file shown before its title. */
	readonly icon?: string;
	readonly inputs?: readonly PinSpec[];
	readonly outputs?: readonly PinSpec[];
	/** Widgets inside the node, as React elements. */
	readonly content?: ReactNode;
	/** Selects the node once it exists. */
	readonly select?: boolean;
}

/** The red, green and blue of `#RRGGBB`, from 0 to 1. */
export function hexColor(hex: string): [number, number, number] {
	const value = Number.parseInt(hex.slice(1), 16);
	return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Adds the pins of one side of a node. */
function addPins(graph: raven.Rid, node: number, pins: readonly PinSpec[], add: typeof raven.Rnode_graph_add_input): void {
	for (const spec of pins) {
		raven.Rnode_graph_set_pin_name(graph, add(graph, node, spec.label, spec.type ?? null), spec.name);
	}
}

/** The shapes a pin can have. */
export type PinShape = "Circle" | "Ring" | "Square" | "Diamond" | "Triangle" | "Arrow";

/**
 * The color of the links and pins of a type, and the shape of its pins (a circle without one).
 * Goes before the nodes, in the children of `<NodeGraph>`.
 */
export function PinType({ graph, name, color, shape }: { graph: GraphRef; name: string; color: string; shape?: PinShape }): null {
	useEffect(() => {
		const owner = graph.current;
		if (owner) {
			raven.Rnode_graph_set_type_color(owner.widget, name, ...hexColor(color));
			// ("Default" gives back the shape of the graph)
			raven.Rnode_graph_set_type_style(owner.widget, name, "Shape", shape ?? "Default");
		}
	}, [graph, name, color, shape]);
	return null;
}

/**
 * A node, for the children of `<NodeGraph>`. Raven refuses a widget of the graph as the content
 * of a node, so the elements of `content` cannot be children of `<NodeGraph>`: they get a root
 * of their own, in a box the node takes. Context does not reach them, props and state do.
 *
 * The user can delete a node: Raven then destroys the box, and the owner of the specs
 * must drop this one (`Rnode_graph_set_removed_callback`).
 */
export function GraphNode({ graph, spec, onSelected }: { graph: GraphRef; spec: NodeSpec; onSelected: () => void }): null {
	const root = useRef<RavenRoot | null>(null);

	// (effects run after every ref of the tree is set, and in the order of the children)
	useEffect(() => {
		const id = graph.current?.widget;
		if (id === undefined) {
			return;
		}
		const node = raven.Rnode_graph_add_node(id, spec.title, spec.x, spec.y);
		raven.Rnode_graph_set_node_name(id, node, spec.name);
		addPins(id, node, spec.inputs ?? [], raven.Rnode_graph_add_input);
		addPins(id, node, spec.outputs ?? [], raven.Rnode_graph_add_output);
		if (spec.color) {
			raven.Rnode_graph_set_node_color(id, node, ...hexColor(spec.color));
		}
		if (spec.icon) {
			raven.Rnode_graph_set_node_style(id, node, "Icon", spec.icon);
		}
		if (spec.content) {
			const box = raven.Rwidget_create_from_xml(`<VBox Spacing="6"/>`);
			raven.Rnode_graph_set_node_content(id, node, box);
			root.current = new RavenRoot(box);
		}
		if (spec.select) {
			raven.Rnode_graph_select_node(id, node, raven.R_FALSE);
			onSelected();
		}
		return () => {
			root.current?.unmount();
			root.current = null;
			// (without a ref, the whole graph is going away. A node the user deleted is known no more: this does nothing)
			const owner = graph.current;
			if (owner) {
				raven.Rnode_graph_remove_node(owner.widget, node);
			}
		};
		// A spec says how a node starts. What happens to it afterwards is the graph's.
	}, [graph]);

	useEffect(() => {
		root.current?.render(spec.content);
	}, [spec.content]);

	return null;
}

/** A link the graph starts with, once. Goes after the nodes, in the children of `<NodeGraph>`. */
export function GraphLink({ graph, from, to }: { graph: GraphRef; from: string; to: string }): null {
	useEffect(() => {
		const id = graph.current?.widget;
		if (id === undefined) {
			return;
		}
		const [fromNode = "", fromPin = ""] = from.split(".");
		const [toNode = "", toPin = ""] = to.split(".");
		raven.Rnode_graph_connect(
			id,
			raven.Rnode_graph_find_pin(id, raven.Rnode_graph_find_node(id, fromNode), fromPin),
			raven.Rnode_graph_find_pin(id, raven.Rnode_graph_find_node(id, toNode), toPin),
		);
	}, [graph, from, to]);
	return null;
}

/** Whether a path of links leads from a node to another. Each node is looked at once, however long the path. */
export function reaches(graph: raven.Rid, node: number, target: number): boolean {
	const seen = new Set<number>();
	const pending = [node];
	for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
		if (current === target) {
			return true;
		}
		if (seen.has(current)) {
			continue;
		}
		seen.add(current);
		for (let index = 0; ; index++) {
			const output = raven.Rnode_graph_get_output(graph, current, index);
			if (!output) {
				break;
			}
			for (let k = 0; k < raven.Rnode_graph_get_link_count(graph); k++) {
				const link = raven.Rnode_graph_get_link(graph, k);
				if (raven.Rnode_graph_get_link_output(graph, link) === output) {
					pending.push(raven.Rnode_graph_get_pin_node(graph, raven.Rnode_graph_get_link_input(graph, link)));
				}
			}
		}
	}
	return false;
}
