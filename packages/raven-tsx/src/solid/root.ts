import { createComponent, createRoot, getOwner, type JSX, type Owner } from "solid-js";
import * as r from "../core/raven";
import { RavenError } from "../core/errors";
import { resolveProps, type RavenProps } from "../core/props";
import type { WindowOptions } from "../core/props.generated";
import { makeWindow } from "../core/window-instance";
import { Window } from "./components.generated";
import { SolidNode } from "./node";
import { insert } from "./renderer";
import { stopLeft, trackRoot } from "./teardown";

/**
 * A tree of Solid, as `render` of solid-js/web. Given a widget, it renders into it.
 * Without one, it renders `<Window>` elements, each its own window.
 */
export class RavenRoot {
	private readonly node: SolidNode;
	private dispose: (() => void) | null = null;
	/** The owner of the tree, which keeps what it subscribed to in Raven: see `teardown`. */
	private owner: Owner | null = null;

	constructor(parent: r.Rid = r.R_INVALID_ID) {
		this.node = SolidNode.container(parent);
	}

	/**
	 * Renders a tree, in place of the one it had. If the tree throws, what it made goes (its cleanups
	 * run, its widgets go) and the error goes on. (as Solid's `render`, but the root is kept before the
	 * code runs: `render` gives it back only once the code has returned)
	 */
	render(code: () => JSX.Element): void {
		this.unmount();
		// (a cleanup may have rendered a tree again: this render replaces that one too)
		while (this.dispose !== null) {
			this.unmount();
		}
		let own: (() => void) | null = null;
		try {
			createRoot((dispose) => {
				own = dispose;
				this.dispose = dispose;
				this.owner = getOwner();
				if (this.owner) {
					trackRoot(this.owner);
				}
				const view = code();
				// (a render in the code replaced this one, its root with it: what it made went then)
				if (this.dispose === dispose) {
					insert(this.node, view);
				}
			});
		} catch (error) {
			try {
				// (a render in the code that failed replaced it: that tree stays, this one went then)
				if (this.dispose === own) {
					this.unmount();
				}
			} catch (cleanup) {
				console.error("raven-tsx: cleaning up a tree that failed:", cleanup);
			}
			throw error;
		}
	}

	/** Removes the tree: its cleanups run, and its widgets and windows go. */
	unmount(): void {
		const dispose = this.dispose;
		const owner = this.owner;
		this.dispose = null;
		this.owner = null;
		try {
			dispose?.();
		} finally {
			// (what it subscribed to stops, also what a cleanup that threw kept from stopping)
			if (owner) {
				stopLeft(owner);
			}
			// (the widgets and windows go, also when a cleanup threw. Unless a cleanup rendered a tree
			// again: that one stays, and it took this one away first)
			if (this.dispose === null) {
				this.node.clear();
			}
		}
	}
}

/** Makes a window with a place for a tree, and returns the handle of the window with its root. */
export function createWindow(options: WindowOptions = {}): { window: r.Rid; root: RavenRoot } {
	const { window, content } = makeWindow(resolveProps(options as RavenProps).attributes);
	return { window, root: new RavenRoot(content) };
}

/** How `runApp` starts Raven. */
export interface RunOptions {
	/** The name of the application: `RInitDesc::app_name`, which system notifications show. */
	readonly appName?: string | undefined;
	/** Runs after Raven started and before the first render: for a look, a theme, a registered tag. */
	readonly setup?: (() => void) | undefined;
	/** Raven's allocator: functions of C only, as it allocates on several threads. See `Rset_allocator`. */
	readonly allocator?: Parameters<typeof r.Rset_allocator>[0] | undefined;
}

/**
 * Starts Raven, shows a tree and runs until the last window closes, the event loop of Bun
 * running beside it. Then the tree is cleaned up and Raven stops, also when the run ends with an
 * error, so that it can start again.
 *
 * With options, the tree goes in one window made from them. Without, the tree says what windows
 * there are, with `<Window>` elements.
 *
 *     await runApp(() => <App />, { Title: "Hello", Width: 480, Height: 240 });
 */
export async function runApp(code: () => JSX.Element, options?: WindowOptions, start?: RunOptions): Promise<void> {
	if (start?.allocator) {
		r.Rset_allocator(start.allocator);
	}
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_VULKAN;
	desc.app_name = start?.appName ?? null;
	if (!r.Rinit_ex(desc)) {
		RavenError.fromLibrary("Raven cannot start");
	}
	let root: RavenRoot | null = null;
	try {
		start?.setup?.();
		root = new RavenRoot();
		root.render(options ? () => createComponent(Window, { ...options, get children() { return code(); } }) : code);
		// (Rwait_frame ends once the last window closed: until there was one, it goes on)
		await r.runLoop();
	} finally {
		try {
			root?.unmount();
		} finally {
			r.Rshutdown();
		}
	}
}
