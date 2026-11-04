/** The menus of the notepad, in the header bar. */

import type { ReactNode } from "react";
import { Menu, MenuBar, MenuItem, raven } from "@decky.fx/raven-react";

/** What the menus do. */
export interface MenuActions {
	readonly newText: () => void;
	readonly open: () => void;
	readonly save: () => void;
	readonly saveAs: () => void;
	readonly quit: () => void;
	readonly undo: () => void;
	readonly redo: () => void;
	readonly propose: () => void;
	readonly selectAll: () => void;
	readonly toggleLineNumbers: () => void;
	readonly toggleWrap: () => void;
}

/** What the marks of the View menu show. */
export interface MenuState {
	readonly lineNumbers: boolean;
	readonly wrap: boolean;
}

/** A menu's own `<Separator/>` of the XML is this: a widget named `Separator` would not be drawn as one. */
function MenuSeparator(): ReactNode {
	return <MenuItem Separator />;
}

/** The themes the View menu offers. */
const THEMES: readonly { readonly text: string; readonly theme: raven.RTheme }[] = [
	{ text: "Dark", theme: raven.R_THEME_DARK },
	{ text: "Light", theme: raven.R_THEME_LIGHT },
	{ text: "Dark glass", theme: raven.R_THEME_GLASS_DARK },
	{ text: "Light glass", theme: raven.R_THEME_GLASS_LIGHT },
];

/** File, Edit and View. */
export function NotepadMenus({ actions, state }: { readonly actions: MenuActions; readonly state: MenuState }): ReactNode {
	return (
		<MenuBar>
			<Menu Title="File">
				<MenuItem Text="New" Shortcut="Ctrl+N" OnClicked={actions.newText} />
				<MenuItem Text="Open..." Shortcut="Ctrl+O" OnClicked={actions.open} />
				<MenuSeparator />
				<MenuItem Text="Save" Shortcut="Ctrl+S" OnClicked={actions.save} />
				<MenuItem Text="Save as..." Shortcut="Ctrl+Shift+S" OnClicked={actions.saveAs} />
				<MenuSeparator />
				<MenuItem Text="Quit" Shortcut="Ctrl+Q" OnClicked={actions.quit} />
			</Menu>
			<Menu Title="Edit">
				<MenuItem Text="Undo" OnClicked={actions.undo} />
				<MenuItem Text="Redo" OnClicked={actions.redo} />
				<MenuSeparator />
				<MenuItem Text="Propose words" OnClicked={actions.propose} />
				<MenuItem Text="Select all" OnClicked={actions.selectAll} />
			</Menu>
			<Menu Title="View">
				<MenuItem Text="Line numbers" Checkable Checked={state.lineNumbers} OnClicked={actions.toggleLineNumbers} />
				<MenuItem Text="Word wrap" Checkable Checked={state.wrap} OnClicked={actions.toggleWrap} />
				<MenuSeparator />
				{THEMES.map(({ text, theme }) => (
					<MenuItem key={text} Text={text} OnClicked={() => raven.Rtheme_apply(theme)} />
				))}
			</Menu>
		</MenuBar>
	);
}
