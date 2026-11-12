/**
 * What React has as hooks, for Solid: each lasts as long as the component (or the root) that
 * calls it, and goes with its cleanup.
 */

import { createEffect, onCleanup } from "solid-js";
import type * as r from "../core/raven";
import type { FrameHandler } from "../core/frame";
import { onAction, onFrame, onShortcut } from "../core/subscriptions";
import type { WindowInstance } from "../core/window-instance";

/**
 * Gives a name to a function, for what fires actions by name: `Rwidget_set_action`, the
 * `Action` of a widget made from XML, `Raction_fire`. It receives the widget that fired the action.
 */
export function createAction(name: string, handler: (sender: r.Rid) => void): void {
	onCleanup(onAction(name, handler));
}

/**
 * A keyboard shortcut of a window: `createShortcut(() => window, "Ctrl+S", save)`, with `window`
 * set by the `ref` of a `<Window>`. It starts once the window is open. With a signal for the ref
 * (`<Window ref={setWindow}>`, `createShortcut(window, ...)`), it follows a window that comes later.
 */
export function createShortcut(window: () => WindowInstance | null | undefined, keys: string, handler: () => void): void {
	createEffect(() => {
		const owner = window();
		if (!owner) {
			return;
		}
		let stop: (() => void) | null = null;
		const cancel = owner.whenOpen(() => {
			stop = onShortcut(owner.window, keys, handler);
		});
		onCleanup(() => {
			cancel();
			stop?.();
		});
	});
}

/**
 * A function called once per frame, before the layout, with the seconds since the last frame. It
 * also runs when nothing is happening, about 60 times a second: `runApp` wakes that often so that
 * Bun's timers run beside Raven. Any number of them can live side by side, and with `Rset_frame_callback`.
 */
export function createFrame(handler: FrameHandler): void {
	onCleanup(onFrame(handler));
}
