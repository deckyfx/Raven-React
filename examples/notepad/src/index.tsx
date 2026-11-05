/**
 * A small text editor: what a real one is made of. The port of `examples/notepad` of Raven.
 *
 *   custom header     the title bar is a widget of the window
 *   TextEditor        several lines, undo, clipboard; with a language: colors, proposals
 *                     while typing, brackets, indentation, Ctrl+/. Driven through a ref
 *   languages         the list of the library, chosen from the name of the file, plus INI
 *   completion        a callback adds its own proposals to those of the editor
 *   markers           the lines that say TODO or FIXME are underlined
 *   file dialogs      the ones of the system
 *   message box       "discard the changes?" before losing them
 *   drag and drop     a file dropped on the window is opened
 *
 * Run it with a file to open it: bun run src/index.tsx main.c
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
	ComboBox,
	HBox,
	HeaderBar,
	Label,
	raven,
	runApp,
	Separator,
	TextEditor,
	VBox,
	Window,
	type WidgetInstance,
	type WindowInstance,
} from "@decky.fx/raven-react";
import { languageNames, markNotes, proposeWords, registerIni } from "./languages";
import { NotepadMenus, type MenuActions } from "./NotepadMenus";

const WELCOME = `/* Raven Notepad: this text is C, so the editor colors it. */
#include <stdio.h>

/* TODO: type "pri" on an empty line and choose a proposal with Enter */
static int square(int value) {
	return value * value;
}

int main(void) {
	for (int i = 0; i < 4; i++) {
		printf("%d squared is %d\\n", i, square(i));
	}
	return 0; /* FIXME: put the cursor after a brace to see the one it closes */
}
`;

/** How long the typing must pause before the notes are looked for again. */
const SCAN_DELAY_MS = 400;

/** The last part of a path. */
function fileName(path: string): string {
	return path.split(/[\\/]/).pop() ?? path;
}

/** A filter of a file dialog. */
function fileFilter(name: string, patterns: string): raven.RFileFilter {
	const filter = new raven.RFileFilter();
	filter.name = name;
	filter.patterns = patterns;
	return filter;
}

/** The filters of the file dialogs. */
function fileFilters(): readonly raven.RFileFilter[] {
	return [
		fileFilter("Text and code", "*.txt;*.md;*.c;*.h;*.cpp;*.hpp;*.cs;*.java;*.js;*.ts;*.py;*.rs;*.html;*.css;*.xml;*.json;*.ini"),
		fileFilter("All files", "*"),
	];
}

/** What a file dialog is asked. */
function fileDialog(window: raven.Rid, title: string, name: string | null): raven.RFileDialogDesc {
	const desc = new raven.RFileDialogDesc();
	desc.parent = window;
	desc.title = title;
	desc.file_name = name;
	desc.filters = fileFilters();
	return desc;
}

/** The notepad. */
function App(): ReactNode {
	const window = useRef<WindowInstance>(null);
	const editor = useRef<WidgetInstance>(null);
	const [languages] = useState(languageNames);
	const [path, setPath] = useState("");
	const [modified, setModified] = useState(false);
	const [language, setLanguage] = useState<string | null>("C");
	const [status, setStatus] = useState("Drop a file on the window to open it.");
	const [notes, setNotes] = useState(0);
	const [position, setPosition] = useState("");
	const [lineNumbers, setLineNumbers] = useState(true);
	const [wrap, setWrap] = useState(false);
	const [edits, setEdits] = useState(0);

	/** Underlines the notes of the text, and says how many there are. */
	const scanNotes = (): void => {
		if (editor.current) {
			setNotes(markNotes(editor.current.widget));
		}
	};

	/** True when the text can be replaced: nothing to lose, or the user agreed to lose it. */
	const canDiscard = (): boolean => {
		if (!modified || !window.current) {
			return true;
		}
		const answer = raven.Rmessage_box(window.current.window, "Unsaved changes", "The text has changes that were not saved. Discard them?", raven.R_MESSAGE_OK_CANCEL);
		return answer === raven.R_MESSAGE_RESULT_OK;
	};

	/** Replaces the text without it counting as a change of the user. */
	const replaceText = (text: string, nextPath: string, nextLanguage: string | null): void => {
		if (editor.current) {
			raven.Rtext_editor_set_text(editor.current.widget, text);
			setLanguage(nextLanguage);
			setPath(nextPath);
			setModified(false);
			scanNotes();
		}
	};

	/** Opens a file: "main.rs" is Rust, "notes.txt" is nothing in particular. */
	const openPath = (chosen: string): void => {
		const bytes = raven.Rfile_read(chosen);
		if (!bytes) {
			setStatus(`Cannot read ${chosen}`);
			return;
		}
		let text: string;
		try {
			// (a byte that is not UTF-8 would become U+FFFD, and saving would write that over the file)
			text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch {
			setStatus(`Not opened: ${chosen} is not UTF-8 text`);
			return;
		}
		replaceText(text, chosen, raven.Rlanguage_for_file(chosen));
		setStatus(`Opened ${chosen}`);
		editor.current?.focus();
	};

	/** Saves the text, asking where when there is no file yet or when told to. */
	const save = (ask: boolean): void => {
		if (!editor.current || !window.current) {
			return;
		}
		let target = path;
		if (ask || !target) {
			const desc = fileDialog(window.current.window, "Save the text", target ? fileName(target) : "untitled.txt");
			desc.default_extension = "txt";
			const chosen = raven.Rfile_dialog_save(desc);
			if (!chosen) {
				return;
			}
			target = chosen;
		}
		const text = raven.Rtext_editor_get_text(editor.current.widget) ?? "";
		if (!raven.Rfile_write(target, new TextEncoder().encode(text))) {
			setStatus(`Cannot write ${target}`);
			return;
		}
		// (only once it is written: a failed Save As leaves the text where it was)
		if (target !== path) {
			setPath(target);
			setLanguage(raven.Rlanguage_for_file(target));
		}
		setModified(false);
		setStatus(`Saved ${target}`);
	};

	/** Asks the editor something, after giving it the keyboard back. */
	const edit = (run: (id: raven.Rid) => void): void => {
		if (editor.current) {
			editor.current.focus();
			run(editor.current.widget);
		}
	};

	const actions: MenuActions = {
		newText: () => {
			if (canDiscard()) {
				replaceText("", "", null);
				setStatus("New text.");
			}
		},
		open: () => {
			if (!canDiscard() || !window.current) {
				return;
			}
			const chosen = raven.Rfile_dialog_open(fileDialog(window.current.window, "Open a text", null));
			if (chosen) {
				openPath(chosen);
			}
		},
		save: () => save(false),
		saveAs: () => save(true),
		quit: () => {
			if (canDiscard()) {
				raven.Rquit(0);
			}
		},
		undo: () => edit(raven.Rtext_editor_undo),
		redo: () => edit(raven.Rtext_editor_redo),
		propose: () => edit(raven.Rtext_editor_show_completions),
		selectAll: () => edit(raven.Rtext_editor_select_all),
		toggleLineNumbers: () => setLineNumbers(!lineNumbers),
		toggleWrap: () => setWrap(!wrap),
	};

	/** What the callbacks given once to Raven reach, as of the last render. */
	const latest = useRef({ canDiscard, openPath });
	// (after the commit: a render that React throws away must not reach the callbacks, as a drop could then lose unsaved text)
	useLayoutEffect(() => {
		latest.current = { canDiscard, openPath };
	});

	// The text of the start, and what is given to Raven once, as there are no props for it.
	useEffect(() => {
		const id = editor.current?.widget;
		const windowId = window.current?.window;
		if (id === undefined || windowId === undefined) {
			return;
		}
		raven.Rtext_editor_set_completion_callback(id, proposeWords);

		// A file dragged over the window: returning true while it moves says "I take it", and the
		// files are known when it is dropped.
		raven.Rwindow_set_drop_callback(windowId, (_target, event) => {
			if (event?.phase === raven.R_DROP_DROPPED) {
				const dropped = event.paths[0];
				if (dropped !== undefined) {
					if (latest.current.canDiscard()) {
						latest.current.openPath(dropped);
					}
				} else if (event.text !== null) {
					raven.Rtext_editor_insert_text(id, event.text);
				}
			}
			return true;
		});

		// The position of the cursor, read once per frame: cheap, and nothing to wire.
		let line = -1;
		let column = -1;
		raven.Rset_frame_callback(() => {
			const current = editor.current?.widget;
			if (current === undefined || !raven.Rwidget_is_valid(current)) {
				return;
			}
			const [nextLine, nextColumn] = raven.Rtext_editor_get_cursor(current);
			if (nextLine !== line || nextColumn !== column) {
				line = nextLine;
				column = nextColumn;
				setPosition(`Line ${line + 1}, column ${column + 1}`);
			}
		});

		const opened = process.argv[2];
		if (opened !== undefined && !opened.startsWith("-")) {
			latest.current.openPath(opened);
		} else {
			raven.Rtext_editor_set_text(id, WELCOME);
			setNotes(markNotes(id));
		}
		editor.current?.focus();
		return () => raven.Rset_frame_callback(null);
	}, []);

	// `Language` is typed with the languages of the schema, which leaves out those registered later.
	useEffect(() => {
		if (editor.current) {
			raven.Rtext_editor_set_language(editor.current.widget, language);
		}
	}, [language]);

	// The notes are looked for once the typing pauses.
	useEffect(() => {
		if (edits === 0) {
			return;
		}
		const timer = setTimeout(scanNotes, SCAN_DELAY_MS);
		return () => clearTimeout(timer);
	}, [edits]);

	const title = `${path ? fileName(path) : "Untitled"}${modified ? " *" : ""} - Raven Notepad`;
	const noteCount = notes === 0 ? "" : `${notes} note${notes > 1 ? "s" : ""}`;

	return (
		<Window
			ref={window}
			Title={title}
			Width={980}
			Height={640}
			MinWidth={560}
			MinHeight={320}
			CustomHeader
			// The close button of the header bar, Alt+F4: the same question.
			OnClose={actions.quit}
		>
			<VBox>
				<HeaderBar>
					<NotepadMenus actions={actions} state={{ lineNumbers, wrap }} />
					{/* on the right of the bar, before the buttons of the window */}
					<ComboBox
						Width={130}
						Slot={{ HAlign: "Right", VAlign: "Center", Padding: "8,0" }}
						Metric={{ ControlHeight: 26 }}
						Tooltip="Language of the text"
						Items={["Plain text", ...languages]}
						Selected={language === null ? 0 : languages.indexOf(language) + 1}
						OnChanged={(index) => {
							setLanguage(index > 0 ? (languages[index - 1] ?? null) : null);
							editor.current?.focus();
						}}
					/>
				</HeaderBar>

				<TextEditor
					ref={editor}
					LineNumbers={lineNumbers}
					Wrap={wrap}
					Slot={{ Fill: 1 }}
					Placeholder="Type here, open a file (Ctrl+O), or drop one from the file manager."
					OnChanged={() => {
						setModified(true);
						setEdits(edits + 1);
					}}
				/>

				<Separator />
				<HBox Spacing={16} Slot={{ Padding: "10,4" }}>
					<Label Text={status} Slot={{ Fill: 1 }} Opacity={0.8} />
					<Label Text={noteCount} Opacity={0.6} />
					<Label Text={position} Opacity={0.6} />
				</HBox>
			</VBox>
		</Window>
	);
}

await runApp(<App />, undefined, { appName: "notepad", setup: registerIni });
