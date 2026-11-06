/**
 * A small scene editor. The port of `examples/editor` of Raven: menus, splitters, a tree, tabs,
 * properties that edit the selected object, a frame-time graph, a log of any length, and a
 * viewport showing a scene rendered in software into a texture.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
	Button, Checkbox, ComboBox, Custom, Expander, Grid, HBox, Label, ListView, Menu, MenuBar, MenuItem, raven, runApp, ScrollBox,
	Separator, Slider, Spacer, SpinBox, Splitter, TabView, TextInput, TreeView, VBox, Viewport, useShortcut, Window,
	type WidgetInstance, type WindowInstance,
} from "@decky.fx/raven-react";
import { bobAt, COLOR_NAMES, makeObject, MAX_OBJECTS, objectAt, type SceneObject } from "./scene";
import { SceneRenderer } from "./scene-renderer";

const LOG_CAPACITY = 2000;
const GRAPH_SAMPLES = 240;
/** The index of the Profiler in the tabs. */
const PROFILER_TAB = 1;
/** How often the labels that show measures change, in seconds. */
const STATS_PERIOD = 0.25;

/** The entries of the View menu that choose a theme. */
const THEMES: readonly { readonly label: string; readonly theme: raven.RTheme }[] = [
	{ label: "Dark theme", theme: raven.R_THEME_DARK },
	{ label: "Light theme", theme: raven.R_THEME_LIGHT },
	{ label: "Dark glass", theme: raven.R_THEME_GLASS_DARK },
	{ label: "Light glass", theme: raven.R_THEME_GLASS_LIGHT },
];

/** Times between frames in milliseconds, in a ring, for the graph. Not state: it changes at each frame. */
class FrameTimes {
	private readonly samples = new Float32Array(GRAPH_SAMPLES);
	private cursor = 0;

	/** Adds the time of a frame, over the oldest one. */
	add(milliseconds: number): void {
		this.samples[this.cursor] = milliseconds;
		this.cursor = (this.cursor + 1) % GRAPH_SAMPLES;
	}

	/** A sample by age: 0 is the oldest. */
	at(index: number): number {
		return this.samples[(this.cursor + index) % GRAPH_SAMPLES] ?? 0;
	}

	/** The highest sample, at least 20 ms. */
	peak(): number {
		return this.samples.reduce((peak, sample) => Math.max(peak, sample), 20);
	}
}

const frameTimes = new FrameTimes();

/** Draws the frame-time graph, in the colors of the theme so that it reads in all of them. */
function paintGraph(painter: raven.Pointer | null, width: number, height: number): void {
	const [textR, textG, textB, textA] = raven.Rtheme_get_color(raven.R_COLOR_TEXT);
	raven.Rdraw_rect(painter, 0, 0, width, height, 6, 0.5, 0.5, 0.5, 0.1);
	const peak = frameTimes.peak();
	const scale = (height - 24) / peak;
	// the 16.7 ms line: 60 frames per second
	const line = height - 16.7 * scale;
	raven.Rdraw_line(painter, 0, line, width, line, 1, 0.3, 0.8, 0.4, 0.8);
	raven.Rdraw_text(painter, raven.R_INVALID_ID, 11, 6, line - 16, "16.7 ms", textR, textG, textB, 0.6);
	for (let i = 1; i < GRAPH_SAMPLES; i++) {
		const x0 = (width * (i - 1)) / (GRAPH_SAMPLES - 1);
		const x1 = (width * i) / (GRAPH_SAMPLES - 1);
		raven.Rdraw_line(painter, x0, height - frameTimes.at(i - 1) * scale, x1, height - frameTimes.at(i) * scale, 1.5, 0.25, 0.6, 1, 1);
	}
	raven.Rdraw_text(painter, raven.R_INVALID_ID, 12, 8, 6, `peak ${peak.toFixed(1)} ms`, textR, textG, textB, textA);
}

/** What the frame callback and the mouse need, as of the last render. */
interface LiveState {
	readonly objects: readonly SceneObject[];
	readonly selected: number | null;
	readonly playing: boolean;
	readonly threaded: boolean;
	readonly scale: number;
	readonly tab: number;
}

/** The toolbar's measures. */
interface Measures {
	readonly stats: string;
	readonly renderInfo: string;
}

/** The text of the toolbar's label, from the stats of the last frame. */
function statsText(stats: raven.RFrameStats): string {
	const calls = stats.draw_call_count;
	return `${stats.widget_count} widgets   ${stats.instance_count} primitives in ${calls} draw call${calls > 1 ? "s" : ""}   layout ${stats.layout_ms.toFixed(2)} ms   paint ${stats.paint_ms.toFixed(2)} ms   gpu ${stats.render_ms.toFixed(2)} ms`;
}

/** Props of the viewport's frame loop. */
interface FrameLoopProps {
	readonly window: RefObject<WindowInstance | null>;
	readonly viewport: RefObject<WidgetInstance | null>;
	readonly graph: RefObject<WidgetInstance | null>;
	readonly live: RefObject<LiveState>;
	readonly onMeasures: (measures: Measures) => void;
	readonly onSelect: (object: SceneObject | null) => void;
	readonly onDrag: (id: number, x: number, y: number) => void;
}

/**
 * Connects the viewport to the frame loop: its size, its mouse, and a frame rendered before each
 * of Raven's. Returns the function that asks for a frame when the scene changed while paused.
 */
function useSceneView({ window, viewport, graph, live, onMeasures, onSelect, onDrag }: FrameLoopProps): () => void {
	const dirty = useRef(true);
	// (a layout effect, as the first frame comes before passive effects and would miss the first size)
	useLayoutEffect(() => {
		const scene = viewport.current?.widget ?? raven.R_INVALID_ID;
		const renderer = new SceneRenderer(raven.Rget_worker_thread_count());
		const stats = new raven.RFrameStats();
		let dragged: number | null = null;
		let time = 0;
		let timer = STATS_PERIOD;

		raven.Rviewport_set_resize_callback(scene, (_viewport, width, height) => {
			renderer.resize(width, height);
			dirty.current = true;
		});

		// Mouse in the viewport: select the object under the cursor and drag it.
		raven.Rwidget_set_event_callback(scene, (widget, event) => {
			if (!event) {
				return false;
			}
			const [, , width, height] = raven.Rwidget_get_rect(widget);
			if (width <= 0 || height <= 0) {
				return false;
			}
			const u = event.local_x / width;
			const v = event.local_y / height;
			if (event.type === raven.R_EVENT_MOUSE_DOWN && event.button === raven.R_MOUSE_LEFT) {
				const object = objectAt(live.current.objects, u, v, width / height, time);
				onSelect(object);
				dragged = object?.id ?? null;
				return true;
			}
			if (event.type === raven.R_EVENT_MOUSE_MOVE && dragged !== null) {
				// (the disc is drawn where it bobs to: its y is set so that it is drawn under the pointer)
				const object = live.current.objects.find(({ id }) => id === dragged);
				const bob = object ? bobAt(object.speed, object.phase, time) : 0;
				onDrag(dragged, Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v - bob)));
				return true;
			}
			if (event.type === raven.R_EVENT_MOUSE_UP) {
				dragged = null;
			}
			return false;
		});

		// Raven asks for this at each turn of the loop, so an idle paused scene is not rendered again.
		raven.Rset_frame_callback((seconds) => {
			const state = live.current;
			if (state.playing) {
				time += seconds;
			}
			let rendered = false;
			if (state.playing || dirty.current) {
				const selected = state.objects.findIndex((object) => object.id === state.selected);
				rendered = renderer.render(viewport.current?.widget ?? scene, { objects: state.objects, selected, time, scale: state.scale, threaded: state.threaded });
				dirty.current = !rendered;
			}
			if (state.playing || state.tab === PROFILER_TAB) {
				frameTimes.add(seconds * 1000);
				const custom = graph.current?.widget;
				if (custom !== undefined) {
					raven.Rwidget_invalidate(custom);
				}
			}
			timer += seconds;
			const owner = window.current;
			if (owner?.isOpen && (timer > STATS_PERIOD || (rendered && !state.playing))) {
				timer = 0;
				raven.Rwindow_get_frame_stats(owner.window, stats);
				onMeasures({ stats: statsText(stats), renderInfo: renderer.info });
			}
		});

		return () => {
			raven.Rset_frame_callback(null);
			renderer.dispose();
		};
		// (the callbacks of the C API are given once: they read what changes through `live`)
	}, []);
	return useCallback(() => {
		dirty.current = true;
		const scene = viewport.current?.widget;
		if (scene !== undefined) {
			raven.Rwidget_invalidate(scene);
		}
	}, [viewport]);
}

/** Keeps the rows of a tree as the objects are, and its selection as the state says. Returns the object of a row. */
function useOutliner(tree: RefObject<WidgetInstance | null>, objects: readonly SceneObject[], selected: number | null): (item: raven.Rid) => number | null {
	const rows = useRef(new Map<number, { readonly item: raven.Rid; readonly name: string }>());
	useEffect(() => {
		const known = rows.current;
		const widget = tree.current?.widget ?? raven.R_INVALID_ID;
		for (const [id, row] of known) {
			if (!objects.some((object) => object.id === id)) {
				known.delete(id);
				raven.Rtree_item_destroy(row.item);
			}
		}
		for (const object of objects) {
			const row = known.get(object.id);
			if (!row) {
				known.set(object.id, { item: raven.Rtree_view_add_item(widget, raven.R_INVALID_ID, object.name), name: object.name });
			} else if (row.name !== object.name) {
				raven.Rtree_item_set_text(row.item, object.name);
				known.set(object.id, { item: row.item, name: object.name });
			}
		}
		const row = selected === null ? undefined : known.get(selected);
		raven.Rtree_view_set_selected_item(widget, row?.item ?? raven.R_INVALID_ID);
	}, [tree, objects, selected]);
	return useCallback((item) => {
		for (const [id, row] of rows.current) {
			if (row.item === item) {
				return id;
			}
		}
		return null;
	}, []);
}

/** Props of the panel of properties. */
interface PropertiesProps {
	readonly object: SceneObject | undefined;
	readonly threaded: boolean;
	readonly scale: number;
	readonly renderInfo: string;
	readonly onEdit: (change: Partial<SceneObject>) => void;
	readonly onThreaded: (threaded: boolean) => void;
	readonly onScale: (scale: number) => void;
}

/** The right column: what the selected object is, and how the scene is rendered. */
function Properties({ object, threaded, scale, renderInfo, onEdit, onThreaded, onScale }: PropertiesProps): ReactNode {
	const enabled = object !== undefined;
	return (
		<ScrollBox Slot={{ Fill: 1.3 }}>
			<VBox Spacing={10} Slot={{ Padding: 10 }}>
				<Label TextSize={15}>Properties</Label>
				<Grid Columns="auto,1" Spacing={8}>
					<Label Slot={{ Column: 0, Row: 0, VAlign: "Center" }}>Name</Label>
					<TextInput Slot={{ Column: 1, Row: 0 }} Enabled={enabled} Text={object?.name ?? ""} OnChanged={(name) => onEdit({ name })} />

					<Label Slot={{ Column: 0, Row: 1, VAlign: "Center" }}>Radius</Label>
					<Slider Slot={{ Column: 1, Row: 1, VAlign: "Center" }} Enabled={enabled} Min={0.03} Max={0.4} Value={object?.radius ?? 0} OnChanged={(radius) => onEdit({ radius })} />

					<Label Slot={{ Column: 0, Row: 2, VAlign: "Center" }}>Speed</Label>
					<SpinBox Slot={{ Column: 1, Row: 2 }} Enabled={enabled} Min={-5} Max={5} Step={0.25} Decimals={2} Value={object?.speed ?? 0} OnChanged={(speed) => onEdit({ speed })} />

					<Label Slot={{ Column: 0, Row: 3, VAlign: "Center" }}>Color</Label>
					<ComboBox Slot={{ Column: 1, Row: 3 }} Enabled={enabled} Items={COLOR_NAMES} Selected={object?.color ?? 0} OnChanged={(color) => onEdit({ color: color & 3 })} />
				</Grid>
				<Checkbox Enabled={enabled} Checked={object?.visible ?? false} OnChanged={(visible) => onEdit({ visible })}>Visible</Checkbox>

				<Expander Title="Rendering" Expanded={true}>
					<VBox Spacing={8} Slot={{ Padding: "0,6,0,0" }}>
						<Checkbox Style="Switch" Checked={threaded} OnChanged={onThreaded}>Render on all cores</Checkbox>
						<HBox Spacing={8}>
							<Label Slot={{ VAlign: "Center" }}>Resolution</Label>
							<ComboBox Slot={{ Fill: 1 }} Items={["Full", "Half", "Quarter"]} Selected={scale} OnChanged={onScale} />
						</HBox>
						<Label Opacity={0.7} Wrap={true}>{renderInfo}</Label>
					</VBox>
				</Expander>
			</VBox>
		</ScrollBox>
	);
}

/** The whole editor. */
function App(): ReactNode {
	const windowRef = useRef<WindowInstance>(null);
	const outliner = useRef<WidgetInstance>(null);
	const viewport = useRef<WidgetInstance>(null);
	const graph = useRef<WidgetInstance>(null);
	const logList = useRef<WidgetInstance>(null);
	const themeItems = useRef<(WidgetInstance | null)[]>([]);
	const created = useRef(3);

	const [objects, setObjects] = useState<readonly SceneObject[]>(() => [makeObject(1, "Sun"), makeObject(2, "Planet"), makeObject(3, "Moon")]);
	const [selected, setSelected] = useState<number | null>(3);
	const [log, setLog] = useState<readonly string[]>(() => [
		`Raven ${raven.Rget_version()}, ${raven.Rget_worker_thread_count()} worker thread(s)`,
		'Added "Sun"',
		'Added "Planet"',
		'Added "Moon"',
	]);
	const [playing, setPlaying] = useState(true);
	const [theme, setTheme] = useState(0);
	const [threaded, setThreaded] = useState(true);
	const [scale, setScale] = useState(0);
	const [tab, setTab] = useState(0);
	const [measures, setMeasures] = useState<Measures>({ stats: "", renderInfo: "" });

	const live = useRef<LiveState>({ objects, selected, playing, threaded, scale, tab });
	// (after the commit: the callbacks of the viewport read what is on screen, not a render React may throw away)
	useLayoutEffect(() => {
		live.current = { objects, selected, playing, threaded, scale, tab };
	}, [objects, selected, playing, threaded, scale, tab]);

	const addLog = useCallback((line: string): void => {
		// a full log drops its oldest line, so the new ones are still seen
		setLog((lines) => [...(lines.length < LOG_CAPACITY ? lines : lines.slice(1)), line]);
	}, []);

	const onDrag = useCallback((id: number, x: number, y: number): void => {
		setObjects((all) => all.map((object) => (object.id === id ? { ...object, x, y } : object)));
	}, []);
	const onSelect = useCallback((object: SceneObject | null): void => setSelected(object?.id ?? null), []);
	const requestFrame = useSceneView({ window: windowRef, viewport, graph, live, onMeasures: setMeasures, onSelect, onDrag });

	// a paused scene is rendered again only when it was edited
	useEffect(() => requestFrame(), [requestFrame, objects, selected, playing, threaded, scale]);

	const itemObject = useOutliner(outliner, objects, selected);

	// (on every line: a full log keeps its length)
	useEffect(() => {
		const list = logList.current?.widget;
		if (list !== undefined) {
			raven.Rlist_view_scroll_to_item(list, log.length - 1);
		}
	}, [log]);
	const logRow = useCallback((index: number): string => log[index] ?? "", [log]);

	const newScene = (): void => {
		setObjects([]);
		setSelected(null);
		addLog("New scene");
	};
	const addObject = (): void => {
		if (objects.length === MAX_OBJECTS) {
			addLog(`The scene is full (${MAX_OBJECTS} objects)`);
			return;
		}
		created.current++;
		const object = makeObject(created.current);
		setObjects([...objects, object]);
		setSelected(object.id);
		addLog(`Added "${object.name}"`);
	};
	const deleteSelected = (): void => {
		const object = objects.find((other) => other.id === selected);
		if (object) {
			addLog(`Deleted "${object.name}"`);
			setObjects(objects.filter((other) => other !== object));
			setSelected(null);
		}
	};
	const togglePlay = (): void => {
		addLog(playing ? "Animation paused" : "Animation started");
		setPlaying(!playing);
	};
	const chooseTheme = (index: number): void => {
		raven.Rtheme_apply(THEMES[index]?.theme ?? raven.R_THEME_DARK);
		setTheme(index);
		// (a click flips a checkable item by itself: the one already chosen must come back on, and no prop changed)
		themeItems.current.forEach((item, other) => {
			if (item) {
				raven.Rmenu_item_set_checked(item.widget, other === index ? 1 : 0);
			}
		});
	};
	/** Sets the three sizes that make the interface compact or comfortable. */
	const setSizes = (font: number, control: number, row: number): void => {
		raven.Rtheme_set_metric(raven.R_METRIC_FONT_SIZE, font);
		raven.Rtheme_set_metric(raven.R_METRIC_CONTROL_HEIGHT, control);
		raven.Rtheme_set_metric(raven.R_METRIC_ROW_HEIGHT, row);
	};
	/** Changes the selected object. */
	const editSelected = (change: Partial<SceneObject>): void => {
		setObjects(objects.map((object) => (object.id === selected ? { ...object, ...change } : object)));
	};

	useShortcut(windowRef, "F5", togglePlay);
	useShortcut(windowRef, "Delete", deleteSelected);

	return (
		<Window ref={windowRef} Title="Raven - editor example" Width={1180} Height={720} MinWidth={640} MinHeight={420}>
			<VBox>
				<MenuBar>
					<Menu Title="File">
						<MenuItem Text="New scene" Shortcut="Ctrl+N" OnClicked={newScene} />
						<MenuItem Text="Add object" Shortcut="Ctrl+D" OnClicked={addObject} />
						<MenuItem Separator={true} />
						<MenuItem Text="Quit" Shortcut="Ctrl+Q" OnClicked="app.quit" />
					</Menu>
					<Menu Title="View">
						{THEMES.map((entry, index) => (
							<MenuItem
								key={entry.label}
								ref={(item) => {
									themeItems.current[index] = item;
								}}
								Text={entry.label}
								Checkable={true}
								Checked={theme === index}
								OnClicked={() => chooseTheme(index)}
							/>
						))}
						<MenuItem Separator={true} />
						<Menu Title="Scale">
							<MenuItem Text="Compact" OnClicked={() => setSizes(12, 22, 20)} />
							<MenuItem Text="Comfortable" OnClicked={() => setSizes(15, 32, 28)} />
						</Menu>
					</Menu>
				</MenuBar>

				{/* tool bar */}
				<HBox Spacing={4} Slot={{ Padding: "6,4" }}>
					<Button Style="Primary" MinWidth={72} Tooltip="Start or stop the animation (F5)" OnClicked={togglePlay}>{playing ? "Pause" : "Play"}</Button>
					<Button Style="Flat" Tooltip="Add an object to the scene (Ctrl+D)" OnClicked={addObject}>Add object</Button>
					<Button Style="Flat" Tooltip="Delete the selected object (Delete)" OnClicked={deleteSelected}>Delete</Button>
					<Spacer Slot={{ Fill: 1 }} />
					<Label Opacity={0.7} Slot={{ VAlign: "Center" }}>{measures.stats}</Label>
				</HBox>
				<Separator />

				{/* the three columns above the log */}
				<Splitter Orientation="Vertical" Slot={{ Fill: 1 }}>
					<Splitter Slot={{ Fill: 3 }}>
						<VBox Spacing={6} Slot={{ Fill: 1, Padding: 8 }}>
							<Label TextSize={15}>Outliner</Label>
							<TreeView ref={outliner} Slot={{ Fill: 1 }} OnChanged={(item) => setSelected(itemObject(item))} />
						</VBox>

						<TabView Slot={{ Fill: 3 }} OnChanged={setTab}>
							<Viewport
								ref={viewport}
								Slot={{ Title: "Scene" }}
								Realtime={playing}
								Cursor="Crosshair"
								Tooltip="Software-rendered on all the cores. Drag to move the selected object."
							/>
							<VBox Spacing={8} Slot={{ Title: "Profiler", Padding: 12 }}>
								<Label>Time between frames (ms)</Label>
								<Custom ref={graph} Slot={{ Fill: 1 }} OnPaint={paintGraph} />
							</VBox>
						</TabView>

						<Properties
							object={objects.find((object) => object.id === selected)}
							threaded={threaded}
							scale={scale}
							renderInfo={measures.renderInfo}
							onEdit={editSelected}
							onThreaded={setThreaded}
							onScale={setScale}
						/>
					</Splitter>

					<ListView ref={logList} Slot={{ Fill: 1 }} ItemCount={log.length} ItemText={logRow} />
				</Splitter>
			</VBox>
		</Window>
	);
}

await runApp(<App />, undefined, { appName: "editor" });
