/**
 * What Raven tells the application, as plain subscriptions: each returns the function that stops
 * it. An adapter wraps these in what its framework offers, the hooks of React for one.
 */

import * as r from "./raven";
import { RavenError } from "./errors";
import { actionEvents, eventScope } from "./events";
import { frameSlot, type FrameHandler } from "./frame";

const MODIFIERS: Readonly<Record<string, number>> = {
	ctrl: r.R_MOD_CTRL,
	control: r.R_MOD_CTRL,
	shift: r.R_MOD_SHIFT,
	alt: r.R_MOD_ALT,
	super: r.R_MOD_SUPER,
	cmd: r.R_MOD_SUPER,
};

/** Keys that are not spelled as in `R_KEY_...`. */
const KEY_NAMES: Readonly<Record<string, string>> = { esc: "ESCAPE", del: "DELETE", return: "ENTER", pgup: "PAGE_UP", pgdn: "PAGE_DOWN" };

/** Reads `"Ctrl+Shift+S"` or `"F5"` into a key and its modifiers. */
export function parseKeys(keys: string): { key: r.RKey; modifiers: number } {
	let modifiers = 0;
	let key: r.RKey | undefined;
	for (const part of keys.split("+")) {
		const name = part.trim().toLowerCase();
		const modifier = MODIFIERS[name];
		if (modifier !== undefined) {
			modifiers |= modifier;
		} else {
			key = r.RKey[`R_KEY_${KEY_NAMES[name] ?? name.toUpperCase()}` as keyof typeof r.RKey];
		}
	}
	if (key === undefined) {
		RavenError.throw(`raven-tsx: no key in the shortcut "${keys}"`);
	}
	return { key, modifiers };
}

/**
 * Gives a name to a function, for what fires actions by name: `Rwidget_set_action`, the
 * `Action` of a widget made from XML, `Raction_fire`. It receives the widget that fired the
 * action. Returns what takes the name away.
 */
export function onAction(name: string, handler: (sender: r.Rid) => void): () => void {
	actionEvents.bind(name, handler);
	return () => actionEvents.unbind(name);
}

let nextShortcut = 0;

/** A keyboard shortcut of a window: `onShortcut(window, "Ctrl+S", save)`. Returns what takes it away. */
export function onShortcut(window: r.Rid, keys: string, handler: () => void): () => void {
	const { key, modifiers } = parseKeys(keys);
	const name = `raven-tsx.shortcut.${++nextShortcut}`;
	actionEvents.bind(name, () => handler());
	r.Rwindow_register_shortcut(window, key, modifiers, name);
	return () => {
		// (the window can be gone already: without an `OnClose`, the user closes it at any time)
		if (r.Rwindow_is_valid(window) !== 0) {
			r.Rwindow_unregister_shortcut(window, key, modifiers);
		}
		actionEvents.unbind(name);
	};
}

/**
 * A function called once per frame, before the layout, with the seconds since the last frame:
 * what it changes is committed in time for that frame. Any number of them can live side by side,
 * and with `Rset_frame_callback`. Returns what takes it away.
 */
export function onFrame(handler: FrameHandler): () => void {
	return frameSlot.subscribe((delta) => eventScope.run(() => handler(delta)));
}
