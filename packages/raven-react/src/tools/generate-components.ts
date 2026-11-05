/**
 * Writes one typed component per tag from Raven's own schema, so that new tags and
 * attributes of the library are one run away:
 *
 *     bun run generate
 *     bun run generate --check     fails if the file is not what this would write
 */

import * as r from "../raven";
import { COMMON_PROPS, EVENT_VALUE_TYPES, EXTRA_PROPS } from "../events";

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
		if (value && FUNCTION_ONLY[tag] === name) {
			return `((value: ${value}) => void)`;
		}
		// (a text is the name of an action: "app.quit", or one given to useAction)
		return value ? `string | ((value: ${value}) => void)` : "string | (() => void)";
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
	lines.push(...(EXTRA_PROPS[tag] ?? []), ...(tag === "Window" ? [] : COMMON_PROPS));
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

const out = [
	"// Generated from the schema of Raven by src/tools/generate-components.ts: do not edit.",
	'import { createElement, type Key, type ReactElement, type ReactNode, type Ref } from "react";',
	'import type { Pointer } from "bun:ffi";',
	'import type { MeasuredSize, Painter } from "./events";',
	'import type { TreeItem } from "./props";',
	'import type { RDropEvent, REvent, Rid, RTileItem } from "./raven";',
	'import type { WidgetInstance } from "./widget-instance";',
	'import type { WindowInstance } from "./window-instance";',
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
	out.push("");
	if (name === "Window") {
		// not a widget: its attributes are also what createWindow and runApp take
		out.push("/** The attributes of a window, for `<Window>`, `createWindow` and `runApp`. */", `export interface WindowOptions { ${propsOf(name)} }`, "");
		out.push(
			"/**",
			" * A window of its own, wherever it is in the tree: it opens with its element and closes with it.",
			" * With `OnClose`, closing is a request: the window stays until the element is taken out.",
			" */",
			'export const Window = tag<WindowOptions & { readonly OnClose?: () => void; readonly OnResize?: (width: number, height: number) => void; readonly OnDrop?: (event: RDropEvent) => boolean | void }, WindowInstance>("Window");',
		);
		continue;
	}
	if (description) {
		out.push(`/** ${description.replace(/\*\//g, "*\\/")} */`);
	}
	out.push(`export const ${name} = tag<{ ${propsOf(name)} }>(${JSON.stringify(name)});`);
	components++;
}
const path = process.argv[2] ?? "src/components.generated.ts";
const text = `${out.join("\n")}\n`;
r.Rshutdown();
if (process.argv.includes("--check")) {
	if ((await Bun.file(path).text()).replace(/\r\n/g, "\n") !== text) {
		console.error(`${path} is not what the library and the event tables give: bun run generate`);
		process.exit(1);
	}
	console.log(`${path} matches`);
} else {
	await Bun.write(path, text);
	console.log(`${components} components`);
}
