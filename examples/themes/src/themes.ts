/**
 * The themes of this example, in TypeScript: what the original keeps in theme files. A theme
 * starts from a built-in one, or a look, and changes what it wants: the accent (and the shades
 * that follow from it), colors, metrics, the colors of code, and styles: values for one type of
 * widget, for a class, or for both.
 */

import { defineTheme } from "@decky.fx/raven-tsx/react";

/** A dark theme, blue as deep water, that starts from the built-in Dark. */
export const ocean = defineTheme({
	Name: "Ocean",
	Base: "Dark",
	Accent: "#22D3EE",
	CornerRadius: 10,
	Colors: { Window: "#0B1220", Panel: "#111A2C", Popup: "#16213A", Header: "#16213A", Input: "#0A1020", Text: "#DCE7F5", Separator: "#FFFFFF1A" },
	Metrics: { ControlHeight: 32, Spacing: 8 },
	Syntax: { Keyword: "#7DD3FC", String: "#86EFAC", Comment: "#64748B", Heading: "#22D3EE" },
	Styles: [
		// every button is a capsule
		{ Widget: "Button", CornerRadius: 16 },
		// widgets of the class "danger", whatever they are
		{ Class: "danger", Accent: "#FB7185", AccentHovered: "#FDA4AF", AccentPressed: "#E11D48" },
		// widgets of the class "card": a lighter panel with large corners
		{ Class: "card", Panel: "#1B2742", CornerRadius: 18 },
		// labels of the class "eyebrow": small capitals above a title
		{ Widget: "Label", Class: "eyebrow", Text: "#22D3EE", FontSize: 12 },
	],
});

/** A light theme: warm paper, ink, square corners. */
export const paper = defineTheme({
	Name: "Paper",
	Base: "Light",
	Accent: "#B45309",
	CornerRadius: 3,
	Colors: { Window: "#F6F1E7", Panel: "#FBF8F1", Popup: "#FFFDF8", Header: "#EDE6D6", Input: "#FFFDF8", Text: "#2B2620", Separator: "#00000024", Border: "#0000002E" },
	Metrics: { ControlHeight: 30, BorderWidth: 1 },
	Syntax: { Keyword: "#9A3412", String: "#3F6212", Comment: "#A8A29E", Heading: "#B45309" },
	Styles: [
		{ Class: "danger", Accent: "#B91C1C", AccentHovered: "#DC2626", AccentPressed: "#7F1D1D" },
		{ Class: "card", Panel: "#FFFDF8", CornerRadius: 4 },
		{ Widget: "Label", Class: "eyebrow", Text: "#B45309", FontSize: 12 },
	],
});

/**
 * A theme that names no look (no `Look`, no `Base`): it is laid over the look in use, and follows
 * it when it changes (`Rlook_set`). Try it with the look of Windows and with the ones of Raven.
 *
 * Styles can reach a part of a widget (`Part: "Thumb"`) in some states (`State: ["Hovered",
 * "Pressed"]`), and give it properties: `Background`, `Foreground`, `BorderColor`, `Size`...
 */
export const tweaks = defineTheme({
	Name: "Tweaks",
	Accent: "#E8590C",
	Styles: [
		// buttons of the class "danger": red, white text, darker when pressed
		{ Widget: "Button", Class: "danger", Background: "#C42B1C", Foreground: "#FFFFFF", BorderColor: "#00000033" },
		{ Widget: "Button", Class: "danger", State: "Hovered", Background: "#D13A2B" },
		{ Widget: "Button", Class: "danger", State: "Pressed", Background: "#A12317", Foreground: "#FFFFFFCC" },
		// the thumb of the sliders grows under the pointer
		{ Widget: "Slider", Part: "Knob", State: "Hovered", Size: 16 },
		// the pill of the selected rows, taller and green
		{ Part: "Indicator", Background: "#2F9E44", Size: 20 },
		// switches that are on: green
		{ Widget: "Checkbox", Part: "Track", State: "Checked", Background: "#2F9E44", BorderColor: "#2F9E44" },
	],
});
