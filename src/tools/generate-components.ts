/**
 * Writes one typed component per tag from Raven's own schema, so that new tags and
 * attributes of the library are one run away:
 *
 *     bun run generate
 */

import * as r from "../raven";
import { EVENT_VALUE_TYPES } from "../events";

/** The TypeScript of an attribute, from what the schema says of it. */
function typeOf(tag: string, info: r.RXmlAttributeInfo): string {
	const name = info.name ?? "";
	if (info.type === r.R_XML_ACTION) {
		const value = EVENT_VALUE_TYPES[tag]?.[name];
		return value ? `(value: ${value}) => void` : "() => void";
	}
	if (info.choices) {
		return info.choices.split("|").map((choice) => JSON.stringify(choice)).join(" | ");
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
			groups.set(group, [...(groups.get(group) ?? []), `readonly ${JSON.stringify(info.name.slice(dot + 1))}?: ${typeOf(tag, info)}`]);
		} else {
			props.set(info.name, typeOf(tag, info));
		}
	}
	// a name can be both an attribute and a group (Color and Color.Window): either form is taken
	const lines = [...props].filter(([name]) => !groups.has(name)).map(([name, type]) => `readonly ${name}?: ${type}`);
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
	'import { createElement, type Key, type ReactElement, type ReactNode } from "react";',
	"",
	"/** The props every component has from React. */",
	"interface ReactProps {",
	"\treadonly key?: Key;",
	"\treadonly children?: ReactNode;",
	"}",
	"",
	"/** A component for a tag of Raven. JSX takes a capitalized name for a value, not for a tag. */",
	"function tag<P extends object>(name: string): (props: P & ReactProps) => ReactElement {",
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
		// not a widget: it is what createWindow and runApp take
		out.push("/** The attributes of a window, for `createWindow` and `runApp`. */", `export interface WindowOptions { ${propsOf(name)} }`);
		continue;
	}
	if (description) {
		out.push(`/** ${description.replace(/\*\//g, "*\\/")} */`);
	}
	out.push(`export const ${name} = tag<{ ${propsOf(name)} }>(${JSON.stringify(name)});`);
	components++;
}
await Bun.write(process.argv[2] ?? "src/components.generated.ts", `${out.join("\n")}\n`);
console.log(`${components} components`);
r.Rshutdown();
