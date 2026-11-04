/**
 * The frame of a tool: panels that dock, a file browser, materials. The port of
 * `examples/workspace` of Raven.
 *
 *   DockArea       panels arranged by the user; the arrangement is a short text to save and
 *                  load; panels added and closed at run time, as elements of a list in state
 *   FileBrowser    the folders and files of the disk, as a widget: a double click on a file
 *                  opens it in a new panel
 *   materials      Rtheme_set_material for everything, `Material` for one widget and what
 *                  it contains
 *   Island         tells what just happened, then folds back
 *   HeaderBar      without background: the bar is the top of the window
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
	Button,
	ComboBox,
	DockArea,
	FileBrowser,
	HeaderBar,
	Island,
	Label,
	ListView,
	raven,
	runApp,
	Separator,
	TextEditor,
	VBox,
	Window,
	type WidgetInstance,
	type WindowInstance,
} from "@decky.fx/raven-react";

const WELCOME = `/*
 * Drag the tab of a panel:
 *   - onto a tab bar, to put it with the tabs that are there;
 *   - onto the left, right, top or bottom of a panel, to split it;
 *   - onto an edge of the window, to take the whole side.
 * Drag the line between two panels to resize them.
 * Double click a file on the left to open it in a new panel.
 */
int main(void) {
	return 0;
}
`;

/** A file larger than this is not shown. */
const MOST_BYTES = 2 * 1024 * 1024;
/** How long the island stays unfolded after it says something. */
const ISLAND_SECONDS = 2;

const THEME_NAMES = ["Dark", "Light", "Dark glass", "Light glass"];
const THEMES = [raven.R_THEME_DARK, raven.R_THEME_LIGHT, raven.R_THEME_GLASS_DARK, raven.R_THEME_GLASS_LIGHT] as const;
const MATERIAL_NAMES = ["As the theme", "Solid", "Glass", "Frosted glass", "Tinted glass"];
const MATERIALS = [raven.R_MATERIAL_DEFAULT, raven.R_MATERIAL_SOLID, raven.R_MATERIAL_GLASS, raven.R_MATERIAL_FROSTED_GLASS, raven.R_MATERIAL_TINTED_GLASS] as const;
const PANEL_MATERIAL_NAMES = ["As everything", "Solid", "Glass", "Frosted glass", "Tinted glass"];
const PANEL_MATERIALS = ["Default", "Solid", "Glass", "FrostedGlass", "TintedGlass"] as const;

/** A panel opened at run time: a text in an editor. */
interface EditorPanelState {
	readonly key: number;
	readonly title: string;
	readonly text: string;
	readonly language: string | null;
}

/** The last part of a path. */
function fileName(path: string): string {
	return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Docks the children of a DockArea that are new, where their `Slot` says.
 *
 * A DockArea places a child at the moment it receives it, from its `Slot.Dock`, `Slot.DockTo`
 * and `Slot.DockSize`. The renderer adds a child first and sets the attributes of its slot at
 * the end of the commit, so every panel lands in the middle of the area. Taking the new ones
 * out and giving them back, now that their slots are set, is what the XML loader does in one go.
 */
function useDockSlots(area: RefObject<WidgetInstance | null>, panels: readonly EditorPanelState[]): void {
	const docked = useRef<ReadonlySet<raven.Rid>>(new Set());
	useLayoutEffect(() => {
		const id = area.current?.widget;
		if (id === undefined) {
			return;
		}
		const children = Array.from({ length: raven.Rwidget_get_child_count(id) }, (_, index) => raven.Rwidget_get_child(id, index));
		const fresh = children.filter((child) => !docked.current.has(child));
		for (const child of fresh) {
			raven.Rwidget_remove_child(id, child);
		}
		for (const child of fresh) {
			raven.Rwidget_add_child(id, child);
		}
		docked.current = new Set(children);
	}, [area, panels]);
}

/** Says when an editor of the list of panels is there. */
type PanelMounted = (widget: raven.Rid, key: number) => void;

/**
 * A panel beside the editor, as a tab of the same group. When that panel was closed, the name
 * finds nothing and the new one goes behind the first tabs of the area, as in the original.
 */
function EditorPanel({ panel, onMounted }: { readonly panel: EditorPanelState; readonly onMounted: PanelMounted }): ReactNode {
	const editor = useRef<WidgetInstance>(null);
	useEffect(() => {
		const id = editor.current?.widget;
		if (id !== undefined) {
			// (`Language` is typed with the languages of the schema, and the name of a file can give others)
			raven.Rtext_editor_set_language(id, panel.language);
			raven.Rdock_area_show_panel(raven.Rwidget_get_parent(id), id);
			onMounted(id, panel.key);
		}
	}, []);
	return <TextEditor ref={editor} Text={panel.text} LineNumbers Slot={{ Title: panel.title, Dock: "Tab", DockTo: "welcome" }} />;
}

/** What the "Appearance" panel changes. */
function AppearancePanel({ say }: { readonly say: (title: string, detail: string) => void }): ReactNode {
	const [theme, setTheme] = useState(2);
	const [material, setMaterial] = useState(0);
	const [panelMaterial, setPanelMaterial] = useState(0);
	return (
		<VBox
			Name="look"
			Material={PANEL_MATERIALS[panelMaterial]}
			Spacing={10}
			Slot={{ Title: "Appearance", Dock: "Right", DockSize: 0.24, Padding: 12 }}
		>
			<Label Text="Theme" />
			<ComboBox
				Items={THEME_NAMES}
				Selected={theme}
				OnChanged={(index) => {
					raven.Rtheme_apply(THEMES[index] ?? raven.R_THEME_DARK);
					// (a theme comes with its material: the choice below starts over)
					setTheme(index);
					setMaterial(0);
					say("Theme", THEME_NAMES[index] ?? "");
				}}
			/>
			<Label Text="Material of everything" Slot={{ Padding: "0,6,0,0" }} />
			<ComboBox
				Items={MATERIAL_NAMES}
				Selected={material}
				OnChanged={(index) => {
					// every widget that was not given a material of its own
					if (index === 0) {
						raven.Rtheme_apply(THEMES[theme] ?? raven.R_THEME_DARK);
					} else {
						raven.Rtheme_set_material(MATERIALS[index] ?? raven.R_MATERIAL_DEFAULT);
					}
					setMaterial(index);
					say("Material of everything", MATERIAL_NAMES[index] ?? "");
				}}
			/>
			<Label Text="Material of this panel only" Slot={{ Padding: "0,6,0,0" }} />
			<ComboBox
				Items={PANEL_MATERIAL_NAMES}
				Selected={panelMaterial}
				OnChanged={(index) => {
					setPanelMaterial(index);
					say("Material of the panel", PANEL_MATERIAL_NAMES[index] ?? "");
				}}
			/>
			<Separator Slot={{ Padding: "0,6" }} />
			<Label
				Wrap
				Opacity={0.7}
				Text="Clear glass shows what is behind it, frosted glass blurs it, tinted glass colors it. A popup is always more opaque than the panel it comes from, and a panel than the bar above it."
			/>
		</VBox>
	);
}

/** The workspace. */
function App(): ReactNode {
	const window = useRef<WindowInstance>(null);
	const island = useRef<WidgetInstance>(null);
	const dock = useRef<WidgetInstance>(null);
	const files = useRef<WidgetInstance>(null);
	const logList = useRef<WidgetInstance>(null);
	const savedLayout = useRef<string | null>(null);
	const panelKeys = useRef(new Map<raven.Rid, number>());
	const nextPanel = useRef(0);
	const notes = useRef(0);

	const [message, setMessage] = useState({ title: "Workspace", detail: "Drag a tab to move its panel." });
	const [log, setLog] = useState<readonly string[]>(["Ready."]);
	const [layoutText, setLayoutText] = useState("");
	const [panels, setPanels] = useState<readonly EditorPanelState[]>([]);

	useDockSlots(dock, panels);

	/** Tells what just happened, in the log and in the island. */
	const say = useCallback((title: string, detail: string): void => {
		setLog((lines) => [...lines, `${title}: ${detail}`]);
		setMessage({ title, detail });
		if (island.current) {
			raven.Risland_expand_for(island.current.widget, ISLAND_SECONDS);
		}
	}, []);

	/** Adds a panel to the list. */
	const addPanel = useCallback((title: string, text: string, language: string | null): void => {
		const key = ++nextPanel.current;
		setPanels((list) => [...list, { key, title, text, language }]);
	}, []);

	const panelMounted = useCallback<PanelMounted>((widget, key) => {
		panelKeys.current.set(widget, key);
	}, []);

	// What is given to Raven once, as there are no props for it.
	useLayoutEffect(() => {
		const windowId = window.current?.window;
		const islandId = island.current?.widget;
		const dockId = dock.current?.widget;
		const filesId = files.current?.widget;
		if (windowId === undefined || islandId === undefined || dockId === undefined || filesId === undefined) {
			return;
		}
		// An island beside the content of a window floats above it. Under a <Window> of the
		// renderer it is one more child of the content: it is moved to where the XML loader puts it.
		raven.Rwindow_set_island(windowId, islandId);

		raven.Rfile_browser_set_accepted_callback(filesId, (_browser, path) => {
			if (path === null) {
				return;
			}
			const name = fileName(path);
			const bytes = raven.Rfile_read(path);
			if (!bytes) {
				say("Cannot open", path);
			} else if (bytes.length > MOST_BYTES) {
				say("Too large to show", name);
			} else {
				addPanel(name, new TextDecoder().decode(bytes), raven.Rlanguage_for_file(path));
				say("Opened", name);
			}
		});

		// Closing a panel deletes its widget: the panels of the list go with it. Returning false
		// would keep it open (unsaved changes...).
		raven.Rdock_area_set_close_callback(dockId, (_area, panel) => {
			const key = panelKeys.current.get(panel);
			if (key !== undefined) {
				panelKeys.current.delete(panel);
				setPanels((list) => list.filter((entry) => entry.key !== key));
			}
			return true;
		});

		// What would be written to a settings file.
		raven.Rdock_area_set_changed_callback(dockId, (area) => setLayoutText(raven.Rdock_area_save_layout(area) ?? ""));
	}, [say, addPanel]);

	// Once the panels are in their places.
	useEffect(() => {
		const dockId = dock.current?.widget;
		const logId = logList.current?.widget;
		if (dockId !== undefined && logId !== undefined) {
			setLayoutText(raven.Rdock_area_save_layout(dockId) ?? "");
			raven.Rdock_area_show_panel(dockId, logId);
		}
	}, []);

	// The last line of the log stays in sight. (The user may have closed the panel of the log.)
	useEffect(() => {
		const id = logList.current?.widget;
		if (id !== undefined && raven.Rwidget_is_valid(id)) {
			raven.Rlist_view_scroll_to_item(id, log.length - 1);
		}
	}, [log]);

	const saveLayout = (): void => {
		const layout = dock.current ? raven.Rdock_area_save_layout(dock.current.widget) : null;
		savedLayout.current = layout;
		say("Layout saved", layout ?? "");
	};

	const restoreLayout = (): void => {
		if (savedLayout.current === null || !dock.current) {
			say("Nothing saved yet", "Use \"Save layout\" first.");
		} else if (raven.Rdock_area_load_layout(dock.current.widget, savedLayout.current)) {
			say("Layout restored", "The panels fly back to where they were.");
		}
	};

	const newNote = (): void => {
		const title = `Note ${++notes.current}`;
		addPanel(title, "", null);
		say("New panel", title);
	};

	return (
		<Window ref={window} Title="Raven - workspace" Width={1180} Height={720} MinWidth={760} MinHeight={460} CustomHeader>
			<Island ref={island} ExpandOnClick={false} Slot={{ Padding: "0,5,0,0" }}>
				<Label Text={message.title} Slot={{ Padding: "14,5" }} />
				<VBox Spacing={6} Width={320} Slot={{ Padding: "18,12" }}>
					<Label Text={message.title} TextSize={16} />
					<Label Text={message.detail} Wrap Opacity={0.75} />
				</VBox>
			</Island>

			<VBox>
				<HeaderBar Title="" Background={false}>
					<Button Style="Flat" Tooltip="Remembers how the panels are arranged" OnClicked={saveLayout}>Save layout</Button>
					<Button Style="Flat" Tooltip="Arranges the panels as they were saved" OnClicked={restoreLayout}>Restore</Button>
					<Button Style="Flat" Tooltip="Adds a panel, as a tab of the editor" OnClicked={newNote}>New note</Button>
				</HeaderBar>

				<DockArea ref={dock} Slot={{ Fill: 1 }}>
					<TextEditor Name="welcome" Text={WELCOME} LineNumbers Language="C" Slot={{ Title: "Welcome" }} />

					<FileBrowser
						ref={files}
						Name="files"
						Directory={`${import.meta.dir}/../..`}
						Controls={false}
						Places={false}
						Slot={{ Title: "Files", Dock: "Left", DockSize: 0.24, Closable: false }}
					/>

					<AppearancePanel say={say} />

					{/* (`ItemCount` and not `Items`: a list given new `Items` forgets the row the user selected) */}
					<ListView
						ref={logList}
						Name="log"
						ItemCount={log.length}
						ItemText={(index) => log[index] ?? ""}
						Slot={{ Title: "Log", Dock: "Bottom", DockTo: "welcome", DockSize: 0.26 }}
					/>
					<VBox Name="about" Spacing={6} Slot={{ Title: "About", Dock: "Tab", DockTo: "log", Padding: 12 }}>
						<Label Text="Panels can share a tab bar: drag this tab away and back." />
						<Label Text={layoutText} Opacity={0.6} Wrap />
					</VBox>

					{panels.map((panel) => <EditorPanel key={panel.key} panel={panel} onMounted={panelMounted} />)}
				</DockArea>
			</VBox>
		</Window>
	);
}

await runApp(<App />, undefined, { appName: "workspace", setup: () => raven.Rtheme_apply(raven.R_THEME_GLASS_DARK) });
