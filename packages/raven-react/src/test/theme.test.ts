/** Themes written in TypeScript: the XML they become, and Raven taking every key they can have. */

import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import * as r from "../raven";
import { defineTheme, GLASS_PROPERTIES, LOOKS, loadTheme, PART_SHAPES, SYNTAX_TOKENS, THEME_PARTS, THEME_STATES, themeXml, type ThemeStyle } from "../theme";
import { RavenError } from "../errors";

const errors: string[] = [];

beforeAll(() => {
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_NULL;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
	r.Rerror_set_callback((_code, _severity, detail) => void errors.push(detail ?? ""));
});

afterEach(() => {
	errors.length = 0;
});

afterAll(() => {
	r.Rshutdown();
});

/** The names of a group every widget has in the schema (`Color.Window`), or the choices of one of its attributes. */
function schemaNames(prefix: string): string[] {
	const names: string[] = [];
	const info = new r.RXmlAttributeInfo();
	for (let index = 0; index < r.Rxml_get_attribute_count("Spacer"); index++) {
		if (r.Rxml_get_attribute_info("Spacer", index, info) && info.name) {
			if (info.name.startsWith(`${prefix}.`)) {
				names.push(info.name.slice(prefix.length + 1));
			}
		}
	}
	return names;
}

const OCEAN = defineTheme({
	Name: "Ocean",
	Base: "Dark",
	Accent: "#22D3EE",
	CornerRadius: 10,
	Colors: { Window: "#0B1220", Panel: "#111A2C", Separator: "#FFFFFF1A" },
	Metrics: { ControlHeight: 32, Spacing: 8 },
	Syntax: { Keyword: "#7DD3FC", Heading: "#22D3EE" },
	Styles: [
		{ Widget: "Button", CornerRadius: 16 },
		{ Class: "danger", Accent: "#FB7185", AccentPressed: "#E11D48" },
		{ Widget: "Button", Class: "danger", State: ["Hovered", "Pressed"], Background: "#A12317" },
	],
});

test("a theme becomes the XML of a theme file, sections and styles in their order", () => {
	expect(themeXml(OCEAN)).toBe(
		[
			'<Theme Name="Ocean" Base="Dark" Accent="#22D3EE" CornerRadius="10">',
			'\t<Colors Window="#0B1220" Panel="#111A2C" Separator="#FFFFFF1A"/>',
			'\t<Metrics ControlHeight="32" Spacing="8"/>',
			'\t<Syntax Keyword="#7DD3FC" Heading="#22D3EE"/>',
			'\t<Style Widget="Button" CornerRadius="16"/>',
			'\t<Style Class="danger" Accent="#FB7185" AccentPressed="#E11D48"/>',
			'\t<Style Widget="Button" Class="danger" State="Hovered Pressed" Background="#A12317"/>',
			"</Theme>",
		].join("\n"),
	);
});

test("what XML would read as markup is escaped, and undefined keys are left out", () => {
	const xml = themeXml(defineTheme({ Name: 'A "quoted" <theme> & more', Accent: undefined, Dark: true }));
	expect(xml).toBe('<Theme Name="A &quot;quoted&quot; &lt;theme&gt; &amp; more" Dark="true">\n</Theme>');
});

test("a loaded theme is kept under its name, with its colors", () => {
	expect(loadTheme(OCEAN)).toBe("Ocean");
	expect(r.Rtheme_use("Ocean")).toBeTruthy();
	const [red, green, blue] = r.Rtheme_get_color(r.R_COLOR_WINDOW);
	expect([red, green, blue].map((part) => Math.round(part * 255))).toEqual([0x0b, 0x12, 0x20]);
	expect(errors).toEqual([]);
});

test("a mistake in a theme is reported by Raven, and the rest of the theme is used, as in a file", () => {
	expect(loadTheme(defineTheme({ Name: "Mistaken", Base: "NoSuchTheme", Accent: "#E8590C" }))).toBe("Mistaken");
	expect(errors).toEqual(['theme (memory):1: Base="NoSuchTheme": no theme has that name; starting from the look in use']);
	errors.length = 0;
});

test("a theme Raven refuses altogether throws, with what Raven said", () => {
	const refuse = spyOn(r, "Rtheme_load_from_memory").mockImplementation(() => null);
	try {
		expect(() => loadTheme(OCEAN)).toThrow(RavenError);
		expect(() => loadTheme(OCEAN)).toThrow('loadTheme("Ocean")');
	} finally {
		refuse.mockRestore();
	}
});

test("Raven takes every key a theme can be given, with no error", () => {
	const colors = Object.fromEntries(schemaNames("Color").map((role) => [role, "#123456"]));
	const metrics = Object.fromEntries(schemaNames("Metric").map((metric) => [metric, 4]));
	const parts: ThemeStyle[] = THEME_PARTS.map((part) => ({ Part: part, Background: "#202020" }));
	const states: ThemeStyle[] = THEME_STATES.map((state) => ({ Widget: "Button", State: state, Foreground: "#FFFFFF" }));
	const shapes: ThemeStyle[] = PART_SHAPES.map((shape) => ({ Widget: "NodeGraph", Part: "Pin", Shape: shape }));
	const properties: ThemeStyle = {
		Widget: "Button",
		Part: "Focus",
		Background: "None",
		Foreground: "#FFFFFF",
		Text: "#FFFFFF",
		BorderColor: "#000000",
		BorderWidth: 1,
		BorderTopColor: "#000000",
		BorderBottomColor: "#000000",
		BorderBottomWidth: 2,
		CornerRadius: 4,
		Size: 12,
		Opacity: 0.5,
		ShadowColor: "#00000080",
		ShadowSize: 8,
		Glow: 0.3,
		Gradient: "#FF0000",
	};
	const theme = defineTheme({
		Name: "Everything",
		Look: "RavenDark",
		Motion: "Smooth",
		Accent: "#E8590C",
		Material: "Solid",
		Dark: true,
		Wallpaper: "None",
		Colors: colors,
		Metrics: metrics,
		Glass: Object.fromEntries(GLASS_PROPERTIES.map((property) => [property, 1])),
		Syntax: Object.fromEntries(SYNTAX_TOKENS.map((token) => [token, "#ABCDEF"])),
		Styles: [{ Class: "card", Material: "Glass", Panel: "#1B2742", CornerRadius: 18 }, ...parts, ...states, ...shapes, properties],
	});
	expect(loadTheme(theme)).toBe("Everything");
	expect(errors).toEqual([]);
	// and every look a theme can start from
	for (const look of LOOKS) {
		expect(loadTheme(defineTheme({ Name: `From ${look}`, Look: look }))).toBe(`From ${look}`);
	}
	expect(errors).toEqual([]);
});

test("a misspelled key does not compile", () => {
	// @ts-expect-error: no color role is called Pannel
	const wrong = defineTheme({ Name: "Typo", Colors: { Pannel: "#000000" } });
	// @ts-expect-error: a color is written #RRGGBB
	const bare = defineTheme({ Name: "Bare", Accent: "22D3EE" });
	expect([wrong.Name, bare.Name]).toEqual(["Typo", "Bare"]);
});
