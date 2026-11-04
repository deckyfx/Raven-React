import { createElement, type ReactNode } from "react";
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

/** Makes a window with a place for a tree, and returns the handle of the window with its root. */
export function createWindow(options: WindowOptions = {}): { window: r.Rid; root: RavenRoot } {
	const { window, content } = makeWindow(resolveProps(options as RavenProps).attributes);
	return { window, root: new RavenRoot(content) };
}

/**
 * Starts Raven, shows a tree and runs until the last window closes, the event loop of Bun
 * running beside it. Then the effects are cleaned up and Raven stops.
 *
 * With options, the tree goes in one window made from them. Without, the tree says what
 * windows there are, with `<Window>` elements.
 */
export async function runApp(element: ReactNode, options?: WindowOptions): Promise<void> {
	if (!r.Rinit(r.R_BACKEND_VULKAN)) {
		RavenError.fromLibrary("Raven cannot start");
	}
	const root = new RavenRoot();
	root.render(options ? createElement(Window, options, element) : element);
	// (the first commit makes the windows, and Rwait_frame ends at once when there are none)
	reconciler.flushSyncWork();
	await r.runLoop();
	root.unmount();
	r.Rshutdown();
}
