import { createElement, type ReactNode, type ReactPortal } from "react";
import { ConcurrentRoot } from "react-reconciler/constants";
import * as r from "./raven";
import { Window, type WindowOptions } from "./components.generated";
import { RavenError } from "./errors";
import { reconciler } from "./host-config";
import { resolveProps, type RavenProps } from "./props";
import { WidgetInstance } from "./widget-instance";
import { makeWindow } from "./window-instance";

/** Says what a component threw during a render or an effect. */
function report(error: unknown): void {
	console.error("raven-react: error in a component:", error);
}

/**
 * A tree of React, as `createRoot` of ReactDOM. Given a widget, it renders into it.
 * Without one, it renders `<Window>` elements, each its own window.
 */
export class RavenRoot {
	private readonly root: ReturnType<typeof reconciler.createContainer>;

	constructor(parent: r.Rid = r.R_INVALID_ID) {
		this.root = reconciler.createContainer(
			WidgetInstance.forContainer(parent), ConcurrentRoot, null, false, null, "raven-react", report, report, report, () => {}, null,
		);
	}

	/** Renders or updates the tree. */
	render(element: ReactNode): void {
		reconciler.updateContainer(element, this.root, null, null);
	}

	/** Removes the tree and runs the cleanups of its effects, now. */
	unmount(): void {
		reconciler.updateContainerSync(null, this.root, null, null);
		reconciler.flushSyncWork();
		reconciler.flushPassiveEffects();
	}
}

/** What portals render into, by handle: React takes a container that changes as another place. */
const portalContainers = new Map<r.Rid, WidgetInstance>();

/**
 * Renders children into a widget outside this part of the tree, as `createPortal` of ReactDOM:
 * context goes on as if they were here, which a second `RavenRoot` cannot do. For a widget given
 * to Raven by hand, the content of a graph node for one:
 *
 *     const [box] = useState(() => raven.Rwidget_create_from_xml("<VBox/>"));
 *     useLayoutEffect(() => raven.Rnode_graph_set_node_content(graph, node, box), [graph, node, box]);
 *     return createPortal(<Button>Run</Button>, box);
 *
 * What holds the widget owns it: the portal only adds and removes the children.
 */
export function createPortal(children: ReactNode, widget: r.Rid, key: string | null = null): ReactPortal {
	for (const id of portalContainers.keys()) {
		if (!r.Rwidget_is_valid(id)) {
			portalContainers.delete(id);
		}
	}
	let container = portalContainers.get(widget);
	if (!container) {
		container = WidgetInstance.forContainer(widget);
		portalContainers.set(widget, container);
	}
	return reconciler.createPortal(children, container, null, key);
}

/** Makes a window with a place for a tree, and returns the handle of the window with its root. */
export function createWindow(options: WindowOptions = {}): { window: r.Rid; root: RavenRoot } {
	const { window, content } = makeWindow(resolveProps(options as RavenProps).attributes);
	return { window, root: new RavenRoot(content) };
}

/** How `runApp` starts Raven. */
export interface RunOptions {
	/** The name of the application: `RInitDesc::app_name`, which system notifications show. */
	readonly appName?: string;
	/** Runs after Raven started and before the first render: for a look, a theme, a registered tag. */
	readonly setup?: () => void;
	/** Raven's allocator: functions of C only, as it allocates on several threads. See `Rset_allocator`. */
	readonly allocator?: Parameters<typeof r.Rset_allocator>[0];
}

/**
 * Starts Raven, shows a tree and runs until the last window closes, the event loop of Bun
 * running beside it. Then the effects are cleaned up and Raven stops.
 *
 * With options, the tree goes in one window made from them. Without, the tree says what
 * windows there are, with `<Window>` elements.
 */
export async function runApp(element: ReactNode, options?: WindowOptions, start?: RunOptions): Promise<void> {
	if (start?.allocator) {
		r.Rset_allocator(start.allocator);
	}
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_VULKAN;
	desc.app_name = start?.appName ?? null;
	if (!r.Rinit_ex(desc)) {
		RavenError.fromLibrary("Raven cannot start");
	}
	start?.setup?.();
	const root = new RavenRoot();
	root.render(options ? createElement(Window, options, element) : element);
	// (the first commit makes the windows, and Rwait_frame ends at once when there are none)
	reconciler.flushSyncWork();
	await r.runLoop();
	root.unmount();
	r.Rshutdown();
}
