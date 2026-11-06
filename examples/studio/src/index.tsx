import { useCallback, useEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import {
	Button,
	Checkbox,
	ColorPicker,
	ComboBox,
	HBox,
	Label,
	NodeGraph,
	raven,
	runApp,
	ScrollBox,
	Separator,
	Slider,
	Spacer,
	Splitter,
	Timeline,
	useFrame,
	VBox,
	type WidgetInstance,
} from "@decky.fx/raven-react";
import { GraphLink, GraphNode, hexColor, PinType, reaches, type NodeSpec, type PinShape, type PinSpec } from "./graph-elements";

/** The themes of the list: Raven's, then the looks of the platforms, which the graph and the timeline follow with the look Auto. */
const THEMES: readonly { readonly name: string; readonly apply: () => void }[] = [
	{ name: "Dark", apply: () => raven.Rtheme_apply(raven.R_THEME_DARK) },
	{ name: "Light", apply: () => raven.Rtheme_apply(raven.R_THEME_LIGHT) },
	{ name: "Glass dark", apply: () => raven.Rtheme_apply(raven.R_THEME_GLASS_DARK) },
	{ name: "Glass light", apply: () => raven.Rtheme_apply(raven.R_THEME_GLASS_LIGHT) },
	{ name: "Windows", apply: () => raven.Rtheme_use("WindowsDark") },
	{ name: "macOS", apply: () => raven.Rtheme_use("MacOSDark") },
	{ name: "GNOME", apply: () => raven.Rtheme_use("GnomeDark") },
];
const THEME_NAMES = THEMES.map(({ name }) => name);

/** The looks of the graph and of the timeline. Auto follows the theme of the window. */
const LOOKS = ["Auto", "Modern", "Blueprint", "Blender", "Neon"] as const;
type Look = (typeof LOOKS)[number];

/** A number of the environment, as an index of a list: 0 when it is missing or not one. */
function startIndex(value: string | undefined, length: number): number {
	return Math.min(Math.max(Number(value ?? 0) || 0, 0), length - 1);
}

/** The theme and the look to start with: `RAVEN_EXAMPLE_THEME=2` is the third theme, `RAVEN_EXAMPLE_LOOK=3` the fourth look, as for the original. */
const FIRST_THEME = startIndex(Bun.env.RAVEN_EXAMPLE_THEME, THEMES.length);
const FIRST_LOOK = startIndex(Bun.env.RAVEN_EXAMPLE_LOOK, LOOKS.length);

/** The image of the node "Time". */
const CLOCK_ICON = `${import.meta.dir}/../assets/clock.svg`;

const SWATCHES = "#FF375F,#FF9F0A,#FFD60A,#30D158,#64D2FF,#0A84FF,#BF5AF2,#8E8E93";

const HELP = [
	"- **Drag** a pin to another to link them; drag the end of a link away to remove it.",
	"- The **wheel** zooms, the **middle button** (or `Alt` + drag) moves the canvas.",
	"- A link that would make a **loop** is refused by the application.",
	"- `Delete` removes what is selected.",
].join("\n");

// (a shape for each type of data: it reads at a glance, in every look)
const PIN_TYPES: readonly { readonly name: string; readonly color: string; readonly shape?: PinShape }[] = [
	{ name: "vector", color: "#BF5AF2", shape: "Square" },
	{ name: "number", color: "#64D2FF" },
	{ name: "color", color: "#FFD60A", shape: "Diamond" },
];

/** A pin with a type, in short. */
function pin(name: string, label: string, type: string): PinSpec {
	return { name, label, type };
}

/** What sits in the node "Noise". */
function NoiseDetail(): ReactElement {
	const [detail, setDetail] = useState(0.4);
	return <Slider Value={detail} OnChanged={setDetail} Width={150} Tooltip="Detail" />;
}

/** What sits in the node "Color ramp". */
function RampOptions(): ReactElement {
	const [curve, setCurve] = useState(0);
	const [clamp, setClamp] = useState(true);
	return (
		<>
			<ComboBox Items={["Linear", "Ease", "Constant"]} Selected={curve} OnChanged={setCurve} />
			<Checkbox Text="Clamp" Checked={clamp} OnChanged={setClamp} />
		</>
	);
}

/** What sits in a node added with the button. */
function RemapKnob(): ReactElement {
	const [value, setValue] = useState(0.5);
	return <Slider Value={value} OnChanged={setValue} Width={150} />;
}

const FIRST_NODES: readonly NodeSpec[] = [
	{ name: "uv", title: "Texture coordinates", x: 40, y: 60, color: "#FF375F", outputs: [pin("uv", "UV", "vector")] },
	{ name: "time", title: "Time", x: 60, y: 260, color: "#30D158", icon: CLOCK_ICON, outputs: [pin("seconds", "Seconds", "number")] },
	{
		name: "noise",
		title: "Noise",
		x: 300,
		y: 40,
		color: "#FF9F0A",
		inputs: [pin("uv", "UV", "vector"), pin("scale", "Scale", "number")],
		outputs: [pin("value", "Value", "number")],
		content: <NoiseDetail />,
	},
	{
		name: "mix",
		title: "Multiply",
		x: 330,
		y: 290,
		color: "#BF5AF2",
		inputs: [pin("a", "A", "number"), pin("b", "B", "number")],
		outputs: [pin("out", "Result", "number")],
	},
	{
		name: "ramp",
		title: "Color ramp",
		x: 560,
		y: 120,
		color: "#0A84FF",
		inputs: [pin("t", "Factor", "number")],
		outputs: [pin("color", "Color", "color"), pin("alpha", "Alpha", "number")],
		content: <RampOptions />,
	},
	{
		name: "out",
		title: "Surface",
		x: 860,
		y: 90,
		inputs: [pin("base", "Base color", "color"), pin("rough", "Roughness", "number"), { name: "any", label: "Anything" }],
	},
];

const FIRST_LINKS = [
	{ from: "uv.uv", to: "noise.uv" },
	{ from: "noise.value", to: "ramp.t" },
	{ from: "ramp.color", to: "out.base" },
	{ from: "time.seconds", to: "mix.a" },
	{ from: "noise.value", to: "mix.b" },
	{ from: "mix.out", to: "out.rough" },
];

/** What a track of the timeline shows. */
interface TrackSpec {
	readonly name: string;
	readonly color: string;
	readonly clips?: readonly { start: number; length: number; label: string }[];
	readonly keys?: readonly { time: number; label?: string }[];
}

const FRAME_RATE = 24;
const FIRST_TIME = 2.5;

const TRACKS: readonly TrackSpec[] = [
	{
		name: "Camera",
		color: "#0A84FF",
		clips: [
			{ start: 0, length: 3.5, label: "Wide shot" },
			{ start: 4, length: 4, label: "Travelling" },
			{ start: 8.5, length: 3.5, label: "Close up" },
		],
	},
	{
		name: "Character",
		color: "#30D158",
		clips: [
			{ start: 0.5, length: 5, label: "Walk" },
			{ start: 5.5, length: 2, label: "Jump" },
		],
		keys: [{ time: 8.5 }, { time: 9.25 }, { time: 10, label: "Land" }],
	},
	{ name: "Noise scale", color: "#FF9F0A", keys: [{ time: 1 }, { time: 3 }, { time: 3.5 }, { time: 6 }, { time: 10.5 }] },
	{ name: "Audio", color: "#BF5AF2", clips: [{ start: 0, length: 12, label: "Music" }] },
];

const MARKERS: readonly { time: number; label: string; color?: string }[] = [
	{ time: 4, label: "Intro" },
	{ time: 8.5, label: "Act 2", color: "#FF9F0A" },
];

/** Gives a timeline its tracks, its clips, its keys and its markers. */
function useTimelineContent(timeline: RefObject<WidgetInstance | null>): void {
	useEffect(() => {
		const id = timeline.current?.widget;
		if (id === undefined) {
			return;
		}
		for (const spec of TRACKS) {
			const track = raven.Rtimeline_add_track(id, spec.name);
			raven.Rtimeline_set_track_color(id, track, ...hexColor(spec.color));
			for (const clip of spec.clips ?? []) {
				raven.Rtimeline_add_clip(id, track, clip.start, clip.length, clip.label);
			}
			for (const key of spec.keys ?? []) {
				const item = raven.Rtimeline_add_key(id, track, key.time);
				if (key.label) {
					raven.Rtimeline_set_item_label(id, item, key.label);
				}
			}
		}
		for (const spec of MARKERS) {
			const marker = raven.Rtimeline_add_marker(id, spec.time, spec.label);
			if (spec.color) {
				raven.Rtimeline_set_item_color(id, marker, ...hexColor(spec.color));
			}
		}
	}, [timeline]);
}

/** A time as minutes, seconds and frames. */
function timeText(seconds: number, frameRate: number): string {
	let whole = Math.trunc(seconds);
	let frame = Math.round((seconds - whole) * frameRate);
	// (a time just under a second rounds to the next one, not to a frame numbered as the frame rate)
	if (frame >= frameRate) {
		whole += 1;
		frame = 0;
	}
	return `${Math.trunc(whole / 60)}:${String(whole % 60).padStart(2, "0")}:${String(frame).padStart(2, "0")}`;
}

/** The time of the playhead, scrubbed or playing. It holds its own state: only this redraws at each frame of the timeline. */
function TimeReadout({ timeline }: { timeline: RefObject<WidgetInstance | null> }): ReactElement {
	const [text, setText] = useState(() => timeText(FIRST_TIME, FRAME_RATE));
	useEffect(() => {
		const id = timeline.current?.widget;
		if (id !== undefined) {
			raven.Rtimeline_set_time_callback(id, (owner, seconds) => setText(timeText(seconds, raven.Rtimeline_get_frame_rate(owner))));
		}
	}, [timeline]);
	return <Label Text={text} Font="monospace" Slot={{ VAlign: "Center" }} Width={76} />;
}

/** The text of the selection of a graph. */
function selectionText(graph: raven.Rid): string {
	const count = raven.Rnode_graph_get_selection_count(graph);
	if (count === 0) {
		return "No node selected";
	}
	return count === 1 ? (raven.Rnode_graph_get_node_title(graph, raven.Rnode_graph_get_selected_node(graph, 0)) ?? "") : `${count} nodes selected`;
}

/** The graph of nodes, with the panel of the selection beside it. */
function GraphPane(props: {
	graph: RefObject<WidgetInstance | null>;
	nodes: readonly NodeSpec[];
	look: Look;
	onDeleted: (name: string) => void;
}): ReactElement {
	const { graph, nodes, look, onDeleted } = props;
	const tint = useRef<WidgetInstance>(null);
	const [selected, setSelected] = useState("No node selected");

	/** Shows what the graph has selected. */
	const readSelection = useCallback((): void => {
		if (graph.current) {
			setSelected(selectionText(graph.current.widget));
		}
	}, [graph]);

	useEffect(() => {
		const id = graph.current?.widget;
		if (id === undefined) {
			return;
		}
		// A link is allowed unless what it feeds already feeds where it comes from.
		raven.Rnode_graph_set_connect_callback(id, (owner, output, input) =>
			!reaches(owner, raven.Rnode_graph_get_pin_node(owner, input), raven.Rnode_graph_get_pin_node(owner, output)),
		);
		raven.Rnode_graph_set_selection_callback(id, readSelection);
		// (without this callback the Delete key would only remove links)
		raven.Rnode_graph_set_removed_callback(id, (owner, node) => onDeleted(raven.Rnode_graph_get_node_name(owner, node) ?? ""));
	}, [graph, readSelection, onDeleted]);

	/** Gives the color of the picker to the selected nodes. */
	const tintSelected = (): void => {
		const id = graph.current?.widget;
		if (id === undefined || !tint.current) {
			return;
		}
		const [red, green, blue] = raven.Rcolor_picker_get_color(tint.current.widget);
		for (let index = 0; index < raven.Rnode_graph_get_selection_count(id); index++) {
			raven.Rnode_graph_set_node_color(id, raven.Rnode_graph_get_selected_node(id, index), red, green, blue);
		}
	};

	return (
		<HBox Slot={{ Fill: 5 }}>
			<NodeGraph ref={graph} Preset={look} Slot={{ Fill: 1, Padding: [10, 10, 0, 6] }}>
				{PIN_TYPES.map((type) => (
					<PinType key={type.name} graph={graph} name={type.name} color={type.color} shape={type.shape} />
				))}
				{nodes.map((spec) => (
					<GraphNode key={spec.name} graph={graph} spec={spec} onSelected={readSelection} />
				))}
				{FIRST_LINKS.map((link) => (
					<GraphLink key={`${link.from}>${link.to}`} graph={graph} from={link.from} to={link.to} />
				))}
			</NodeGraph>

			<ScrollBox Width={312}>
				<VBox Spacing={10} Slot={{ Padding: [14, 12, 14, 8] }}>
					<Label Text={selected} TextSize={16} Wrap />
					<Label Text="Color of the selected nodes" Opacity={0.6} />
					<ColorPicker ref={tint} Color="#0A84FF" Alpha={false} Swatches={SWATCHES} OnChanged={tintSelected} />
					<Separator />
					<Label Markdown Wrap Opacity={0.85} Text={HELP} />
				</VBox>
			</ScrollBox>
		</HBox>
	);
}

/** The window: the bar of the tools, then the graph over the timeline. */
function App(): ReactElement {
	const graph = useRef<WidgetInstance>(null);
	const timeline = useRef<WidgetInstance>(null);
	const added = useRef(0);
	const [nodes, setNodes] = useState(FIRST_NODES);
	const [playing, setPlaying] = useState(false);
	const [theme, setTheme] = useState(FIRST_THEME);
	const [look, setLook] = useState(FIRST_LOOK);

	useTimelineContent(timeline);
	// (Space in the timeline plays and pauses too, and tells nobody: the button reads the widget at each frame)
	useFrame(() => {
		const id = timeline.current?.widget;
		if (id !== undefined) {
			setPlaying(raven.Rtimeline_is_playing(id) === raven.R_TRUE);
		}
	});

	/** Plays or pauses. The widget decides: Space in the timeline does the same, and it tells nobody. */
	const togglePlaying = (): void => {
		const id = timeline.current?.widget;
		if (id === undefined) {
			return;
		}
		const next = !raven.Rtimeline_is_playing(id);
		if (next && raven.Rtimeline_get_time(id) >= raven.Rtimeline_get_duration(id)) {
			raven.Rtimeline_set_time(id, 0);
		}
		raven.Rtimeline_set_playing(id, next ? raven.R_TRUE : raven.R_FALSE);
		setPlaying(next);
	};

	/** Adds a node in the middle of what the graph shows. */
	const addNode = (): void => {
		if (!graph.current) {
			return;
		}
		const [x, y] = raven.Rnode_graph_get_view(graph.current.widget);
		const number = ++added.current;
		const step = (number % 5) * 24;
		const spec: NodeSpec = {
			name: `remap${number}`,
			title: `Remap ${number}`,
			x: x - 70 + step,
			y: y - 50 + step,
			color: "#63D1FF",
			inputs: [pin("value", "Value", "number")],
			outputs: [pin("result", "Result", "number")],
			content: <RemapKnob />,
			select: true,
		};
		setNodes((current) => [...current, spec]);
	};

	/** Brings every node in view. */
	const showAll = (): void => {
		if (graph.current) {
			raven.Rnode_graph_frame_all(graph.current.widget);
		}
	};

	/** Applies a theme of the list. */
	const chooseTheme = (index: number): void => {
		const chosen = THEMES[index];
		if (chosen !== undefined) {
			chosen.apply();
			setTheme(index);
		}
	};

	/** Forgets a node the user deleted. */
	const dropNode = useCallback((name: string): void => {
		setNodes((current) => current.filter((spec) => spec.name !== name));
	}, []);

	return (
		<VBox>
			<HBox Spacing={10} Slot={{ Padding: [12, 8, 12, 8] }}>
				<Label Text="Studio" TextSize={17} Slot={{ VAlign: "Center" }} />
				<Spacer Width={12} />
				<Button Text={playing ? "Pause" : "Play"} Style="Primary" OnClicked={togglePlaying} />
				<TimeReadout timeline={timeline} />
				<Button Text="Add a node" OnClicked={addNode} />
				<Button Text="Show all" Style="Flat" OnClicked={showAll} Tooltip="Every node in view (F, or a double click on the canvas)" />
				<Spacer Slot={{ Fill: 1 }} />
				<Label Text="Look" Slot={{ VAlign: "Center" }} Opacity={0.7} />
				<ComboBox Items={LOOKS} Selected={look} Width={130} OnChanged={setLook} Tooltip="The look of the graph and of the timeline; Auto follows the theme" />
				<Spacer Width={8} />
				<Label Text="Theme" Slot={{ VAlign: "Center" }} Opacity={0.7} />
				<ComboBox Items={THEME_NAMES} Selected={theme} Width={140} OnChanged={chooseTheme} />
			</HBox>
			<Separator />
			<Splitter Orientation="Vertical" Slot={{ Fill: 1 }}>
				<GraphPane graph={graph} nodes={nodes} look={LOOKS[look] ?? "Auto"} onDeleted={dropNode} />
				<Timeline
					ref={timeline}
					Duration={12}
					FrameRate={FRAME_RATE}
					Time={FIRST_TIME}
					Loop
					Preset={LOOKS[look] ?? "Auto"}
					Slot={{ Fill: 3, Padding: [10, 6, 10, 10] }}
				/>
			</Splitter>
		</VBox>
	);
}

await runApp(
	<App />,
	{ Title: "Raven - studio", Width: 1280, Height: 800, MinWidth: 900, MinHeight: 560 },
	{ appName: "Raven studio", setup: () => (THEMES[FIRST_THEME] ?? THEMES[0])?.apply() },
);
