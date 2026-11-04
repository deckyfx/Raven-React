/** What the notepad adds to the editor: a language of its own, and proposals. */

import { raven } from "@decky.fx/raven-react";

/** A language of our own: the editor only needs to be told what its words and comments look like. */
export function registerIni(): void {
	const ini = new raven.RLanguageDesc();
	ini.name = "INI";
	ini.extensions = "ini;cfg;conf";
	ini.constants = "true false yes no on off";
	ini.line_comment = ";";
	ini.string_quotes = "\"";
	ini.flags = raven.R_LANGUAGE_IGNORE_CASE;
	raven.Rlanguage_register(ini);
}

/** The names of the languages in the list of the header: the library's, and the one registered above. */
export function languageNames(): readonly string[] {
	const names: string[] = [];
	for (let index = 0; index < raven.Rlanguage_get_count(); index++) {
		names.push(raven.Rlanguage_get_name(index) ?? "");
	}
	return names;
}

/** A few snippets by language. A language server would answer in the same place. */
const SNIPPETS: Readonly<Record<string, readonly string[]>> = {
	C: ["printf(\"%d\\n\", );", "for (int i = 0; i < n; i++) {", "#include <stdio.h>"],
	"C++": ["std::cout << "],
	Python: ["print(f\"{}\")", "if __name__ == \"__main__\":"],
	Rust: ["println!(\"{}\", );"],
	JavaScript: ["console.log();"],
	HTML: ["<!DOCTYPE html>"],
	Java: ["System.out.println();"],
};

/**
 * Proposals of the application, listed before those of the editor (the words of the
 * language and the names already in the text). The editor only keeps those that start
 * with what is typed. This is given to the editor once: it is not made per render.
 */
export function proposeWords(editor: raven.Rid): void {
	for (const text of SNIPPETS[raven.Rtext_editor_get_language(editor) ?? ""] ?? []) {
		raven.Rtext_editor_add_completion(editor, text, "snippet");
	}
	raven.Rtext_editor_add_completion(editor, "TODO", "note");
	raven.Rtext_editor_add_completion(editor, "FIXME", "note");
}

/** The most notes marked in a text. */
const MOST_NOTES = 200;

/** Underlines the lines that say TODO or FIXME, and returns how many there are. */
export function markNotes(editor: raven.Rid): number {
	const lines = raven.Rtext_editor_get_line_count(editor);
	let found = 0;
	raven.Rtext_editor_clear_markers(editor);
	for (let line = 0; line < lines && found < MOST_NOTES; line++) {
		const content = raven.Rtext_editor_get_line(editor, line) ?? "";
		const fixme = content.indexOf("FIXME");
		const todo = content.indexOf("TODO");
		if (fixme >= 0) {
			raven.Rtext_editor_add_marker(editor, line, fixme, -1, raven.R_MARKER_WARNING, "Something to fix");
			found++;
		} else if (todo >= 0) {
			raven.Rtext_editor_add_marker(editor, line, todo, -1, raven.R_MARKER_INFO, "Something left to do");
			found++;
		}
	}
	return found;
}
