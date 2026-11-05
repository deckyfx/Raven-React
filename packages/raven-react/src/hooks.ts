import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import * as r from "./raven";
import { actionEvents, eventScope } from "./events";
import { RavenError } from "./errors";
import { frameSlot, type FrameHandler } from "./frame";
import type { WindowInstance } from "./window-instance";

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

/**
 * The function of the last commit, for a native callback to call. Not of the last render: React
 * can throw a render away, and then its function would see state that never was.
 */
function useLatest<T>(value: T): RefObject<T> {
	const latest = useRef(value);
	useLayoutEffect(() => {
		latest.current = value;
	});
	return latest;
}

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
		RavenError.throw(`raven-react: no key in the shortcut "${keys}"`);
	}
	return { key, modifiers };
}

/**
 * Gives a name to a function, for what fires actions by name: `Rwidget_set_action`, the
 * `Action` of a widget made from XML, `Raction_fire`. The function can change at each render.
 * It receives the widget that fired the action.
 */
export function useAction(name: string, handler: (sender: r.Rid) => void): void {
	const latest = useLatest(handler);
	useEffect(() => {
		actionEvents.bind(name, (sender) => latest.current(sender));
		return () => actionEvents.unbind(name);
	}, [name]);
}

let nextShortcut = 0;

/** A keyboard shortcut of a window: `useShortcut(window, "Ctrl+S", save)`, with `window` the ref of a `<Window>`. */
export function useShortcut(window: RefObject<WindowInstance | null>, keys: string, handler: () => void): void {
	const latest = useLatest(handler);
	useEffect(() => {
		const owner = window.current;
		if (!owner) {
			return;
		}
		const { key, modifiers } = parseKeys(keys);
		const name = `raven-react.shortcut.${++nextShortcut}`;
		actionEvents.bind(name, () => latest.current());
		r.Rwindow_register_shortcut(owner.window, key, modifiers, name);
		return () => {
			if (owner.isOpen) {
				r.Rwindow_unregister_shortcut(owner.window, key, modifiers);
			}
			actionEvents.unbind(name);
		};
	}, [window, keys]);
}

/**
 * A function called once per frame, before the layout, with the seconds since the last frame:
 * what it changes is committed in time for that frame. It also runs when nothing is happening,
 * about 60 times a second: `runApp` wakes that often so that Bun's timers run beside Raven, which
 * `Rwait_frame(-1)` would stop. Any number of them can live side by side, and with
 * `Rset_frame_callback`. The function can change at each render.
 */
export function useFrame(handler: FrameHandler): void {
	const latest = useLatest(handler);
	useEffect(() => frameSlot.subscribe((delta) => eventScope.run(() => latest.current(delta))), []);
}
