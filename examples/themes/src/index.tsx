/**
 * Themes, styles, classes, and Markdown. The port of `examples/themes` of Raven.
 *
 *   `Rlook_set(look)`            the look: Raven's (flat, glass, high contrast), Windows 11, macOS, GNOME, the platform's
 *   `defineTheme`, `loadTheme`   a theme in TypeScript (`themes.ts`), kept by Raven under its name: the theme files of the original
 *   `Rtheme_use(name)`           makes a named theme the theme of the application
 *   `Rtheme_set_accent(r,g,b)`   one color, and the shades that follow from it
 *   `Rtheme_save(path, name)`    writes the theme in use as a theme file
 *   `Class="danger"`             in the props, for the styles of the themes
 *   `Markdown`                   on a `Label` (rendered) and on a `TextEditor` (styled in place)
 *
 * A theme that names no look (`tweaks`) is laid over the look in use and follows it; one that
 * names a look (`ocean`, `paper`) imposes it. The original watches its theme files and loads them
 * again when they change; these are code, so this example only reads `notes.md` again when it
 * changes.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	Border, Button, Checkbox, ColorPicker, ComboBox, HBox, Label, ListView, loadTheme, ProgressBar, raven, runApp, ScrollBox, Separator, Slider, Spacer, SpinBox, Splitter, TextEditor, TextInput, useAction, VBox,
	type WidgetInstance,
} from "@decky.fx/raven-react";
import { ocean, paper, tweaks } from "./themes";

const ASSETS = `${import.meta.dir}/../assets`;
const NOTES = `${ASSETS}/notes.md`;

const LOOKS: readonly { readonly name: string; readonly look: raven.RLook }[] = [
	{ name: "Raven dark", look: raven.R_LOOK_RAVEN_DARK },
	{ name: "Raven light", look: raven.R_LOOK_RAVEN_LIGHT },
	{ name: "Raven glass dark", look: raven.R_LOOK_RAVEN_GLASS_DARK },
	{ name: "Raven glass light", look: raven.R_LOOK_RAVEN_GLASS_LIGHT },
	{ name: "Raven high contrast dark", look: raven.R_LOOK_RAVEN_HIGH_CONTRAST_DARK },
	{ name: "Raven high contrast light", look: raven.R_LOOK_RAVEN_HIGH_CONTRAST_LIGHT },
	{ name: "Windows dark", look: raven.R_LOOK_WINDOWS_DARK },
	{ name: "Windows light", look: raven.R_LOOK_WINDOWS_LIGHT },
	{ name: "macOS dark", look: raven.R_LOOK_MACOS_DARK },
	{ name: "macOS light", look: raven.R_LOOK_MACOS_LIGHT },
	{ name: "GNOME dark", look: raven.R_LOOK_GNOME_DARK },
	{ name: "GNOME light", look: raven.R_LOOK_GNOME_LIGHT },
	{ name: "Native dark", look: raven.R_LOOK_NATIVE_DARK },
	{ name: "Native light", look: raven.R_LOOK_NATIVE_LIGHT },
	{ name: "macOS 26 glass dark", look: raven.R_LOOK_MACOS_GLASS_DARK },
	{ name: "macOS 26 glass light", look: raven.R_LOOK_MACOS_GLASS_LIGHT },
];
const LOOK_NAMES = LOOKS.map(({ name }) => name);

const EDITOR_START = "## Try it\n\nType **bold**, *emphasis*, `code`,\n- a list\n- [a link](https://example.org)\n";

/** What Raven says about the appearance, for the two lists. */
interface Appearance {
	readonly look: number;
	readonly themes: readonly string[];
	readonly theme: number;
	/** The accent of the theme in use, as `#RRGGBB`. */
	readonly accent: string;
}

/** A color of Raven, its parts from 0 to 1, as `#RRGGBB`. */
function hexColor(r: number, g: number, b: number): string {
	return `#${[r, g, b].map((part) => Math.round(Math.min(1, Math.max(0, part)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Reads the look, the themes and the accent from Raven, which owns them. */
function readAppearance(): Appearance {
	const current = raven.Rlook_get();
	const themes = Array.from({ length: raven.Rtheme_get_count() }, (_, i) => raven.Rtheme_get_name_at(i) ?? "");
	const [r, g, b] = raven.Rtheme_get_color(raven.R_COLOR_ACCENT);
	return {
		look: LOOKS.findIndex(({ look }) => look === current),
		themes,
		theme: themes.indexOf(raven.Rtheme_get_name() ?? ""),
		accent: hexColor(r, g, b),
	};
}

/** A small title above a control of the side panel. */
function FieldTitle({ children }: { readonly children: string }): ReactNode {
	return <Label Opacity={0.65} Slot={{ Padding: "0,8,0,0" }}>{children}</Label>;
}

/** The side panel: what chooses the look, the theme file and the accent. */
function Sidebar(): ReactNode {
	const accent = useRef<WidgetInstance>(null);
	const [appearance, setAppearance] = useState(readAppearance);
	const [status, setStatus] = useState("");

	useAction("themes.docs", () => setStatus('A link of the Markdown text fired the action "themes.docs".'));

	const chooseLook = (index: number): void => {
		const chosen = LOOKS[index];
		if (chosen) {
			raven.Rlook_set(chosen.look);
		}
		setAppearance(readAppearance());
	};

	const chooseTheme = (index: number): void => {
		const name = appearance.themes[index];
		if (name !== undefined) {
			raven.Rtheme_use(name);
		}
		setAppearance(readAppearance());
	};

	// (Color follows the accent of the theme: read again, the picker shows the new one, and a new theme or look its own)
	const chooseAccent = (): void => {
		if (accent.current) {
			const [r, g, b] = raven.Rcolor_picker_get_color(accent.current.widget);
			raven.Rtheme_set_accent(r, g, b);
		}
		setAppearance(readAppearance());
	};

	const save = (): void => {
		setStatus(raven.Rtheme_save("my-theme.xml", "Mine") ? "Written: my-theme.xml (in the working folder)" : "Could not write my-theme.xml");
	};

	return (
		<VBox Width={250} Spacing={10} Slot={{ Padding: 16 }}>
			<Label Class="eyebrow">APPEARANCE</Label>
			<Label TextSize={24}>Themes</Label>
			<FieldTitle>Look</FieldTitle>
			<ComboBox Items={LOOK_NAMES} Selected={appearance.look} OnChanged={chooseLook} />
			<FieldTitle>Theme laid over it</FieldTitle>
			<ComboBox Items={appearance.themes} Selected={appearance.theme} OnChanged={chooseTheme} />
			<FieldTitle>Accent</FieldTitle>
			<HBox Spacing={8}>
				<ColorPicker ref={accent} Popup Alpha={false} Color={appearance.accent} OnChanged={chooseAccent} />
				<Label Font="monospace" TextSize={12} Opacity={0.7} Slot={{ VAlign: "Center" }}>Rtheme_set_accent</Label>
			</HBox>
			<Button
				Style="Flat"
				Tooltip="Writes the theme in use, with the changes made here, as a theme file"
				OnClicked={save}
				Slot={{ Padding: "0,8,0,0" }}
			>
				Save as my-theme.xml
			</Button>
			<Label Wrap Opacity={0.65} Text={status} />
			<Spacer Slot={{ Fill: 1 }} />
			<Label Wrap Opacity={0.6} Markdown>The themes are in **themes.ts**. Edit **notes.md** while this runs: the window follows.</Label>
		</VBox>
	);
}

/** The widgets that show what the theme in use does. */
function Controls(): ReactNode {
	return (
		<Border Class="card" Padding={18}>
			<VBox Spacing={10}>
				<Label Class="eyebrow">THE THEME IN USE</Label>
				<Label TextSize={19}>Controls</Label>
				<HBox Spacing={8}>
					<Button Style="Primary">Primary</Button>
					<Button>Default</Button>
					<Button Style="Flat">Flat</Button>
					<Button Style="Primary" Class="danger" Tooltip='Class="danger"'>Delete</Button>
				</HBox>
				<HBox Spacing={12}>
					<Checkbox Checked>Checkbox</Checkbox>
					<Checkbox Style="Switch" Checked>Switch</Checkbox>
					<Checkbox Style="Switch" Checked Class="danger">Danger</Checkbox>
				</HBox>
				<HBox Spacing={12}>
					<Checkbox Style="Radio" Checked>Radio</Checkbox>
					<Checkbox Style="Radio">Radio</Checkbox>
				</HBox>
				<Slider Value={0.6} />
				<ProgressBar Value={0.4} />
				<ListView Items={["First", "Second", "Third"]} Height={110} />
				<HBox Spacing={8}>
					<TextInput Placeholder="Text" Slot={{ Fill: 1 }} />
					<ComboBox Items={["One", "Two", "Three"]} Selected={0} Width={120} />
					<SpinBox Min={0} Max={100} Value={42} Width={90} />
				</HBox>
			</VBox>
		</Border>
	);
}

/** A part of the window with a theme of its own, whatever the theme of the application: one of `themes.ts`, by its name. */
function PaperCard(): ReactNode {
	return (
		<Border Class="card" Padding={18} Theme={paper.Name}>
			<VBox Spacing={10}>
				<Label Class="eyebrow">{`THEME="${paper.Name.toUpperCase()}"`}</Label>
				<Label TextSize={19}>A card that keeps its theme</Label>
				<HBox Spacing={8}>
					<Button Style="Primary">Primary</Button>
					<Button>Default</Button>
					<Button Style="Primary" Class="danger">Delete</Button>
					<Checkbox Style="Switch" Checked>Switch</Checkbox>
				</HBox>
				<Slider Value={0.3} />
			</VBox>
		</Border>
	);
}

/** Another part of the window with a theme of its own, a built-in one. */
function GlassCard(): ReactNode {
	return (
		<Border Class="card" Padding={18} Theme="GlassDark">
			<VBox Spacing={10}>
				<Label Class="eyebrow">THEME="GLASSDARK"</Label>
				<HBox Spacing={8}>
					<Button Style="Primary">Glass</Button>
					<Button>Default</Button>
					<Checkbox Style="Switch" Checked>Switch</Checkbox>
					<Slider Value={0.7} Slot={{ Fill: 1, VAlign: "Center" }} />
				</HBox>
			</VBox>
		</Border>
	);
}

/** `notes.md`, rendered and read again when it changes, and an editor that styles what is typed. */
function Notes(): ReactNode {
	const [notes, setNotes] = useState("");
	useEffect(() => {
		const load = (): void => {
			// (a file that cannot be read keeps what is shown, as a file being saved may do that)
			Bun.file(NOTES).text().then(setNotes, () => {});
		};
		load();
		const watch = setInterval(load, 500);
		return () => clearInterval(watch);
	}, []);
	return (
		<Splitter Orientation="Vertical" Width={400}>
			<ScrollBox Slot={{ Fill: 3 }}>
				<Label Markdown Wrap Text={notes} Slot={{ Padding: 18 }} />
			</ScrollBox>
			<TextEditor Markdown Wrap Text={EDITOR_START} Placeholder="Markdown, styled as you type" Slot={{ Fill: 2 }} />
		</Splitter>
	);
}

/** The whole window. */
function App(): ReactNode {
	return (
		<HBox>
			<Sidebar />
			<Separator Orientation="Vertical" />

			<ScrollBox Slot={{ Fill: 1 }}>
				<VBox Spacing={14} Slot={{ Padding: 20 }}>
					<Controls />
					<PaperCard />
					<GlassCard />
				</VBox>
			</ScrollBox>
			<Separator Orientation="Vertical" />

			<Notes />
		</HBox>
	);
}

await runApp(<App />, { Title: "Raven - themes", Width: 1180, Height: 760, MinWidth: 820, MinHeight: 520 }, {
	appName: "Raven themes",
	setup: () => {
		// the themes: each is kept under its name, next to the built-in ones
		for (const theme of [ocean, paper, tweaks]) {
			loadTheme(theme);
		}
		raven.Rtheme_use(process.env.RAVEN_EXAMPLE_THEME ?? ocean.Name);
	},
});
