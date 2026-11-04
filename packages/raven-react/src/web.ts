/**
 * Web pages in a widget: `raven_web.h`, which is not in the binding, as a library can be built
 * without it (`-DRAVEN_BUILD_WEB=OFF`) and the binding needs all it declares in order to start.
 * So nothing is opened here until it is asked for.
 *
 *     await runApp(<WebView Url="https://example.com" Slot={{ Fill: 1 }} />, options, { setup: registerWebView });
 */

import { dlopen } from "bun:ffi";
import * as r from "./raven";
import { Custom, tag } from "./components.generated";
import { RavenError } from "./errors";

const SYMBOLS = {
	Rweb_is_available: { args: [], returns: "i32" },
	Rweb_set_browser_path: { args: ["ptr"], returns: "void" },
	Rweb_get_browser_path: { args: [], returns: "cstring" },
	Rweb_set_profile_folder: { args: ["ptr"], returns: "void" },
	Rweb_set_browser_arguments: { args: ["ptr"], returns: "void" },
	Rweb_register_xml: { args: [], returns: "void" },
	Rweb_shutdown: { args: [], returns: "void" },
	Rweb_view_create: { args: [], returns: "u32" },
	Rweb_view_is_valid: { args: ["u32"], returns: "i32" },
	Rweb_view_load_url: { args: ["u32", "ptr"], returns: "void" },
	Rweb_view_load_file: { args: ["u32", "ptr"], returns: "void" },
	Rweb_view_load_html: { args: ["u32", "ptr", "ptr"], returns: "void" },
	Rweb_view_reload: { args: ["u32"], returns: "void" },
	Rweb_view_stop: { args: ["u32"], returns: "void" },
	Rweb_view_go_back: { args: ["u32"], returns: "void" },
	Rweb_view_go_forward: { args: ["u32"], returns: "void" },
	Rweb_view_can_go_back: { args: ["u32"], returns: "i32" },
	Rweb_view_can_go_forward: { args: ["u32"], returns: "i32" },
	Rweb_view_get_url: { args: ["u32"], returns: "cstring" },
	Rweb_view_get_title: { args: ["u32"], returns: "cstring" },
	Rweb_view_is_loading: { args: ["u32"], returns: "i32" },
	Rweb_view_is_ready: { args: ["u32"], returns: "i32" },
	Rweb_view_get_error: { args: ["u32"], returns: "cstring" },
	Rweb_view_get_texture: { args: ["u32"], returns: "u32" },
	Rweb_view_set_zoom: { args: ["u32", "f32"], returns: "void" },
	Rweb_view_get_zoom: { args: ["u32"], returns: "f32" },
	Rweb_view_set_frames: { args: ["u32", "i32", "i32"], returns: "void" },
	Rweb_view_run_javascript: { args: ["u32", "ptr", "ptr", "ptr"], returns: "void" },
	Rweb_view_set_message_callback: { args: ["u32", "ptr", "ptr"], returns: "void" },
	Rweb_view_set_event_callback: { args: ["u32", "ptr", "ptr"], returns: "void" },
} as const;

/** The props of every widget, and what `<WebView>` takes in XML. */
export type WebViewProps = Omit<Parameters<typeof Custom>[0], "OnPaint" | "OnMeasure" | "children"> & {
	readonly Url?: string;
	/** A file: it can also be given by `Url` as `file://...`. */
	readonly Source?: string;
	readonly Html?: string;
	readonly Zoom?: number;
	readonly Frames?: "Jpeg" | "Png";
	readonly Quality?: number;
	/** Fired when the page changes: read it through a ref, with `webFunctions`. */
	readonly OnChanged?: string | (() => void);
};

/** A page of the web, after `registerWebView`. */
export const WebView = tag<WebViewProps>("WebView");

let opened: ReturnType<typeof dlopen<typeof SYMBOLS>>["symbols"] | null = null;

/** The functions of `raven_web.h`, as bun:ffi gives them: a text is a `Buffer` that ends with a zero. */
export function webFunctions(): NonNullable<typeof opened> {
	if (!opened) {
		const library = process.env.RAVEN_LIBRARY;
		if (r.Rget_version() === null || !library) {
			RavenError.throw("raven-react: RAVEN_LIBRARY should say where the library is, and it does not");
		}
		try {
			opened = dlopen(library, SYMBOLS).symbols;
		} catch (error) {
			RavenError.throw(`raven-react: this library has no web pages: build Raven without -DRAVEN_BUILD_WEB=OFF (${error instanceof Error ? error.message : String(error)})`);
		}
	}
	return opened;
}

/** Makes `<WebView>` a tag Raven knows: once, after Raven started, as the `setup` of `runApp`. */
export function registerWebView(): void {
	webFunctions().Rweb_register_xml();
}
