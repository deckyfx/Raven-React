/**
 * The public API of Raven at a commit, read from its sources without building it: the
 * functions and callback types of the headers, and the tags and attributes of the schema.
 */

/** What Raven offers: each name with what would change if it changed. */
export interface RavenApi {
	readonly functions: ReadonlyMap<string, string>;
	readonly callbacks: ReadonlyMap<string, string>;
	readonly tags: ReadonlySet<string>;
	/** `Tag.Attribute` to its kind. `*.Attribute` is for what many tags share. */
	readonly attributes: ReadonlyMap<string, string>;
}

/** What differs for one kind of name. */
export interface Changes {
	readonly added: readonly string[];
	readonly removed: readonly string[];
	/** Name, before and after. */
	readonly changed: ReadonlyArray<readonly [string, string, string]>;
}

/** What differs between two APIs. */
export interface ApiDiff {
	readonly functions: Changes;
	readonly callbacks: Changes;
	readonly tags: Changes;
	readonly attributes: Changes;
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").replace(/\s*\*\s*/g, "* ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();

/** The functions and callback types of the text of a header. */
export function parseHeader(text: string): Pick<RavenApi, "functions" | "callbacks"> {
	const code = text
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/\/\/[^\n]*/g, " ")
		.replace(/^[ \t]*#.*(?:\\\r?\n.*)*$/gm, " ");
	const functions = new Map<string, string>();
	for (const [, declaration = ""] of code.matchAll(/\bRAVEN(?:_WEB)?_API\s+([^;]+);/g)) {
		const name = declaration.match(/(\w+)\s*\(/)?.[1];
		if (name) {
			functions.set(name, oneLine(declaration));
		}
	}
	const callbacks = new Map<string, string>();
	for (const [, returned = "", name = "", parameters = ""] of code.matchAll(/typedef\s+([^;()]*?)\(\s*\*\s*(\w+)\s*\)\s*\(([^;]*)\)\s*;/g)) {
		callbacks.set(name, oneLine(`${returned}(${parameters})`));
	}
	return { functions, callbacks };
}

/** Tables no `TAG` names that still belong to one tag: the rest are shared by every widget. */
const TABLES_OF_ONE_TAG: Readonly<Record<string, string>> = { g_window_touch: "Window" };

/** The tags and attributes of the text of `src/xml/xml_schema.c`. */
export function parseSchema(text: string): Pick<RavenApi, "tags" | "attributes"> {
	const macros = new Map(Array.from(text.matchAll(/^#define (\w+) "([^"]*)"$/gm), ([, name = "", value = ""]) => [name, value]));
	const tables = new Map<string, Map<string, string>>();
	for (const [, name = "", body = ""] of text.matchAll(/rvn_schema_attribute_t (\w+)\[\] = \{([\s\S]*?)\};/g)) {
		const table = new Map<string, string>();
		for (const [, kind = "", attribute = "", choices] of body.matchAll(/\b([TBNCKAFVL])\("([^"]+)"(?:,\s*(\w+|"[^"]*"))?/g)) {
			const value = kind === "C" && choices ? `C[${choices.startsWith('"') ? choices.slice(1, -1) : (macros.get(choices) ?? choices)}]` : kind;
			table.set(attribute, value);
		}
		tables.set(name, table);
	}
	const tags = new Set<string>();
	const used = new Set<string>();
	const attributes = new Map<string, string>();
	for (const [, tag = "", table] of text.matchAll(/\bTAG(?:_PLAIN)?\("(\w+)"(?:,\s*(g_\w+))?/g)) {
		tags.add(tag);
		if (table) {
			used.add(table);
			for (const [name, kind] of tables.get(table) ?? []) {
				attributes.set(`${tag}.${name}`, kind);
			}
		}
	}
	for (const [name, table] of tables) {
		if (!used.has(name)) {
			const owner = TABLES_OF_ONE_TAG[name] ?? "*";
			for (const [attribute, kind] of table) {
				attributes.set(`${owner}.${attribute}`, kind);
			}
		}
	}
	return { tags, attributes };
}

/** The API from the texts of its headers and of its schema. */
export function parseApi(headers: readonly string[], schema: string): RavenApi {
	const functions = new Map<string, string>();
	const callbacks = new Map<string, string>();
	for (const header of headers) {
		const parsed = parseHeader(header);
		parsed.functions.forEach((value, name) => functions.set(name, value));
		parsed.callbacks.forEach((value, name) => callbacks.set(name, value));
	}
	return { functions, callbacks, ...parseSchema(schema) };
}

/** What differs between two tables of names. */
function changesOf(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): Changes {
	return {
		added: [...after.keys()].filter((name) => !before.has(name)).sort(),
		removed: [...before.keys()].filter((name) => !after.has(name)).sort(),
		changed: [...after]
			.flatMap(([name, value]): Array<readonly [string, string, string]> => {
				const old = before.get(name);
				return old !== undefined && old !== value ? [[name, old, value]] : [];
			})
			.sort(([a], [b]) => a.localeCompare(b)),
	};
}

const asTable = (names: ReadonlySet<string>): ReadonlyMap<string, string> => new Map([...names].map((name) => [name, ""]));

/** What differs between two APIs. */
export function diffApi(before: RavenApi, after: RavenApi): ApiDiff {
	return {
		functions: changesOf(before.functions, after.functions),
		callbacks: changesOf(before.callbacks, after.callbacks),
		tags: changesOf(asTable(before.tags), asTable(after.tags)),
		attributes: changesOf(before.attributes, after.attributes),
	};
}

/** How many names differ. */
export function countOf(diff: ApiDiff): number {
	return Object.values(diff).reduce((sum: number, { added, removed, changed }: Changes) => sum + added.length + removed.length + changed.length, 0);
}

/** The per-widget callback setters that a diff adds: each must be wired or classified. */
export function newCallbackSetters(diff: ApiDiff): string[] {
	return diff.functions.added.filter((name) => /^R(\w+_)?set_\w*callbacks?$/.test(name));
}

/** A diff as a few lines: a line per kind and direction, long ones cut unless `full`. */
export function formatDiff(diff: ApiDiff, full = false): string[] {
	const limit = full ? Number.POSITIVE_INFINITY : 8;
	const names = (list: readonly string[]): string => `${list.slice(0, limit).join(" ")}${list.length > limit ? ` ... ${list.length - limit} more` : ""}`;
	const lines: string[] = [];
	for (const [kind, { added, removed, changed }] of Object.entries(diff) as ReadonlyArray<[string, Changes]>) {
		if (added.length > 0) {
			lines.push(`  + ${added.length} ${kind}: ${names(added)}`);
		}
		if (removed.length > 0) {
			lines.push(`  - ${removed.length} ${kind}: ${names(removed)}`);
		}
		if (changed.length > 0) {
			lines.push(`  ~ ${changed.length} ${kind}:`);
			for (const [name, before, after] of changed.slice(0, limit)) {
				lines.push(`      ${name}`, `        was ${before}`, `        now ${after}`);
			}
			if (changed.length > limit) {
				lines.push(`      ... ${changed.length - limit} more`);
			}
		}
	}
	return lines;
}
