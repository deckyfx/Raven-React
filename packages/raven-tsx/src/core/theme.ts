/**
 * Themes in TypeScript, in place of theme files: the same theme, typed, with nothing to write in
 * XML. `defineTheme` checks it, `loadTheme` gives it to Raven, which keeps it under its name.
 *
 *     const ocean = defineTheme({
 *       Name: "Ocean", Base: "Dark", Accent: "#22D3EE",
 *       Colors: { Window: "#0B1220", Panel: "#111A2C" },
 *       Styles: [{ Widget: "Button", CornerRadius: 16 }, { Class: "danger", Accent: "#FB7185" }],
 *     });
 *     await runApp(<App />, options, { setup: () => raven.Rtheme_use(loadTheme(ocean)) });
 */

import type { ColorRole, MaterialName, MetricName } from "./props.generated";
import { RavenError } from "./errors";
import { escapeXml } from "./props";
import * as r from "./raven";

/** A color: `#RRGGBB`, or `#RRGGBBAA` with its opacity. */
export type ThemeColor = `#${string}`;

/** The looks a theme can start from and impose, with `Look`. */
export const LOOKS = [
	"RavenDark", "RavenLight", "RavenGlassDark", "RavenGlassLight", "RavenHighContrastDark", "RavenHighContrastLight",
	"WindowsDark", "WindowsLight", "MacOSDark", "MacOSLight", "MacOSGlassDark", "MacOSGlassLight", "GnomeDark", "GnomeLight", "NativeDark", "NativeLight",
] as const;
export type LookName = (typeof LOOKS)[number];

/** The kinds of text the text editor colors, for `Syntax`. */
export const SYNTAX_TOKENS = ["Comment", "String", "Number", "Keyword", "Type", "Function", "Tag", "Attribute", "Punctuation", "Directive", "Heading", "Strong", "Emphasis", "Link"] as const;
export type SyntaxToken = (typeof SYNTAX_TOKENS)[number];

/** What the glass of a theme does, as multipliers (1: as designed, 0: none), for `Glass`. */
export const GLASS_PROPERTIES = ["Frost", "Refraction", "Saturation", "Rim", "Shadow"] as const;
export type GlassProperty = (typeof GLASS_PROPERTIES)[number];

/** The parts of widgets a style can reach (which widget has which: docs/THEMES.md of Raven). */
export const THEME_PARTS = [
	"Box", "Mark", "Radio", "Dot", "Track", "Knob", "Fill", "Thumb", "Arrow", "Popup", "Item", "Indicator", "Tab", "Header",
	"Scrollbar", "ScrollThumb", "Tooltip", "CaptionButton", "CloseButton", "Focus", "Grid", "Node", "Pin", "Link", "Ruler", "Clip", "Key", "Marker", "Playhead",
] as const;
export type ThemePart = (typeof THEME_PARTS)[number];

/** The states a style can ask for; given several, all must hold. `Primary` and `Flat` are styles of a button. */
export const THEME_STATES = ["Hovered", "Pressed", "Focused", "Disabled", "Checked", "Selected", "Open", "Primary", "Flat"] as const;
export type ThemeState = (typeof THEME_STATES)[number];

/** The forms of a part that can take several: pins and keys, links, grids, headers of nodes and clips. */
export const PART_SHAPES = [
	"Circle", "Ring", "Square", "Diamond", "Triangle", "Arrow", "Bezier", "Straight", "Step", "Angled",
	"Dots", "Lines", "Cross", "Solid", "Gradient", "Stripe", "Tint", "Outline", "None",
] as const;
export type PartShape = (typeof PART_SHAPES)[number];

/** A color for each role it names. */
export type ThemeColors = { readonly [Role in ColorRole]?: ThemeColor };
/** A value for each metric it names. */
export type ThemeMetrics = { readonly [Metric in MetricName]?: number };

/** What a style gives a part of a widget, in its states. */
export interface PartProperties {
	/** What it is filled with; `None`, nothing. */
	readonly Background?: ThemeColor | "None";
	/** Its text, marks and glyphs. */
	readonly Foreground?: ThemeColor;
	readonly BorderColor?: ThemeColor;
	readonly BorderWidth?: number;
	readonly BorderTopColor?: ThemeColor;
	readonly BorderBottomColor?: ThemeColor;
	readonly BorderBottomWidth?: number;
	readonly CornerRadius?: number;
	/** The size of a part that has one of its own: a knob, a dot, a pill. */
	readonly Size?: number;
	/** From 0 to 1. */
	readonly Opacity?: number;
	/**
	 * The shadow it drops: popups, and a `Border`, whose own `Shadow` comes before `ShadowSize`.
	 * A `Border` of glass without an `Effect` takes only `ShadowSize`, and one with nothing to draw
	 * (a transparent `Background`, no outline, no `Effect`) drops no shadow at all.
	 */
	readonly ShadowColor?: ThemeColor;
	readonly ShadowSize?: number;
	readonly Shape?: PartShape;
	/**
	 * Light of its color around it, from 0 to 1: a `Label` (not one with `Markdown`, which Raven
	 * draws without it), a `Border` (not one of glass without an `Effect`, nor one with nothing to
	 * draw), and the pins, links, nodes, clips, keys, markers and playhead of node graphs and
	 * timelines. A node glows only with a `BorderWidth` above 0: a selected node has one, so give one
	 * with `Glow` to the others.
	 */
	readonly Glow?: number;
	/** The color it fades to: a header of a node, a clip of the `Gradient` form. */
	readonly Gradient?: ThemeColor;
}

/**
 * A rule of a theme, for the widgets of a type and/or a class, or a part of them in some states.
 * Without `Part` and `State`, its colors and metrics are those of the widgets it names; with
 * them, only its properties count. The most specific rule wins (a type counts 1, a class or a
 * state 2, as in CSS), and the last one between equals.
 */
export interface ThemeStyle extends ThemeColors, ThemeMetrics, PartProperties {
	/** The tag of the widgets: `"Button"`. */
	readonly Widget?: string;
	/** A class of `Class="..."` on widgets. */
	readonly Class?: string;
	readonly Part?: ThemePart;
	/** A state, or several that must all hold. */
	readonly State?: ThemeState | readonly ThemeState[];
	readonly Material?: MaterialName;
}

/** A theme: what a theme file says, as an object. Any color or metric can also be given at its top. */
export interface ThemeSpec extends ThemeColors, ThemeMetrics {
	/** The name the theme is kept under, for `Rtheme_use` and the `Theme` prop. */
	readonly Name: string;
	/** The look it starts from, and imposes. Without `Look` (nor `Base`) it is laid over the look in use, and follows it. */
	readonly Look?: LookName;
	/** A theme loaded before, or a look by its name of Raven 0.2 (`Dark`, `GlassLight`...); `Look` is the new way. */
	readonly Base?: string;
	/** `Springy`: things bounce (Raven). `Smooth`: short transitions that settle at once (the platforms). */
	readonly Motion?: "Springy" | "Smooth";
	/** The accent color, and the shades that follow from it. */
	readonly Accent?: ThemeColor;
	/** The material of its surfaces. (`Default` is for widgets and styles: it puts them back to the theme's) */
	readonly Material?: Exclude<MaterialName, "Default">;
	/** Whether it is dark, when its base does not say it right. */
	readonly Dark?: boolean;
	/** A font file: an absolute path, or one from the current folder. */
	readonly Font?: string;
	/** What is behind the content of the windows: an image file, `Dark`, `Light`, colors to blend (`"#1E3A8A,#7C3AED"`), or `None`. */
	readonly Wallpaper?: string;
	readonly Colors?: ThemeColors;
	readonly Metrics?: ThemeMetrics;
	readonly Glass?: { readonly [Property in GlassProperty]?: number };
	/** The colors of code in the text editor. */
	readonly Syntax?: { readonly [Token in SyntaxToken]?: ThemeColor };
	readonly Styles?: readonly ThemeStyle[];
}

/** The keys of a spec that are its sections, not attributes of `<Theme>`. */
const SECTIONS: ReadonlySet<string> = new Set(["Colors", "Metrics", "Glass", "Syntax", "Styles"]);

/** `T`, with `never` for each key `Shape` does not have, at every depth: what makes a misspelled key an error. */
type OnlyKnown<T, Shape> = T extends readonly (infer Item)[]
	? readonly OnlyKnown<Item, NonNullable<Shape> extends readonly (infer Allowed)[] ? Allowed : never>[]
	: T extends object
		? string extends keyof T
			? T // (an object made by code, `Object.fromEntries`: its keys are not known before it runs)
			: { readonly [K in keyof T]: K extends keyof NonNullable<Shape> ? OnlyKnown<T[K], NonNullable<Shape>[K]> : never }
		: T;

/**
 * A theme, checked by its type: a misspelled key does not compile, at any depth, in the object
 * written here or in one made apart (the error is at the key: `Type 'string' is not assignable to
 * type 'never'`). An object made at runtime, `Object.fromEntries`, has no keys to check before it
 * runs. Returns the theme as it was given, with its own type: `ocean.Colors.Panel` is a string.
 */
export function defineTheme<const T extends ThemeSpec>(theme: T & OnlyKnown<T, ThemeSpec>): T {
	return theme;
}

/** The attributes of an element, from the keys of an object that have a value. */
function attributes(values: object, skip: ReadonlySet<string> = new Set()): string {
	let text = "";
	for (const [name, value] of Object.entries(values)) {
		if (value === undefined || value === null || skip.has(name)) {
			continue;
		}
		// (Raven would report it and skip it: it is a mistake of the code, not of a theme file)
		if (typeof value === "number" && !Number.isFinite(value)) {
			RavenError.throw(`themeXml: ${name}="${value}" is not a finite number`);
		}
		// (several states are written apart by spaces)
		const written = Array.isArray(value) ? value.join(" ") : String(value);
		text += ` ${name}="${escapeXml(written)}"`;
	}
	return text;
}

/** The text of the theme file a theme stands for. */
export function themeXml(theme: ThemeSpec): string {
	const lines = [`<Theme${attributes(theme, SECTIONS)}>`];
	for (const section of ["Colors", "Metrics", "Glass", "Syntax"] as const) {
		const values = theme[section];
		if (values && Object.keys(values).length > 0) {
			lines.push(`\t<${section}${attributes(values)}/>`);
		}
	}
	for (const style of theme.Styles ?? []) {
		lines.push(`\t<Style${attributes(style)}/>`);
	}
	lines.push("</Theme>");
	return lines.join("\n");
}

/**
 * Gives a theme to Raven, which keeps it under its name: `Rtheme_use` then makes it the theme of
 * the application, and the `Theme` prop gives it to a part of the window. Loading it again
 * replaces it. Returns its name; throws when Raven refuses it.
 */
export function loadTheme(theme: ThemeSpec): string {
	const name = r.Rtheme_load_from_memory(themeXml(theme));
	if (name === null) {
		return RavenError.fromLibrary(`loadTheme(${JSON.stringify(theme.Name)})`);
	}
	return name;
}
