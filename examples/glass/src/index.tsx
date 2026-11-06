/**
 * The glass themes: translucent controls that blur and refract what is behind them, floating
 * panels, animated switches and sliders. The port of `examples/glass` of Raven.
 *
 * Two things are needed to get this look: `Rtheme_apply(R_THEME_GLASS_DARK)`, and every control
 * becomes glass; and `Material`, which says what one widget is made of. There are three kinds of
 * glass, from the lightest to the heaviest:
 *
 *   Glass          clear: what is behind shows through, bent at the rim
 *   FrostedGlass   blurred: the colors behind, without their shapes
 *   TintedGlass    blurred and colored by the theme: the easiest to read on
 *
 * Here a side bar (frosted), a tool bar (tinted) and a player bar (clear) float in an Overlay
 * above a page that scrolls under them. `Appear` makes a widget arrive with a transition when the
 * window opens: the bars fly in from the edges, the title rises, the cards pop one after the other.
 *
 *   bun run src/index.tsx light     starts with the light glass
 */

import { memo, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
	Border, Button, Checkbox, ComboBox, HBox, Image, Label, Overlay, ProgressBar, raven, runApp, ScrollBox, Separator, Slider,
	SpinBox, TextInput, TreeView, UniformGrid, VBox, Window, WrapBox, type WidgetInstance, type WindowInstance,
} from "@decky.fx/raven-react";

/** Whether the program was started with the light glass. */
const START_LIGHT = process.argv[2] === "light";

/** The length of the track that plays, in seconds. */
const TRACK_SECONDS = 240;
/** Where the player starts, in seconds. */
const START_SECONDS = 84;

/** The size of the picture of a card, in pixels. */
const CARD_SIZE = 96;

/** A card: its title, and the two colors of its picture, as red, green, blue from 0 to 1. */
const CARDS: readonly { readonly title: string; readonly colors: readonly number[] }[] = [
	{ title: "Sunrise", colors: [1.0, 0.6, 0.2, 0.95, 0.2, 0.45] },
	{ title: "Deep water", colors: [0.05, 0.3, 0.75, 0.1, 0.8, 0.85] },
	{ title: "Citrus", colors: [0.98, 0.85, 0.15, 0.4, 0.85, 0.25] },
	{ title: "Orchid", colors: [0.65, 0.25, 0.9, 0.98, 0.45, 0.75] },
	{ title: "Glacier", colors: [0.55, 0.85, 1.0, 0.2, 0.35, 0.8] },
	{ title: "Ember", colors: [0.9, 0.2, 0.1, 1.0, 0.7, 0.15] },
	{ title: "Meadow", colors: [0.2, 0.7, 0.35, 0.75, 0.95, 0.45] },
	{ title: "Dusk", colors: [0.25, 0.15, 0.55, 0.95, 0.45, 0.35] },
	{ title: "Coral", colors: [1.0, 0.45, 0.4, 1.0, 0.8, 0.6] },
];

/** An item of the library, with the items under it. */
interface LibraryItem {
	readonly text: string;
	readonly expanded?: boolean;
	readonly children?: readonly LibraryItem[];
}

const LIBRARY: readonly LibraryItem[] = [
	{ text: "Listen now" },
	{ text: "Browse" },
	{ text: "Playlists", expanded: true, children: [{ text: "Favourites" }, { text: "Focus" }, { text: "Late night" }] },
	{ text: "Artists" },
	{ text: "Albums" },
];

/** A small picture for a card: two colors melted together with a bright spot. */
function cardPixels(index: number, colors: readonly number[]): Uint8Array {
	const pixels = new Uint8Array(CARD_SIZE * CARD_SIZE * 4);
	for (let y = 0; y < CARD_SIZE; y++) {
		for (let x = 0; x < CARD_SIZE; x++) {
			const u = x / (CARD_SIZE - 1);
			const v = y / (CARD_SIZE - 1);
			// a diagonal blend, bent by a wave so that no two cards look alike
			const wave = 0.5 * (u + v) + 0.18 * Math.sin(u * 5 + index) * Math.cos(v * 4 - index * 0.7);
			const t = Math.min(Math.max(wave, 0), 1);
			const du = u - 0.72;
			const dv = v - 0.28;
			const spot = Math.exp(-(du * du + dv * dv) * 9) * 0.45;
			const out = (y * CARD_SIZE + x) * 4;
			for (let channel = 0; channel < 3; channel++) {
				const from = colors[channel] ?? 0;
				const to = colors[channel + 3] ?? 0;
				pixels[out + channel] = Math.trunc(255 * Math.min(from + (to - from) * t + spot, 1));
			}
			pixels[out + 3] = 255;
		}
	}
	return pixels;
}

/** A card: a picture with rounded corners and its title on a chip of glass. The cards pop in one after the other. */
function Card({ index, title, colors }: { readonly index: number; readonly title: string; readonly colors: readonly number[] }): ReactNode {
	const image = useRef<WidgetInstance>(null);
	// An Image has no prop for a texture made from pixels.
	useEffect(() => {
		if (!image.current) {
			return;
		}
		const texture = raven.Rtexture_create_from_pixels(cardPixels(index, colors), CARD_SIZE, CARD_SIZE);
		raven.Rimage_set_texture(image.current.widget, texture);
		return () => raven.Rtexture_destroy(texture);
	}, [index, colors]);
	return (
		<Overlay Appear="Pop" AppearDelay={0.3 + 0.06 * index}>
			<Image ref={image} Stretch="Cover" CornerRadius={24} />
			<Border Material="Glass" CornerRadius={100} Padding={[14, 6, 14, 6]} Slot={{ HAlign: "Left", VAlign: "Bottom", Padding: [12, 0, 0, 12] }}>
				<Label>{title}</Label>
			</Border>
		</Overlay>
	);
}

/** The cards. They never change, and the page around them does. */
const Cards = memo(function Cards(): ReactNode {
	return (
		<UniformGrid Columns={3} MinCellSize={[200, 150]} Spacing={16}>
			{CARDS.map((card, index) => <Card key={card.title} index={index} title={card.title} colors={card.colors} />)}
		</UniformGrid>
	);
});

/** A sample of the controls. Without a handler they hold what the user does with them. */
const Controls = memo(function Controls(): ReactNode {
	return (
		<>
			<Label TextSize={22} Slot={{ Padding: [0, 10, 0, 0] }}>Controls</Label>
			<WrapBox Spacing={10}>
				<Button>Glass</Button>
				<Button Style="Primary">Tinted</Button>
				<Button Enabled={false}>Disabled</Button>
				<ComboBox Items={["Lossless", "High quality", "Data saver"]} Selected={1} />
				<TextInput Placeholder="Type here" Width={180} />
				<SpinBox Min={0} Max={10} Value={4} Decimals={0} Width={90} />
			</WrapBox>
			<HBox Spacing={22}>
				<Checkbox Checked>Check</Checkbox>
				<Checkbox Style="Radio" Checked>Radio</Checkbox>
				<Checkbox Style="Switch" Checked>Switch</Checkbox>
				<Checkbox Style="Switch">Off</Checkbox>
			</HBox>
		</>
	);
});

/** The page: it scrolls under everything else. */
function Page({ progress }: { readonly progress: number }): ReactNode {
	return (
		<ScrollBox>
			<VBox Spacing={18} Slot={{ Padding: [304, 92, 28, 120] }}>
				<Label TextSize={36} Appear="FlyUp" AppearDelay={0.1}>Good evening</Label>
				<Label Wrap Opacity={0.75} Appear="FlyUp" AppearDelay={0.18}>Everything that floats on this page is glass: it blurs and bends what scrolls behind it, picks up its colors and catches the light on its rim. Scroll, or drag a slider and watch its knob turn into a lens.</Label>
				<Cards />
				<Controls />
				<ProgressBar Value={progress} Width={420} Slot={{ MaxSize: 420, HAlign: "Left" }} />
			</VBox>
		</ScrollBox>
	);
}

/** Adds items to a tree, under a parent item. */
function addItems(tree: raven.Rid, parent: raven.Rid, items: readonly LibraryItem[]): void {
	for (const item of items) {
		const added = raven.Rtree_view_add_item(tree, parent, item.text);
		if (item.expanded) {
			raven.Rtree_item_set_expanded(added, raven.R_TRUE);
		}
		addItems(tree, added, item.children ?? []);
	}
}

/** A label and a switch on one line. `action` is the name of an action to fire when it changes. */
function SwitchRow({ label, checked, action }: { readonly label: string; readonly checked?: boolean; readonly action?: string }): ReactNode {
	return (
		<HBox>
			<Label Slot={{ Fill: 1, VAlign: "Center" }}>{label}</Label>
			<Checkbox Style="Switch" Checked={checked} OnChanged={action} />
		</HBox>
	);
}

/** The side bar, of frosted glass. */
const SideBar = memo(function SideBar(): ReactNode {
	const tree = useRef<WidgetInstance>(null);

	useEffect(() => {
		if (tree.current) {
			addItems(tree.current.widget, raven.R_INVALID_ID, LIBRARY);
		}
	}, []);

	return (
		<Border Material="FrostedGlass" CornerRadius={28} Padding={16} Width={264} Shadow={28} Slot={{ HAlign: "Left", Padding: [18, 18, 0, 18] }} Appear="FlyRight">
			<VBox Spacing={12}>
				<Label TextSize={22}>Library</Label>
				<TextInput Placeholder="Search" />
				<TreeView ref={tree} Slot={{ Fill: 1 }} />
				<Separator />
				{/* The built-in action, as in the original: it goes to the look of Raven, dark or light, which is not glass. */}
				<SwitchRow label="Dark glass" checked={!START_LIGHT} action="theme.toggle" />
				<SwitchRow label="Crossfade" />
				<Label Opacity={0.7}>Volume</Label>
				<Slider Value={0.62} />
			</VBox>
		</Border>
	);
});

/**
 * The menu of the "More" button, a popup of glass. A menu that is not in a menu bar belongs to
 * no parent, so it is not an element here: it is made through the C API and its handle is kept.
 */
function useMoreMenu(): RefObject<raven.Rid> {
	const menu = useRef<raven.Rid>(raven.R_INVALID_ID);
	useEffect(() => {
		const id = raven.Rwidget_create(raven.R_WIDGET_MENU);
		menu.current = id;
		raven.Rmenu_add_item(id, "Add to library");
		raven.Rmenu_add_item(id, "Add to a playlist");
		const lossless = raven.Rmenu_add_item(id, "Lossless audio");
		raven.Rmenu_item_set_checkable(lossless, raven.R_TRUE);
		raven.Rmenu_item_set_checked(lossless, raven.R_TRUE);
		raven.Rmenu_add_separator(id);
		const quit = raven.Rmenu_add_item(id, "Quit");
		raven.Rmenu_item_set_shortcut(quit, raven.R_KEY_Q, raven.R_MOD_CTRL);
		raven.Rwidget_set_action(quit, "app.quit");
		return () => raven.Rwidget_destroy(id);
	}, []);
	return menu;
}

/** The tool bar, of tinted glass. */
const ToolBar = memo(function ToolBar({ window }: { readonly window: RefObject<WindowInstance | null> }): ReactNode {
	const more = useRef<WidgetInstance>(null);
	const menu = useMoreMenu();

	/** Opens the menu under the button. */
	function openMenu(): void {
		if (more.current && window.current) {
			const [x, y, , height] = raven.Rwidget_get_rect(more.current.widget);
			raven.Rmenu_open(menu.current, window.current.window, x, y + height + 8);
		}
	}

	return (
		<Border Material="TintedGlass" CornerRadius={100} Padding={6} Shadow={24} Slot={{ HAlign: "Center", VAlign: "Top", Padding: [286, 18, 0, 0] }} Appear="Drop" AppearDelay={0.25}>
			<HBox Spacing={4}>
				<Button Style="Flat">Today</Button>
				<Button Style="Flat">Library</Button>
				<Button Style="Flat">Radio</Button>
				<Button ref={more} Style="Flat" OnClicked={openMenu}>More</Button>
				<Button Style="Primary">Share</Button>
			</HBox>
		</Border>
	);
});

/** A time in seconds as `1:24`. */
function formatTime(seconds: number): string {
	const total = Math.trunc(seconds);
	return `${Math.trunc(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The player bar, of clear glass. */
function PlayerBar({ seconds, playing, onToggle, onSeek }: { readonly seconds: number; readonly playing: boolean; readonly onToggle: () => void; readonly onSeek: (fraction: number) => void }): ReactNode {
	return (
		<Border Material="Glass" CornerRadius={100} Padding={[10, 8]} Shadow={30} Slot={{ HAlign: "Center", VAlign: "Bottom", Padding: [286, 0, 0, 22] }} Appear="FlyUp" AppearDelay={0.35}>
			<HBox Spacing={12}>
				<Button Style="Flat">Previous</Button>
				<Button Style="Primary" MinWidth={76} OnClicked={onToggle}>{playing ? "Pause" : "Play"}</Button>
				<Button Style="Flat">Next</Button>
				<Slider Value={seconds / TRACK_SECONDS} Width={240} Slot={{ VAlign: "Center" }} OnChanged={onSeek} />
				<Label Slot={{ VAlign: "Center" }} Opacity={0.7} MinWidth={40}>{formatTime(seconds)}</Label>
			</HBox>
		</Border>
	);
}

/**
 * The time of the player: it advances once per frame while it plays. The window is told to keep
 * producing frames. The state moves in tenths of a second, far less than a pixel of the slider,
 * so that the page is not rendered at each frame.
 */
function usePlayer(window: RefObject<WindowInstance | null>): { readonly seconds: number; readonly playing: boolean; readonly toggle: () => void; readonly seek: (fraction: number) => void } {
	const [playing, setPlaying] = useState(true);
	const [tenths, setTenths] = useState(START_SECONDS * 10);
	const clock = useRef({ playing: true, seconds: START_SECONDS });

	useEffect(() => {
		const windowId = window.current?.window;
		if (windowId !== undefined) {
			raven.Rwindow_set_continuous_redraw(windowId, raven.R_TRUE);
		}
		raven.Rset_frame_callback((deltaSeconds) => {
			if (clock.current.playing) {
				clock.current.seconds += deltaSeconds;
				if (clock.current.seconds > TRACK_SECONDS) {
					clock.current.seconds = 0;
				}
				setTenths(Math.trunc(clock.current.seconds * 10));
			}
		});
		return () => {
			raven.Rset_frame_callback(null);
			// (the window may be gone already, closed before this runs)
			if (windowId !== undefined && raven.Rwindow_is_valid(windowId)) {
				raven.Rwindow_set_continuous_redraw(windowId, raven.R_FALSE);
			}
		};
	}, [window]);

	/** Plays or pauses. Frames are only needed while the time moves. */
	function toggle(): void {
		clock.current.playing = !clock.current.playing;
		setPlaying(clock.current.playing);
		if (window.current) {
			raven.Rwindow_set_continuous_redraw(window.current.window, clock.current.playing ? raven.R_TRUE : raven.R_FALSE);
		}
	}

	/** Moves the time to where the slider was dragged. */
	function seek(fraction: number): void {
		clock.current.seconds = fraction * TRACK_SECONDS;
		setTenths(Math.trunc(clock.current.seconds * 10));
	}

	return { seconds: tenths / 10, playing, toggle, seek };
}

function App(): ReactNode {
	const window = useRef<WindowInstance>(null);
	const player = usePlayer(window);
	return (
		<Window ref={window} Title="Raven - glass" Width={1100} Height={720} MinWidth={820} MinHeight={560}>
			<Overlay>
				<Page progress={player.seconds / TRACK_SECONDS} />
				<SideBar />
				<ToolBar window={window} />
				<PlayerBar seconds={player.seconds} playing={player.playing} onToggle={player.toggle} onSeek={player.seek} />
			</Overlay>
		</Window>
	);
}

await runApp(<App />, undefined, {
	appName: "glass",
	// before the window is built: sizes depend on the metrics of the theme
	setup: () => raven.Rtheme_apply(START_LIGHT ? raven.R_THEME_GLASS_LIGHT : raven.R_THEME_GLASS_DARK),
});
