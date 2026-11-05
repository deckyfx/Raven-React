/**
 * A window that is seen through, and the ways to blur what is behind. The port of `examples/overlay` of Raven.
 *
 * `Transparent` asks the window system for it, `Backdrop` says what the system does to what
 * shows through. Nothing is drawn where there is no widget: the desktop is there. Whether the
 * desktop shows, and blurred or not, is up to the window system: Windows 10 and 11 do it (Mica
 * and Acrylic need Windows 11), X11 needs a compositor (and KWin for the blur).
 *
 * The panels are `BackgroundBlur` widgets. "Native" opens a hole in the window and lets the
 * system blur the desktop behind it (when it can); the three others blur what Raven itself drew
 * behind them.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BackgroundBlur, Border, Button, ComboBox, HBox, Label, Overlay, raven, runApp, Slider, VBox, Window, type WindowInstance } from "@decky.fx/raven-react";

/** The backdrops of the ComboBox, in its order. */
const BACKDROPS = [
	{ label: "Transparent", value: raven.R_BACKDROP_TRANSPARENT },
	{ label: "Blur", value: raven.R_BACKDROP_BLUR },
	{ label: "Acrylic", value: raven.R_BACKDROP_ACRYLIC },
	{ label: "Mica", value: raven.R_BACKDROP_MICA },
];
/** The backdrop asked for when the window is made: the index of "Blur". */
const FIRST_BACKDROP = 1;

/** The colors of the stripes. */
const STRIPE_COLORS = ["#FF453B", "#FFD60A", "#30D159", "#0A85FF"];
const STRIPE_COUNT = 40;
const STRIPE_WIDTH = 16;

/** The ways to blur that are shown side by side. */
const BLUR_STYLES = ["Plain", "Frosted", "Glass", "Native"] as const;

/** What the window system gave. */
interface Obtained {
	/** The backdrop that is in effect. */
	readonly backdrop: string;
	/** Whether the window can be seen through, in a sentence. */
	readonly what: string;
}

/** Says what a backdrop is. */
function backdropName(backdrop: raven.RBackdrop): string {
	switch (backdrop) {
		case raven.R_BACKDROP_TRANSPARENT:
			return "the desktop, as it is";
		case raven.R_BACKDROP_BLUR:
			return "the desktop, blurred";
		case raven.R_BACKDROP_ACRYLIC:
			return "acrylic";
		case raven.R_BACKDROP_MICA:
			return "mica";
		default:
			return "nothing (not available here)";
	}
}

/** Asks Raven what the window system gave to a window. */
function readObtained(window: raven.Rid): Obtained {
	const native = new raven.RNativeWindow();
	raven.Rwindow_get_native_handle(window, native);
	return {
		backdrop: backdropName(raven.Rwindow_get_backdrop(window)),
		what: native.transparent
			? "Where this window draws nothing, what is behind it shows. Drag the panel to move the window."
			: "This window system did not give a window that can be seen through: the same interface, on a plain background.",
	};
}

/** The caption of a row of controls. */
function RowLabel({ children }: { readonly children: string }): ReactNode {
	return <Label Width={80} Slot={{ VAlign: "Center" }} Color="#FFFFFFC0">{children}</Label>;
}

/** Something sharp to blur: stripes of color. */
function Stripes(): ReactNode {
	return (
		<HBox Clip>
			{Array.from({ length: STRIPE_COUNT }, (_, index) => (
				<Border key={index} Width={STRIPE_WIDTH} Background={STRIPE_COLORS[index % STRIPE_COLORS.length]} />
			))}
		</HBox>
	);
}

/** The four ways to blur, over the stripes. */
function BlurPanels(): ReactNode {
	return (
		<HBox Spacing={12} Slot={{ Padding: 14 }}>
			{BLUR_STYLES.map((style) => (
				<BackgroundBlur key={style} Style={style} Slot={{ Fill: 1 }} CornerRadius={14} Padding={10} Tint={style === "Native" ? "#00000030" : undefined}>
					<Label Color="#FFFFFF" TextAlign="Center" Slot={{ VAlign: "Center" }}>{style}</Label>
				</BackgroundBlur>
			))}
		</HBox>
	);
}

function App(): ReactNode {
	const window = useRef<WindowInstance>(null);
	const [backdrop, setBackdrop] = useState(FIRST_BACKDROP);
	const [opacity, setOpacity] = useState(1);
	const [opacityRefused, setOpacityRefused] = useState(false);
	const [obtained, setObtained] = useState<Obtained>({ backdrop: "", what: "" });

	// Only the window can say what it was given, once it exists.
	useLayoutEffect(() => {
		if (window.current) {
			setObtained(readObtained(window.current.window));
		}
	}, []);

	/** Asks for another backdrop. When the system cannot do it, the window stays as it was. */
	function chooseBackdrop(index: number): void {
		setBackdrop(index);
		const chosen = BACKDROPS[index];
		if (window.current && chosen) {
			raven.Rwindow_set_backdrop(window.current.window, chosen.value);
			setObtained(readObtained(window.current.window));
		}
	}

	/** Fades the whole window. When the system refuses, the slider goes back to what the window has. */
	function chooseOpacity(value: number): void {
		if (window.current && !raven.Rwindow_set_opacity(window.current.window, value)) {
			setOpacityRefused(true);
			return;
		}
		setOpacity(value);
	}

	return (
		<Window ref={window} Title="Raven - overlay" Width={640} Height={420} Transparent Backdrop="Blur" Borderless>
			<BackgroundBlur Style="Native" CornerRadius={24} Padding={22} Tint="#10141C99" Shadow={0} WindowDrag>
				<VBox Spacing={12}>
					<HBox Spacing={10}>
						<Label TextSize={24} Slot={{ Fill: 1 }} Color="#FFFFFF">Seen through</Label>
						<Button Style="Flat" OnClicked="app.quit" Slot={{ VAlign: "Center" }}>Close</Button>
					</HBox>
					<Label Text={obtained.what} Wrap Color="#FFFFFFC0" />

					<HBox Spacing={10}>
						<RowLabel>Backdrop</RowLabel>
						<ComboBox Items={BACKDROPS.map((item) => item.label)} Selected={backdrop} Width={160} OnChanged={chooseBackdrop} />
						<Label Slot={{ VAlign: "Center" }} Color="#FFFFFF90">{`obtained: ${obtained.backdrop}`}</Label>
					</HBox>
					<HBox Spacing={10}>
						<RowLabel>Opacity</RowLabel>
						<Slider Min={0.2} Max={1} Value={opacity} Width={160} OnChanged={chooseOpacity} Slot={{ VAlign: "Center" }} />
						<Label Slot={{ VAlign: "Center" }} Color="#FFFFFF90">{opacityRefused ? "not supported by this window system" : "of the whole window"}</Label>
					</HBox>

					<Overlay Slot={{ Fill: 1 }}>
						<Stripes />
						<BlurPanels />
					</Overlay>
				</VBox>
			</BackgroundBlur>
		</Window>
	);
}

await runApp(<App />, undefined, {
	appName: "Raven overlay",
	setup: () => raven.Rtheme_apply(raven.R_THEME_DARK),
});
