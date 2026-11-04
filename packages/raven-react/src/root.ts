import type { ReactNode } from "react";
import { ConcurrentRoot } from "react-reconciler/constants";
import * as r from "./raven";
import type { WindowOptions } from "./components.generated";
import { RavenError } from "./errors";
import { reconciler } from "./host-config";
import { escapeXml, resolveProps, type RavenProps } from "./props";
import { WidgetInstance } from "./widget-instance";

/** Where the widgets of a window go. Its size is the size of the window. */
const CONTENT_NAME = "raven-react.content";

/** Says what a component threw during a render or an effect. */
function report(error: unknown): void {
	console.error("raven-react: error in a component:", error);
}

/** A tree of React rendered into a widget, as `createRoot` of ReactDOM into a DOM element. */
export class RavenRoot {
	private readonly root: ReturnType<typeof reconciler.createContainer>;

	constructor(parent: r.Rid) {
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

/** Makes a window with a place for a tree, and returns the handle of the window with its root. */
export function createWindow(options: WindowOptions = {}): { window: r.Rid; root: RavenRoot } {
	const { attributes } = resolveProps(options as RavenProps);
	const text = [...attributes].map(([name, value]) => `${name}="${escapeXml(value)}"`).join(" ");
	const window = r.Rwindow_create_from_xml(`<Window ${text}><VBox Name="${CONTENT_NAME}"/></Window>`);
	if (window === r.R_INVALID_ID) {
		RavenError.fromLibrary("Raven cannot make the window");
	}
	return { window, root: new RavenRoot(r.Rwidget_find(window, CONTENT_NAME)) };
}

/**
 * Starts Raven, shows a tree in a window and runs until the window closes, the event loop of
 * Bun running beside it. Then the effects are cleaned up and Raven stops.
 */
export async function runApp(element: ReactNode, options: WindowOptions = {}): Promise<void> {
	if (!r.Rinit(r.R_BACKEND_VULKAN)) {
		RavenError.fromLibrary("Raven cannot start");
	}
	const { root } = createWindow(options);
	root.render(element);
	await r.runLoop();
	root.unmount();
	r.Rshutdown();
}
