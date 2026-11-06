/**
 * The functions of raven_web this example uses, declared here through bun:ffi.
 *
 * The binding of raven-react has no raven_web.h, but the functions are in the same library
 * (`nm -D libraven.so | grep Rweb_`). Importing the package first is what makes
 * `RAVEN_LIBRARY` say where that library is: see `native.ts` of the package.
 */

import "@decky.fx/raven-react";
import { CString, JSCallback, dlopen, type Pointer } from "bun:ffi";

/** What the library is told a view is: the handle of its widget. */
type ViewId = number;

const library = process.env.RAVEN_LIBRARY;
if (!library) {
	throw new Error("raven-react did not say where its native library is (RAVEN_LIBRARY)");
}

const { symbols: web } = dlopen(library, {
	Rweb_register_xml: { args: [], returns: "void" },
	Rweb_is_available: { args: [], returns: "i32" },
	Rweb_view_is_valid: { args: ["u32"], returns: "i32" },
	Rweb_view_load_url: { args: ["u32", "ptr"], returns: "void" },
	Rweb_view_load_file: { args: ["u32", "ptr"], returns: "void" },
	Rweb_view_reload: { args: ["u32"], returns: "void" },
	Rweb_view_go_back: { args: ["u32"], returns: "void" },
	Rweb_view_go_forward: { args: ["u32"], returns: "void" },
	Rweb_view_can_go_back: { args: ["u32"], returns: "i32" },
	Rweb_view_can_go_forward: { args: ["u32"], returns: "i32" },
	Rweb_view_get_url: { args: ["u32"], returns: "cstring" },
	Rweb_view_get_title: { args: ["u32"], returns: "cstring" },
	Rweb_view_is_loading: { args: ["u32"], returns: "i32" },
	Rweb_view_get_error: { args: ["u32"], returns: "cstring" },
	Rweb_view_set_zoom: { args: ["u32", "f32"], returns: "void" },
	Rweb_view_run_javascript: { args: ["u32", "ptr", "ptr", "ptr"], returns: "void" },
	Rweb_view_set_event_callback: { args: ["u32", "ptr", "ptr"], returns: "void" },
	Rweb_view_set_message_callback: { args: ["u32", "ptr", "ptr"], returns: "void" },
});

/** A text as the library reads it. */
function cText(text: string): Buffer {
	return Buffer.from(`${text}\0`);
}

/** Makes `<WebView>` a tag Raven knows, so the renderer can make it. Once, after Raven started. */
export function registerWebView(): void {
	web.Rweb_register_xml();
}

/** Whether a browser of the Chromium family that can be driven was found. */
export function isBrowserAvailable(): boolean {
	return web.Rweb_is_available() !== 0;
}

/** Goes to an address. */
export function loadUrl(view: ViewId, url: string): void {
	web.Rweb_view_load_url(view, cText(url));
}

/** Shows a file of the computer. */
export function loadFile(view: ViewId, path: string): void {
	web.Rweb_view_load_file(view, cText(path));
}

/** Loads the page again. */
export function reload(view: ViewId): void {
	web.Rweb_view_reload(view);
}

/** Goes one page back in the history of the view. */
export function goBack(view: ViewId): void {
	web.Rweb_view_go_back(view);
}

/** Goes one page forward in the history of the view. */
export function goForward(view: ViewId): void {
	web.Rweb_view_go_forward(view);
}

/** Sets the size of the content of the page: 1 is as the page asks. */
export function setZoom(view: ViewId, zoom: number): void {
	web.Rweb_view_set_zoom(view, zoom);
}

/** Runs JavaScript in the page, with no interest in its result. */
export function runJavaScript(view: ViewId, script: string): void {
	web.Rweb_view_run_javascript(view, cText(script), null, null);
}

/** What the application shows about a page. */
export interface PageState {
	readonly url: string;
	readonly title: string;
	readonly loading: boolean;
	/** What went wrong, or "". */
	readonly error: string;
	readonly canGoBack: boolean;
	readonly canGoForward: boolean;
}

/** Reads the state of the page of a view. The texts are copied: C keeps its own only until they change. */
export function readPage(view: ViewId): PageState {
	return {
		url: web.Rweb_view_get_url(view)?.toString() ?? "",
		title: web.Rweb_view_get_title(view)?.toString() ?? "",
		loading: web.Rweb_view_is_loading(view) !== 0,
		error: web.Rweb_view_get_error(view)?.toString() ?? "",
		canGoBack: web.Rweb_view_can_go_back(view) !== 0,
		canGoForward: web.Rweb_view_can_go_forward(view) !== 0,
	};
}

/** `R_WEB_EVENT_LOADED` of `raven_web.h`: the page and what it needs are loaded. */
export const WEB_EVENT_LOADED = 0x04a3;

/**
 * Listens to a view: `onEvent` with the `R_WEB_EVENT_` of what happened in the page, `onMessage` with what the
 * page sends by `window.raven.postMessage`. The function returned stops it.
 */
export function listen(view: ViewId, onEvent: (event: number) => void, onMessage: (message: string) => void): () => void {
	const event = new JSCallback((_view: number, kind: number): void => onEvent(kind), { args: ["u32", "i32", "ptr"], returns: "void" });
	let message: JSCallback | null = null;
	try {
		message = new JSCallback(
			(_view: number, text: Pointer | null): void => onMessage(text ? new CString(text).toString() : ""),
			{ args: ["u32", "ptr", "ptr"], returns: "void" },
		);
		web.Rweb_view_set_event_callback(view, event.ptr, null);
		web.Rweb_view_set_message_callback(view, message.ptr, null);
	} catch (error) {
		// (nothing is listening then: the callbacks made so far are freed, and Raven is given none of them)
		if (web.Rweb_view_is_valid(view)) {
			web.Rweb_view_set_event_callback(view, null, null);
			web.Rweb_view_set_message_callback(view, null, null);
		}
		event.close();
		message?.close();
		throw error;
	}
	const registered = message;
	return () => {
		// (the view may be gone already, with its window)
		if (web.Rweb_view_is_valid(view)) {
			web.Rweb_view_set_event_callback(view, null, null);
			web.Rweb_view_set_message_callback(view, null, null);
		}
		event.close();
		registered.close();
	};
}
