/**
 * Writes the props of each tag from Raven's own schema, and a typed component per tag for each
 * adapter, so that new tags and attributes of the library are one run away:
 *
 *     bun run generate
 *     bun run generate --check     fails if a file is not what this would write
 *
 * `core/props.generated.ts` holds the props and knows no framework. `react/components.generated.ts`
 * holds the React wrappers, which add `key`, `ref` and `children`.
 */

import * as r from "../core/raven";
import { COMMON_PROPS, EVENT_VALUE_TYPES, EXTRA_PROPS } from "../core/events";
import { acceptUndefined } from "./optional-undefined";

/** Choices the schema lists among others it does not: the name of a loaded theme, or `Language="Markdown"`. */
const OPEN_CHOICES: ReadonlySet<string> = new Set(["Theme", "Language"]);

/**
 * Events whose function and action fire at different moments. These widgets have one action, which
 * fires for their other event: Enter in a TextInput, activating a row in the lists. A name given
 * here would fire then, and not at each change, so these take a function only.
 */
const FUNCTION_ONLY: Readonly<Record<string, string>> = { TextInput: "OnChanged", ListView: "OnChanged", TreeView: "OnChanged" };

/** The TypeScript of an attribute, from what the schema says of it. */
function typeOf(tag: string, info: r.RXmlAttributeInfo): string {
	const name = info.name ?? "";
	if (info.type === r.R_XML_ACTION) {
		const value = EVENT_VALUE_TYPES[tag]?.[name];
		// (one with a name in it is already a list of parameters: `line: number, value: number`)
		const parameters = value?.includes(":") ? value : `value: ${value}`;
		if (value && FUNCTION_ONLY[tag] === name) {
			return `((${parameters}) => void)`;
		}
		// (a text is the name of an action: "app.quit", or one given to useAction)
		return value ? `string | ((${parameters}) => void)` : "string | (() => void)";
	}
	if (info.choices) {
		const choices = info.choices.split("|").map((choice) => JSON.stringify(choice)).join(" | ");
		// (`string & {}` takes any text, and editors still propose the choices)
		return OPEN_CHOICES.has(name) ? `${choices} | (string & {})` : choices;
	}
	switch (info.type) {
		case r.R_XML_NUMBER:
			return "number";
		case r.R_XML_BOOL:
			return "boolean";
		case r.R_XML_NUMBERS:
			return "number | string | readonly number[]";
		case r.R_XML_LIST:
			return "string | readonly string[]";
		default:
			return "string | number";
	}
}

/** The props of a tag: `Slot.Padding` is written `Slot={{ Padding: 24 }}`, JSX having no dots in names. */
function propsOf(tag: string): string {
	const props = new Map<string, string>();
	const groups = new Map<string, string[]>();
	const info = new r.RXmlAttributeInfo();
	for (let index = 0; index < r.Rxml_get_attribute_count(tag); index++) {
		if (!r.Rxml_get_attribute_info(tag, index, info) || !info.name) {
			continue;
		}
		const dot = info.name.indexOf(".");
		if (dot > 0) {
			const group = info.name.slice(0, dot);
			// (an override of the theme can be taken back without making the widget again)
			const clearable = group === "Color" || group === "Metric" ? " | null" : "";
			groups.set(group, [...(groups.get(group) ?? []), `readonly ${JSON.stringify(info.name.slice(dot + 1))}?: ${typeOf(tag, info)}${clearable}`]);
		} else {
			props.set(info.name, typeOf(tag, info));
		}
	}
	// a name can be both an attribute and a group (Color and Color.Window): either form is taken
	const lines = [...props].filter(([name]) => !groups.has(name)).map(([name, type]) => `readonly ${name}?: ${type}`);
	// (a name the schema has too would be a duplicate in the type: the schema's stays)
	const extra = (EXTRA_PROPS[tag] ?? []).filter((line) => !props.has(line.match(/^readonly (\w+)/)?.[1] ?? ""));
	lines.push(...extra, ...(tag === "Window" ? [] : COMMON_PROPS));
	for (const [name, entries] of groups) {
		const alone = props.get(name);
		lines.push(`readonly ${name}?: ${alone ? `${alone} | ` : ""}{ ${entries.join("; ")} }`);
	}
	return lines.join("; ");
}

const desc = new r.RInitDesc();
desc.backend = r.R_BACKEND_NULL;
desc.headless = 1;
if (!r.Rinit_ex(desc)) {
	console.error("cannot start Raven");
	process.exit(1);
}

const HEADER = "// Generated from the schema of Raven by src/tools/generate-components.ts: do not edit.";

/** The props of every tag, without a framework. */
const core = [
	HEADER,
	'import type { Pointer } from "bun:ffi";',
	'import type { MeasuredSize, Painter, PlotView } from "./events";',
	'import type { PlotDragLine, PlotSeries, TreeItem } from "./props";',
	'import type { RDropEvent, REvent, Rid, RTileItem } from "./raven";',
];

/** The React wrappers. */
const react = [
	HEADER,
	'import { createElement, type Key, type ReactElement, type ReactNode, type Ref } from "react";',
	'import type * as Props from "../core/props.generated";',
	'import type { WidgetInstance } from "../core/widget-instance";',
	'import type { WindowInstance } from "../core/window-instance";',
	"",
	"/** The props every component has from React. */",
	"interface ReactProps<R> {",
	"\treadonly key?: Key;",
	"\treadonly ref?: Ref<R>;",
	"\treadonly children?: ReactNode;",
	"}",
	"",
	"/**",
	" * A component for a tag of Raven, or one given to `Rxml_register_tag` with its props.",
	" * JSX takes a capitalized name for a value, not for a tag.",
	" */",
	"export function tag<P extends object, R = WidgetInstance>(name: string): (props: P & ReactProps<R>) => ReactElement {",
	"\treturn (props) => createElement(name, props);",
	"}",
];
let components = 0;
for (let index = 0; index < r.Rxml_get_tag_count(); index++) {
	const name = r.Rxml_get_tag_name(index);
	if (!name || !/^[A-Z][A-Za-z0-9]*$/.test(name)) {
		continue;
	}
	const description = r.Rxml_get_tag_description(name);
	const comment = description ? [`/** ${description.replace(/\*\//g, "*\\/")} */`] : [];
	core.push("");
	react.push("");
	if (name === "Window") {
		// not a widget: its attributes are also what createWindow and runApp take
		core.push(
			"/** The attributes of a window, for `<Window>`, `createWindow` and `runApp`. */",
			`export interface WindowOptions { ${propsOf(name)} }`,
			"",
			"/** The props of `<Window>`: its attributes, and what it tells the application. */",
			"export type WindowProps = WindowOptions & { readonly OnClose?: () => void; readonly OnResize?: (width: number, height: number) => void; readonly OnDrop?: (event: RDropEvent) => boolean | void };",
		);
		react.push(
			"/**",
			" * A window of its own, wherever it is in the tree: it opens with its element and closes with it.",
			" * With `OnClose`, closing is a request: the window stays until the element is taken out.",
			" */",
			'export const Window = tag<Props.WindowProps, WindowInstance>("Window");',
		);
		continue;
	}
	core.push(...comment, `export interface ${name}Props { ${propsOf(name)} }`);
	react.push(...comment, `export const ${name} = tag<Props.${name}Props>(${JSON.stringify(name)});`);
	components++;
}
/** The names of a group every widget has (`Color.Window`, `Metric.FontSize`), or the choices of one of its attributes. */
function commonNames(prefix: string): string[] {
	const names: string[] = [];
	const info = new r.RXmlAttributeInfo();
	// (Spacer has nothing of its own: what it has, every widget has)
	for (let index = 0; index < r.Rxml_get_attribute_count("Spacer"); index++) {
		if (r.Rxml_get_attribute_info("Spacer", index, info) && info.name) {
			if (info.name.startsWith(`${prefix}.`)) {
				names.push(info.name.slice(prefix.length + 1));
			} else if (info.name === prefix && info.choices) {
				names.push(...info.choices.split("|"));
			}
		}
	}
	if (names.length === 0) {
		// (a union of nothing is no TypeScript: better to stop than to write a broken file)
		console.error(`the schema of Raven gives no ${prefix} names: the types of themes cannot be written`);
		process.exit(1);
	}
	return names;
}

// what themes take, by name: theme.ts types its colors, metrics and materials with these
core.push(
	"",
	"/** A role of the colors of a theme: `Color={{ Window: ... }}`, and the colors of `defineTheme`. */",
	`export type ColorRole = ${commonNames("Color").map((name) => JSON.stringify(name)).join(" | ")};`,
	"",
	"/** A metric of a theme: `Metric={{ FontSize: ... }}`, and the metrics of `defineTheme`. */",
	`export type MetricName = ${commonNames("Metric").map((name) => JSON.stringify(name)).join(" | ")};`,
	"",
	"/** What a widget, or a theme, is made of. */",
	`export type MaterialName = ${commonNames("Material").map((name) => JSON.stringify(name)).join(" | ")};`,
);

/**
 * A generated file as an application compiles it: no name imported for types and left unused
 * (`noUnusedLocals`), and optional props that take `undefined` (`exactOptionalPropertyTypes`).
 */
function finish(lines: readonly string[]): string {
	const [header = "", ...rest] = lines;
	const body = rest.filter((line) => !line.startsWith("import ")).join("\n");
	const imports = rest.filter((line) => line.startsWith("import ")).flatMap((line) => {
		const [, names, from] = line.match(/^import type \{ (.+) \} from (".+");$/) ?? [];
		if (names === undefined || from === undefined) {
			// (a value or a namespace: kept as it is)
			return [line];
		}
		const used = names.split(", ").filter((name) => new RegExp(`\\b${name}\\b`).test(body));
		return used.length > 0 ? [`import type { ${used.join(", ")} } from ${from};`] : [];
	});
	return `${acceptUndefined([header, ...imports, body].join("\n"))}\n`;
}

const outputs: ReadonlyArray<readonly [string, string]> = [
	[`${import.meta.dir}/../core/props.generated.ts`, finish(core)],
	[`${import.meta.dir}/../react/components.generated.ts`, finish(react)],
];
r.Rshutdown();
if (process.argv.includes("--check")) {
	for (const [path, text] of outputs) {
		if ((await Bun.file(path).text()).replace(/\r\n/g, "\n") !== text) {
			console.error(`${path} is not what the library and the event tables give: bun run generate`);
			process.exit(1);
		}
		console.log(`${path} matches`);
	}
} else {
	for (const [path, text] of outputs) {
		await Bun.write(path, text);
	}
	console.log(`${components} components`);
}
