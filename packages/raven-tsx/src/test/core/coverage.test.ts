/**
 * What Raven offers against what the renderer does with it, to the last name: this fails when
 * Raven adds a tag, an attribute or a callback nobody has decided about. The names come from the
 * binding and from the schema of the library, so no Raven checkout is needed.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import * as r from "../../core/raven";
import { EVENT_VALUE_TYPES, EXTRA_PROPS, COMMON_PROPS, wiredCallbacks, wiredProps } from "../../core/events";
import { checkLibrary, functionsOfBinding, missingFunctions, STAMP_FILE } from "../../core/library-check";
import { apiAt, commitOf, provenanceProblem, readPin } from "../../tools/raven-pin";
import { diffApi, parseApi, parseHeader, parseSchema, countOf, formatDiff, newCallbackSetters, type RavenApi } from "../../tools/raven-api";
import { controlledAttributes, overrideOf } from "../../core/widget-instance";

/** Callback setters that have no prop on purpose, and why. */
const NOT_WIRED: Readonly<Record<string, string>> = {
	Rbutton_set_clicked_callback: "OnClicked goes through the action of the button, which fires with it and has no value to give",
	Rerror_set_callback: "not of a widget: for the whole application",
	Rlocale_set_changed_callback: "not of a widget: for the whole application",
	Rset_device_reset_callback: "not of a widget: for what holds GPU resources",
	Rset_frame_callback: "not of a widget: shared with onFrame by src/core/frame.ts",
	Rxml_set_reload_callback: "not of a widget: XML hot reload, which React has no use for",
	Rtray_set_clicked_callback: "not of a widget: an icon of the system tray, made with Rtray_create",
	Rnotification_set_clicked_callback: "not of a widget: the notifications of Rnotification_show, for the whole application",
	Rviewport_set_draw_callback: "records Vulkan commands while a frame is drawn, on the render thread if there is one: through a ref",
	Rtile_view_set_drag_data_callback: "rare, and the indices C gives by default are enough: through a ref",
	Rwidget_set_destroy_callback: "React already says when an element goes: a cleanup of an effect",
	Rwidget_set_gesture_callback: "rare: through a ref, with inEventScope",
	Rwidget_set_pen_callback: "rare: through a ref, with inEventScope",
	Rwidget_set_touch_callback: "rare: through a ref, with inEventScope",
};

/** Action attributes of the schema that give nothing, and why: the others have a type in EVENT_VALUE_TYPES. */
const ACTIONS_WITHOUT_VALUE: Readonly<Record<string, string>> = {
	"*.Action": "the name of an action, not an event",
	"Button.OnClicked": "a click has no value",
	"Toast.OnClicked": "the one button of the message",
	"Timeline.OnChanged": "once per gesture: OnItemChanged says which item, as it happens",
	"NodeGraph.OnChanged": "once per gesture: OnLinked, OnMoved... say what",
};

/** Tags whose attributes the user does not change. */
const NO_USER_VALUE: readonly string[] = [
	"Window", "VBox", "HBox", "Grid", "UniformGrid", "Overlay", "Border", "SizeBox", "Spacer", "ScrollBox", "Splitter", "WrapBox", "Canvas", "Switcher",
	"Label", "Button", "ProgressBar", "Image", "Separator", "MenuBar", "Menu", "Viewport", "Custom", "HeaderBar", "BackgroundBlur", "Toast", "Breadcrumb",
	// (what the user selects in these has no attribute: it is read with Rtree_view_get_selected_item, Rtile_view_get_current)
	"TreeView", "TileView",
];

/** For the tags the user changes: their attributes that are settings of the application, not what the widget holds. */
const SETTINGS: Readonly<Record<string, string>> = {
	TabView: "OnChanged",
	Expander: "Title OnChanged",
	Checkbox: "Text Style OnChanged",
	Slider: "Min Max Step Orientation OnChanged",
	TextInput: "Placeholder Password ReadOnly MaxLength OnChanged OnCommitted",
	SpinBox: "Min Max Step Decimals OnChanged",
	ComboBox: "Items OnChanged",
	ListView: "Items OnChanged OnActivated",
	MenuItem: "Text Shortcut Checkable Separator OnClicked",
	TextEditor: "Language LineNumbers Wrap ReadOnly Placeholder TabSize TabSpaces Completion AutoPairs TextSize Zoomable Font Markdown OnChanged",
	// (Directory and FileName: what is shown first. No event says the user went elsewhere, and setting them again reloads the folder)
	FileBrowser: "Directory Mode Filter FileName DefaultExtension ShowHidden Multiple Controls Places",
	DockArea: "Movable CloseHides Tearable",
	Island: "ExpandOnHover ExpandOnClick Attached Notch",
	ColorPicker: "Previous Alpha Popup Compact Numbers Swatches OnChanged",
	// (Playing: Space toggles it in C with no callback, so putting it back would fight the user)
	Timeline: "Duration FrameRate Snapping Loop Playing HeaderWidth TrackHeight RulerHeight Preset ClipStyle ClipRadius KeyShape KeySize GridStyle PlayheadColor PlayheadWidth OnChanged",
	BlockEditor: "Palette OnChanged",
	NodeGraph: "Grid Flow ReadOnly FrameAll Preset LinkShape LinkWidth LinkGlow PinShape PinSize GridStyle GridSize NodeRadius HeaderStyle HeaderHeight OnChanged",
	Table: "Columns SortDescending ShowHeader GridLines Striped OnActivated",
	DatePicker: "Min Max FirstDayOfWeek Format OnChanged",
	TimePicker: "ShowSeconds MinuteStep OnChanged",
	Rating: "Max AllowHalf ReadOnly StarSize OnChanged",
	Pagination: "PageCount Siblings OnChanged",
	// (XMin and XMax are where the view starts: the user moves it, OnViewChanged says so, and setting them again would take it back)
	Plot: "Title Legend Crosshair MouseText Tooltips Grid XLabel XScale XMin XMax XFormat XLinearThreshold XGrid XInverted XLocked XVisible YLabel YScale Y2Label Y2Scale OnChanged",
};

/** The schema of the library: tag to its attributes, each with its kind. */
const schema = new Map<string, Map<string, number>>();

beforeAll(() => {
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_NULL;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
	const info = new r.RXmlAttributeInfo();
	for (let index = 0; index < r.Rxml_get_tag_count(); index++) {
		const tag = r.Rxml_get_tag_name(index) ?? "";
		const attributes = new Map<string, number>();
		for (let position = 0; position < r.Rxml_get_attribute_count(tag); position++) {
			if (r.Rxml_get_attribute_info(tag, position, info) && info.name) {
				attributes.set(info.name, info.type);
			}
		}
		schema.set(tag, attributes);
	}
});

afterAll(() => {
	r.Rshutdown();
});

/** What every widget has: what `Spacer`, which has nothing of its own, has. */
const common = (): ReadonlyMap<string, number> => schema.get("Spacer") ?? new Map();

test("the schema is not empty, and the tags an earlier regex missed are there", () => {
	expect(schema.size).toBeGreaterThan(40);
	for (const tag of ["Overlay", "Spacer", "MenuBar", "Custom"]) {
		expect(schema.has(tag)).toBe(true);
	}
});

test("every callback setter is wired to a prop, or has a reason not to be", () => {
	const setters = Object.keys(r).filter((name) => /^R(\w+_)?set_\w*callbacks?$/.test(name));
	const wired = new Set(wiredCallbacks());
	expect(setters.length).toBeGreaterThan(50);
	const undecided = setters.filter((name) => !wired.has(name) && !NOT_WIRED[name]);
	expect(undecided).toEqual([]);
	expect(setters.filter((name) => wired.has(name) && NOT_WIRED[name])).toEqual([]);
	// nothing stays listed after Raven took it away
	expect(Object.keys(NOT_WIRED).filter((name) => !setters.includes(name))).toEqual([]);
	expect([...wired].filter((name) => !setters.includes(name) && !/_set_(virtual_items|items|virtual_rows)$/.test(name))).toEqual([]);
});

test("every event of the schema gives its value, or has a reason not to", () => {
	const undecided: string[] = [];
	for (const [tag, attributes] of schema) {
		for (const [name, kind] of attributes) {
			const key = common().has(name) ? `*.${name}` : `${tag}.${name}`;
			if (kind === r.R_XML_ACTION && !EVENT_VALUE_TYPES[tag]?.[name] && !ACTIONS_WITHOUT_VALUE[key]) {
				undecided.push(key);
			}
		}
	}
	expect([...new Set(undecided)]).toEqual([]);
});

test("a prop with a native event is in the types", () => {
	const missing = wiredProps().filter(([tag, name]) => {
		const inSchema = schema.get(tag)?.has(name);
		const extra = (EXTRA_PROPS[tag] ?? []).some((line) => line.startsWith(`readonly ${name}?`));
		return !inSchema && !extra;
	});
	expect(missing).toEqual([]);
	expect(COMMON_PROPS.length).toBeGreaterThan(0);
});

test("every attribute of what the user changes is held by the renderer, or a setting", () => {
	const undecided: string[] = [];
	const stale: string[] = [];
	for (const [tag, attributes] of schema) {
		if (NO_USER_VALUE.includes(tag)) {
			expect(`${tag} ${SETTINGS[tag] ?? "no settings listed"}`).toBe(`${tag} no settings listed`);
			continue;
		}
		const settings = SETTINGS[tag];
		expect(`${tag}: ${settings !== undefined}`).toBe(`${tag}: true`);
		const known = new Set([...(settings ?? "").split(" "), ...controlledAttributes(tag)]);
		const own = [...attributes.keys()].filter((name) => !common().has(name) && !name.includes("."));
		undecided.push(...own.filter((name) => !known.has(name)).map((name) => `${tag}.${name}`));
		stale.push(...[...known].filter((name) => name && !attributes.has(name)).map((name) => `${tag}.${name}`));
	}
	expect(undecided).toEqual([]);
	expect(stale).toEqual([]);
});

test("every Color and Metric of the schema can go back to the theme", () => {
	const lost = [...new Set([...schema.values()].flatMap((attributes) => [...attributes.keys()]))]
		.filter((name) => name.startsWith("Color.") || name.startsWith("Metric."))
		.filter((name) => overrideOf(name) === undefined);
	expect(lost).toEqual([]);
});

test("the library has all the functions of the binding, and the check for it sees a missing one", async () => {
	const binding = await Bun.file(`${import.meta.dir}/../../vendor/raven.ts`).text();
	const functions = functionsOfBinding(binding);
	expect(functions.length).toBeGreaterThan(900);
	const library = Buffer.from(await Bun.file(process.env["RAVEN_LIBRARY"] ?? "").arrayBuffer());
	expect(missingFunctions(functions, library)).toEqual([]);
	expect(missingFunctions([...functions, "Rnot_there_yet"], library)).toEqual(["Rnot_there_yet"]);
	// (not a library: it says nothing rather than something false)
	expect(missingFunctions(functions, Buffer.from("nothing"))).toEqual([]);
});

test("a stamp spares a library the search for missing functions only if it was checked", async () => {
	const functions = functionsOfBinding(await Bun.file(`${import.meta.dir}/../../vendor/raven.ts`).text());
	const pin = await readPin();
	const directory = mkdtempSync(`${tmpdir()}/raven-stamp-`);
	const library = `${directory}/library`;
	const stampIt = (verified: boolean): void => writeFileSync(`${directory}/${STAMP_FILE}`, JSON.stringify({ commit: "", pin, version: "", sha256: "", verified }));
	const warn = console.warn;
	try {
		console.warn = (): void => {};
		writeFileSync(library, functions.slice(1).join(" "));
		stampIt(true);
		expect(() => checkLibrary(library)).not.toThrow();
		stampIt(false);
		expect(() => checkLibrary(library)).toThrow(functions[0]);
	} finally {
		console.warn = warn;
		rmSync(directory, { recursive: true });
	}
});

test("the components are what generating them again gives", () => {
	const run = Bun.spawnSync(["bun", "run", "src/tools/generate-components.ts", "--check"], { cwd: `${import.meta.dir}/../../..`, stdout: "pipe", stderr: "pipe" });
	expect(run.stderr.toString()).toBe("");
	expect(run.success).toBe(true);
});

const HEADER = `
/* a comment with RAVEN_API void Rnot_this(void); */
#define RAVEN_API __attribute__((visibility("default")))
typedef void (*RFooCallback)(Rid foo,
	int value, void* user_data);
RAVEN_API const char* Rfoo_get_text(Rid foo);
RAVEN_API void Rfoo_set_callback(Rid foo, RFooCallback callback,
	void* user_data);
`;

const SCHEMA = `
#define ORIENTATION "Horizontal|Vertical"
#define T(name, description) { name, R_XML_TEXT, NULL, description }
static const rvn_schema_attribute_t g_widget[] = {
	T("Name", "Name of the widget, for \\"find\\"."),
};
static const rvn_schema_attribute_t g_foo[] = {
	N("Size", "How large."),
	C("Way", ORIENTATION, "Which way."),
	C("Style", "A|B", "Its look."),
	A("OnChanged", "Fired."),
};
static const rvn_schema_tag_t g_tags[] = {
	TAG("Foo", g_foo, "A foo."),
	TAG_PLAIN("Bar", "A bar."),
};
`;

test("the API is read from headers and from the schema", () => {
	const { functions, callbacks } = parseHeader(HEADER);
	expect([...functions.keys()]).toEqual(["Rfoo_get_text", "Rfoo_set_callback"]);
	expect(functions.get("Rfoo_set_callback")).toBe("void Rfoo_set_callback(Rid foo, RFooCallback callback, void* user_data)");
	expect(callbacks.get("RFooCallback")).toBe("void (Rid foo, int value, void* user_data)");
	const { tags, attributes } = parseSchema(SCHEMA);
	expect([...tags]).toEqual(["Foo", "Bar"]);
	expect(Object.fromEntries(attributes)).toEqual({ "Foo.Size": "N", "Foo.Way": "C[Horizontal|Vertical]", "Foo.Style": "C[A|B]", "Foo.OnChanged": "A", "*.Name": "T" });
});

test("a table of the window alone is not taken for one every widget shares", () => {
	const { attributes } = parseSchema(`
static const rvn_schema_attribute_t g_touch[] = { B("Touch.Gestures", "Shared."), };
static const rvn_schema_attribute_t g_window_touch[] = { N("Touch.Gestures", "Of a window."), };
`);
	expect(Object.fromEntries(attributes)).toEqual({ "*.Touch.Gestures": "B", "Window.Touch.Gestures": "N" });
});

test("a library that cannot be the build of a checkout is not stamped as such", () => {
	const commitTime = 1_000_000;
	expect(provenanceProblem("/raven/build/libraven.so", "/raven", commitTime + 1, commitTime)).toBeNull();
	expect(provenanceProblem("/elsewhere/libraven.so", "/raven", commitTime + 1, commitTime)).toContain("is not in");
	expect(provenanceProblem("/raven-other/libraven.so", "/raven", commitTime + 1, commitTime)).toContain("is not in");
	expect(provenanceProblem("/raven/build/libraven.so", "/raven", commitTime - 1, commitTime)).toContain("older");
});

test("a checkout git cannot read is not taken for a clean one", () => {
	const script = `import { dirtyPaths } from ${JSON.stringify(`${import.meta.dir}/../../tools/raven-pin`)}; dirtyPaths("/nonexistent/raven-checkout"); console.log("clean");`;
	const run = Bun.spawnSync([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" });
	expect(run.stdout.toString()).not.toContain("clean");
	expect(run.exitCode).toBe(1);
	expect(run.stderr.toString()).toContain("git status failed");
});

test("what differs between two APIs is said by name", () => {
	const before = parseApi([HEADER], SCHEMA);
	const after = parseApi(
		[HEADER.replace("Rid foo, RFooCallback", "Rid foo, int extra, RFooCallback").replace("Rfoo_get_text", "Rfoo_read_text").concat("RAVEN_API void Rbaz_set_changed_callback(Rid baz, RFooCallback callback, void* user_data);")],
		SCHEMA.replace('TAG_PLAIN("Bar", "A bar."),', 'TAG_PLAIN("Bar", "A bar."), TAG_PLAIN("Baz", "A baz."),').replace('N("Size", "How large."),', 'T("Size", "How large."), B("Round", "Is it."),'),
	);
	const diff = diffApi(before, after);
	expect(diff.functions.added).toEqual(["Rbaz_set_changed_callback", "Rfoo_read_text"]);
	expect(diff.functions.removed).toEqual(["Rfoo_get_text"]);
	expect(diff.functions.changed.map(([name]) => name)).toEqual(["Rfoo_set_callback"]);
	expect(diff.tags.added).toEqual(["Baz"]);
	expect(diff.attributes.added).toEqual(["Foo.Round"]);
	expect(diff.attributes.changed).toEqual([["Foo.Size", "N", "T"]]);
	expect(newCallbackSetters(diff)).toEqual(["Rbaz_set_changed_callback"]);
	expect(countOf(diff)).toBe(7);
	expect(formatDiff(diff).join("\n")).toContain("+ 2 functions: Rbaz_set_changed_callback Rfoo_read_text");
	expect(countOf(diffApi(before, before))).toBe(0);
});

/**
 * The API read from the sources of the pin. Without a checkout there is nothing to read, and that
 * is fine on a machine that has none. `RAVEN_CHECKOUT` says there is one, as in CI: then it must
 * work, so that this check cannot stop running without anyone seeing.
 */
async function apiOfCheckout(): Promise<RavenApi | null> {
	const required = process.env["RAVEN_CHECKOUT"];
	const checkout = resolve(required ?? `${import.meta.dir}/../../../../../../../raven`);
	const pin = await readPin();
	const commit = existsSync(checkout) ? commitOf(checkout, pin) : null;
	if (!commit) {
		if (required) {
			throw new Error(`RAVEN_CHECKOUT is ${required}, which does not have ${pin}`);
		}
		return null;
	}
	return apiAt(checkout, commit);
}

test("what is read from the sources is what the library and the binding say", async () => {
	const api = await apiOfCheckout();
	if (!api) {
		return;
	}
	expect([...schema.keys()]).toEqual([...api.tags]);
	for (const [tag, attributes] of schema) {
		const fromSource = new Set([...api.attributes.keys()].filter((name) => name.startsWith(`${tag}.`)).map((name) => name.slice(tag.length + 1)));
		for (const name of fromSource) {
			expect(`${tag}.${name}: ${attributes.has(name)}`).toBe(`${tag}.${name}: true`);
		}
	}
	const binding = functionsOfBinding(await Bun.file(`${import.meta.dir}/../../vendor/raven.ts`).text());
	expect(binding.filter((name) => !api.functions.has(name))).toEqual([]);
});
