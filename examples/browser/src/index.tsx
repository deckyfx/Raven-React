/**
 * Web pages inside a Raven interface. The port of `examples/browser` of Raven.
 *
 * raven_web does not contain a browser: it drives one that is installed (Edge, Chrome,
 * Chromium...). Without one, the view says so. The binding has no raven_web.h: see `web.ts`.
 */

import { createElement, useEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { Button, ColorPicker, HBox, Label, raven, runApp, Separator, Slider, TextInput, VBox, type WidgetInstance } from "@decky.fx/raven-react";
import * as web from "./web";

const WELCOME_PAGE = `${import.meta.dir}/../assets/pages/welcome.html`;
/** The color of the picker at the start, the `--accent` the pages start with: #7C5CFF. */
const INITIAL_TINT = [124 / 255, 92 / 255, 1, 1] as const;

/** The props of a `<WebView>` this example uses. */
interface WebViewProps {
	readonly ref: RefObject<WidgetInstance | null>;
	readonly Source: string;
	readonly OnChanged: () => void;
	readonly Slot: { readonly Fill: number };
}

/**
 * The tag raven_web adds. Not a component of the package, whose list comes from Raven's schema;
 * the renderer makes any tag Raven knows, so one line is enough once `registerWebView` ran.
 */
function WebView(props: WebViewProps): ReactElement {
	return createElement("WebView", props);
}

/** An address without a scheme is a web site. */
function toUrl(text: string): string {
	return text.includes("://") || text.startsWith("about:") ? text : `https://${text}`;
}

function App(): ReactNode {
	const page = useRef<WidgetInstance>(null);
	const tint = useRef<WidgetInstance>(null);
	const messages = useRef(0);
	const [state, setState] = useState<web.PageState>({ url: "", title: "", loading: true, error: "", canGoBack: false, canGoForward: false });
	const [address, setAddress] = useState("");
	const [zoom, setZoom] = useState(1);
	const [log, setLog] = useState("*Nothing yet: press a button of the page.*");
	/** The address the bar was last given by the page: what is typed stays until the page goes elsewhere. */
	const shownUrl = useRef("");

	/** The handle of the view, read when needed since it can change. */
	const view = (): raven.Rid => page.current?.widget ?? raven.R_INVALID_ID;

	/** Shows what the view says about its page. */
	const refresh = (): void => {
		const next = web.readPage(view());
		setState(next);
		if (next.url !== shownUrl.current) {
			shownUrl.current = next.url;
			setAddress(next.url);
		}
	};

	useEffect(() => {
		const id = view();
		// (the type of the prop `Color` is the group of colors of the theme, so it cannot say this)
		const [r, g, b, a] = INITIAL_TINT;
		if (tint.current) {
			raven.Rcolor_picker_set_color(tint.current.widget, r, g, b, a);
		}
		const stop = web.listen(id, refresh, (message) => {
			messages.current += 1;
			setLog(`Message **${messages.current}**:\n\n\`${message.slice(0, 600)}\``);
		});
		refresh();
		return stop;
	}, []);

	/** Goes to what the address bar holds. */
	const go = (text: string): void => {
		if (text) {
			web.loadUrl(view(), toUrl(text));
			page.current?.focus();
		}
	};

	/** A widget of Raven changes the page: the color picker sets a CSS variable. */
	const applyTint = (): void => {
		const hex = tint.current ? raven.Rcolor_picker_get_hex(tint.current.widget) : null;
		if (hex) {
			web.runJavaScript(view(), `document.documentElement.style.setProperty('--accent', '${hex}')`);
		}
	};

	return (
		<VBox>
			<HBox Spacing={8} Slot={{ Padding: [10, 8, 10, 8] }}>
				<Button Style="Flat" Enabled={state.canGoBack} OnClicked={() => web.goBack(view())}>Back</Button>
				<Button Style="Flat" Enabled={state.canGoForward} OnClicked={() => web.goForward(view())}>Forward</Button>
				<Button Style="Flat" OnClicked={() => web.reload(view())}>Reload</Button>
				<Button Style="Flat" OnClicked={() => web.loadFile(view(), WELCOME_PAGE)}>Home</Button>
				<TextInput Text={address} Placeholder="Address: https://..., or a file" OnChanged={setAddress} OnCommitted={go} Slot={{ Fill: 1 }} />
				<Label Opacity={0.7} Slot={{ VAlign: "Center" }}>Zoom</Label>
				<Slider
					Min={0.5}
					Max={2}
					Step={0.05}
					Value={zoom}
					Width={120}
					Slot={{ VAlign: "Center" }}
					OnChanged={(value) => {
						setZoom(value);
						web.setZoom(view(), value);
					}}
				/>
			</HBox>
			<Separator />
			<HBox Slot={{ Fill: 1 }}>
				<WebView ref={page} Source={WELCOME_PAGE} OnChanged={refresh} Slot={{ Fill: 1 }} />
				<Separator Orientation="Vertical" />
				<VBox Width={290} Spacing={10} Slot={{ Padding: 14 }}>
					<Label TextSize={17} Wrap>{state.title}</Label>
					<Label Opacity={0.6} Wrap>{state.error || (state.loading ? "Loading..." : "Loaded")}</Label>
					<Separator />
					<Label Opacity={0.6}>From Raven to the page</Label>
					<Label Markdown Wrap>This color picker is a widget of Raven. It sets a **CSS variable** of the page with `Rweb_view_run_javascript`.</Label>
					<ColorPicker ref={tint} Previous="#7C5CFF" Alpha={false} Compact OnChanged={applyTint} />
					<Separator />
					<Label Opacity={0.6}>From the page to Raven</Label>
					<Label Wrap Markdown>{log}</Label>
				</VBox>
			</HBox>
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven - web", Width: 1180, Height: 760, MinWidth: 720, MinHeight: 460 }, {
	appName: "Raven web",
	setup: () => {
		raven.Rtheme_apply(raven.R_THEME_DARK);
		// <WebView> becomes a tag
		web.registerWebView();
		if (!web.isBrowserAvailable()) {
			console.error("No browser of the Chromium family was found (Edge, Chrome, Chromium).\nInstall one, or set RAVEN_WEB_BROWSER to the path of its program.");
		}
	},
});
