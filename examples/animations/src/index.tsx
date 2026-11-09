/**
 * Everything that moves, and how to ask for it. The port of `examples/animations` of Raven.
 *
 *   transitions   the `Appear` prop (each time a widget appears), or `Rwidget_play_transition`
 *                 through a ref (once, now)
 *   springs       `RSpring` and `Rdraw_spring` in a `Custom`, with no React state: see `Springs`
 *   island        a pill at the top of the window that unfolds
 *   tuning        `Rset_animation_speed`, `Rset_animations_enabled`
 *
 * The controls animate by themselves (press a button, flip the switch): that needs no code.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
	Border, Button, Checkbox, Custom, HBox, Island, Label, Overlay, raven, runApp, ScrollBox, Slider, Spacer, VBox,
	type WidgetInstance,
} from "@decky.fx/raven-tsx/react";

/** What `OnPaint` of a `Custom` receives as its painter. */
type Painter = Parameters<typeof raven.Rdraw_rect>[0];

const TRANSITIONS: readonly { readonly name: string; readonly transition: raven.RTransition; readonly tip: string }[] = [
	{ name: "Fade", transition: raven.R_TRANSITION_FADE, tip: "Becomes opaque" },
	{ name: "Pop", transition: raven.R_TRANSITION_POP, tip: "Grows and bounces a little past its size" },
	{ name: "Zoom", transition: raven.R_TRANSITION_ZOOM, tip: "Shrinks from a larger size" },
	{ name: "FlyUp", transition: raven.R_TRANSITION_FLY_UP, tip: "Flies in from below" },
	{ name: "FlyDown", transition: raven.R_TRANSITION_FLY_DOWN, tip: "Flies in from above" },
	{ name: "FlyLeft", transition: raven.R_TRANSITION_FLY_LEFT, tip: "Flies in from the right" },
	{ name: "FlyRight", transition: raven.R_TRANSITION_FLY_RIGHT, tip: "Flies in from the left" },
	{ name: "Drop", transition: raven.R_TRANSITION_DROP, tip: "Falls, squashes on landing and wobbles" },
	{ name: "SlideLeft", transition: raven.R_TRANSITION_SLIDE_LEFT, tip: "A page replacing another" },
];

const MAX_CARDS = 40;
const CARD_COLORS = ["#F76B15", "#46A758", "#D6409F", "#05A2C2", "#8E4EC6", "#E5484D"];

/** One spring per kind of motion, all pulled to the pointer. */
const SPRINGS: readonly { readonly name: string; readonly motion: raven.RMotion; readonly color: readonly [number, number, number] }[] = [
	{ name: "Snappy", motion: raven.R_MOTION_SNAPPY, color: [0.23, 0.51, 0.96] },
	{ name: "Smooth", motion: raven.R_MOTION_SMOOTH, color: [0.27, 0.65, 0.35] },
	{ name: "Bouncy", motion: raven.R_MOTION_BOUNCY, color: [0.97, 0.42, 0.08] },
	{ name: "Wobbly", motion: raven.R_MOTION_WOBBLY, color: [0.84, 0.25, 0.62] },
];

/**
 * What the springs hold between frames. None of it is React state: a move of the pointer only
 * asks for a frame, and `Rdraw_spring` keeps frames coming for as long as a spring moves.
 * React would have nothing to do here at each frame.
 */
class SpringPlayground {
	private readonly positions = SPRINGS.map(() => new raven.RSpring());
	private readonly glows = SPRINGS.map(() => new raven.RSpring());
	private target = 0.5;
	private inside = false;

	/** Draws the tracks. It runs while a frame is drawn, and changes nothing but the springs. */
	readonly paint = (painter: Painter, width: number, height: number): void => {
		const label = 70;
		const row = height / SPRINGS.length;
		const track = width - label - 16;
		const [r, g, b] = raven.Rtheme_get_color(raven.R_COLOR_TEXT);
		SPRINGS.forEach(({ name, motion, color }, i) => {
			const position = this.positions[i] ?? null;
			const glow = this.glows[i] ?? null;
			const y = row * (i + 0.5);
			// the same target for the four: only the way they get there differs
			const x = label + 8 + raven.Rdraw_spring(painter, position, this.target * track, motion);
			const size = raven.Rdraw_spring(painter, glow, this.inside ? 1 : 0, raven.R_MOTION_BOUNCY);
			raven.Rdraw_text(painter, raven.R_INVALID_ID, 0, 0, y - 9, name, r, g, b, 0.8);
			raven.Rdraw_rect(painter, label, y - 2, track + 16, 4, 2, r, g, b, 0.12);
			raven.Rdraw_circle(painter, x, y, 9 + 5 * size, color[0], color[1], color[2], 0.25);
			raven.Rdraw_circle(painter, x, y, 8, color[0], color[1], color[2], 1);
		});
	};

	/** Follows the pointer, and pushes the springs on a click. Says whether the event was used. */
	readonly handleEvent = (widget: raven.Rid, event: raven.REvent | null): boolean => {
		switch (event?.type) {
			case raven.R_EVENT_MOUSE_MOVE: {
				const [, , width] = raven.Rwidget_get_rect(widget);
				this.inside = true;
				this.target = Math.min(1, Math.max(0, (event.local_x - 78) / (width - 86)));
				raven.Rwidget_invalidate(widget);
				return true;
			}
			case raven.R_EVENT_MOUSE_LEAVE:
				this.inside = false;
				raven.Rwidget_invalidate(widget);
				return false;
			case raven.R_EVENT_MOUSE_DOWN:
				// a push to the right: each spring comes back in its own way
				for (const position of this.positions) {
					raven.Rspring_kick(position, 1400);
				}
				raven.Rwidget_invalidate(widget);
				return true;
			default:
				return false;
		}
	};
}

/** The four springs. A `Custom` has no prop for pointer events, so they go through the C API. */
function Springs(): ReactNode {
	const [playground] = useState(() => new SpringPlayground());
	const custom = useRef<WidgetInstance>(null);
	useEffect(() => {
		const widget = custom.current?.widget;
		if (widget !== undefined) {
			raven.Rwidget_set_event_callback(widget, playground.handleEvent);
		}
	}, [playground]);
	return <Custom ref={custom} Slot={{ Fill: 1 }} OnPaint={playground.paint} />;
}

/** The panel of the buttons that play a transition on the card in the middle. */
function TransitionPanel({ onPlay, onPlayAll }: { readonly onPlay: (name: string, transition: raven.RTransition) => void; readonly onPlayAll: () => void }): ReactNode {
	return (
		<Border Padding={12} Width={170} CornerRadius={14} Appear="FlyRight">
			<VBox Spacing={2}>
				<Label TextSize={17} Slot={{ Padding: "6,2,6,8" }}>Transitions</Label>
				{TRANSITIONS.map(({ name, transition, tip }) => (
					<Button key={name} Style="Flat" Tooltip={tip} OnClicked={() => onPlay(name, transition)}>{name}</Button>
				))}
				<Spacer Slot={{ Fill: 1 }} />
				<Button Style="Primary" OnClicked={onPlayAll}>Play them all</Button>
			</VBox>
		</Border>
	);
}

/** The stage: the card that the transitions are played on. */
function Stage({ card, title }: { readonly card: RefObject<WidgetInstance | null>; readonly title: string }): ReactNode {
	return (
		<Border Padding={16} Slot={{ Fill: 1 }} CornerRadius={14} Appear="FlyDown" AppearDelay={0.08}>
			<Overlay>
				<Border
					ref={card}
					Width={240}
					Height={150}
					Padding={18}
					CornerRadius={22}
					Shadow="26,0,10"
					Background="#3B82F6"
					Appear="Pop"
					AppearDelay={0.3}
					Slot={{ HAlign: "Center", VAlign: "Center" }}
				>
					<VBox Spacing={6} Slot={{ VAlign: "Center" }}>
						<Label TextSize={26} Color="white" Slot={{ HAlign: "Center" }}>{title}</Label>
						<Label Color="#FFFFFFC0" Slot={{ HAlign: "Center" }}>Choose a transition on the left</Label>
					</VBox>
				</Border>
			</Overlay>
		</Border>
	);
}

/** A card of the list on the right. */
interface CardData {
	readonly number: number;
	/** How long it waits before it pops in. */
	readonly delay: number;
}

/** The list of cards that come and go. Each pops in each time it appears. */
function CardPanel(props: {
	readonly cards: readonly CardData[];
	readonly register: (number: number, widget: WidgetInstance | null) => void;
	readonly onAdd: () => void;
	readonly onRemove: () => void;
}): ReactNode {
	return (
		<Border Padding={12} Width={230} CornerRadius={14} Appear="FlyLeft" AppearDelay={0.24}>
			<VBox Spacing={8}>
				<HBox Spacing={6}>
					<Label TextSize={17} Slot={{ Fill: 1, VAlign: "Center" }}>Cards</Label>
					<Button Style="Primary" OnClicked={props.onAdd}>Add</Button>
					<Button OnClicked={props.onRemove}>Remove</Button>
				</HBox>
				<ScrollBox Slot={{ Fill: 1 }}>
					<VBox Spacing={8}>
						{props.cards.map(({ number, delay }) => (
							<Border
								key={number}
								ref={(widget) => props.register(number, widget)}
								Padding={12}
								CornerRadius={14}
								Background={CARD_COLORS[(number - 1) % CARD_COLORS.length]}
								Appear="Pop"
								AppearDelay={delay}
							>
								<Label Color="white">Card {number}</Label>
							</Border>
						))}
					</VBox>
				</ScrollBox>
			</VBox>
		</Border>
	);
}

/** The whole window. */
function App(): ReactNode {
	const island = useRef<WidgetInstance>(null);
	const card = useRef<WidgetInstance>(null);
	const cardWidgets = useRef(new Map<number, WidgetInstance>());
	const [title, setTitle] = useState("Pop");
	const [speed, setSpeed] = useState(1);
	// the first cards arrive one after the other
	const [cards, setCards] = useState<readonly CardData[]>(() => [0, 1, 2].map((i) => ({ number: i + 1, delay: 0.35 + 0.08 * i })));
	const lastNumber = useRef(cards.length);

	// An `<Island>` in a window of the original floats at its top. Here it is one more child of
	// the window's content, and has to be handed to the window to float.
	useLayoutEffect(() => {
		const widget = island.current?.widget;
		if (widget !== undefined) {
			raven.Rwindow_set_island(raven.Rwidget_get_window(widget), widget);
		}
	}, []);

	/** Plays a transition on the card in the middle. */
	const play = (name: string, transition: raven.RTransition): void => {
		setTitle(name);
		if (card.current) {
			raven.Rwidget_play_transition(card.current.widget, transition, 0);
		}
	};

	/** Every card of the list arrives again, one after the other, and the one in the middle drops. */
	const playAll = (): void => {
		cards.forEach(({ number }, i) => {
			const widget = cardWidgets.current.get(number);
			const next = TRANSITIONS[(i + 1) % TRANSITIONS.length];
			if (widget && next) {
				raven.Rwidget_play_transition(widget.widget, next.transition, 0.06 * i);
			}
		});
		play("Drop", raven.R_TRANSITION_DROP);
	};

	/** The island says what happened, then folds back by itself. */
	const tell = (): void => {
		if (island.current) {
			raven.Risland_expand_for(island.current.widget, 1.6);
		}
	};

	const addCard = (): void => {
		if (cards.length < MAX_CARDS) {
			lastNumber.current++;
			setCards([...cards, { number: lastNumber.current, delay: 0 }]);
		}
		tell();
	};

	const removeCard = (): void => {
		setCards(cards.slice(0, -1));
		tell();
	};

	/** Keeps the widget of each card, for "Play them all". */
	const registerCard = (number: number, widget: WidgetInstance | null): void => {
		if (widget) {
			cardWidgets.current.set(number, widget);
		} else {
			cardWidgets.current.delete(number);
		}
	};

	return (
		<>
			<Island ref={island} Slot={{ Padding: "0,8,0,0" }}>
				<HBox Spacing={8} Slot={{ Padding: "14,6" }}>
					<Label>{cards.length} card{cards.length === 1 ? "" : "s"}</Label>
				</HBox>
				<VBox Spacing={10} Width={300} Slot={{ Padding: "18,14" }}>
					<Label TextSize={17}>Motion</Label>
					<HBox Spacing={10}>
						<Label Width={60} Slot={{ VAlign: "Center" }}>Speed</Label>
						<Slider
							Min={0.1}
							Max={2}
							Value={speed}
							Slot={{ Fill: 1 }}
							OnChanged={(value) => {
								raven.Rset_animation_speed(value);
								setSpeed(value);
							}}
						/>
						<Label Width={40} Slot={{ VAlign: "Center" }}>{speed.toFixed(1)}x</Label>
					</HBox>
					{/* for the users who ask their system for less motion */}
					<Checkbox Style="Switch" OnChanged={(reduce) => raven.Rset_animations_enabled(reduce ? 0 : 1)}>Reduce motion</Checkbox>
				</VBox>
			</Island>

			<HBox Spacing={14} Slot={{ Padding: "16,56,16,16" }}>
				<TransitionPanel onPlay={play} onPlayAll={playAll} />

				<VBox Spacing={14} Slot={{ Fill: 1 }}>
					<Stage card={card} title={title} />

					<Border Padding={14} Height={190} CornerRadius={14} Appear="FlyUp" AppearDelay={0.16}>
						<VBox Spacing={8}>
							<HBox>
								<Label TextSize={17} Slot={{ Fill: 1 }}>Springs</Label>
								<Label Opacity={0.6} Slot={{ VAlign: "Center" }}>Move the pointer over the tracks; click to kick</Label>
							</HBox>
							<Springs />
						</VBox>
					</Border>
				</VBox>

				<CardPanel cards={cards} register={registerCard} onAdd={addCard} onRemove={removeCard} />
			</HBox>
		</>
	);
}

await runApp(<App />, { Title: "Raven - animations", Width: 960, Height: 640, MinWidth: 720, MinHeight: 480 }, { appName: "animations" });
