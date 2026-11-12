import { createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { Button, Checkbox, HBox, Label, TextInput, VBox } from "@decky.fx/raven-tsx/solid";

/** A row of the list. Two rows can have the same text, so the id is what tells them apart. */
interface Item {
	readonly id: number;
	readonly text: string;
}

let nextItemId = 0;

/** A new row with its own id. */
function newItem(text: string): Item {
	return { id: ++nextItemId, text };
}

/** Signals, typed text, a timer, a condition and a list: the component runs once, and the signals change the widgets. */
export function App(): JSX.Element {
	const [clicks, setClicks] = createSignal(0);
	const [name, setName] = createSignal("");
	const [shout, setShout] = createSignal(false);
	const [seconds, setSeconds] = createSignal(0);
	const [items, setItems] = createSignal<readonly Item[]>([newItem("Apples"), newItem("Pears")]);

	const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
	onCleanup(() => clearInterval(timer));

	const greeting = (): string => `Hello, ${name() || "World"}!`;

	return (
		<VBox Spacing={12} Slot={{ Padding: 16 }}>
			<Label TextSize={24}>{shout() ? greeting().toUpperCase() : greeting()}</Label>
			<TextInput Placeholder="Your name" Text={name()} OnChanged={setName} />
			<Checkbox Checked={shout()} OnChanged={setShout}>Shout</Checkbox>
			<HBox Spacing={12}>
				<Button Style="Primary" OnClicked={() => setClicks(clicks() + 1)}>Click me</Button>
				<Label Opacity={0.7}>{clicks() === 0 ? "Not clicked yet" : `Clicked ${clicks()} time(s)`}</Label>
			</HBox>
			<Show when={clicks() >= 3}>
				<Label>You like clicking.</Label>
			</Show>
			<Label Opacity={0.7}>Open for {seconds()} s</Label>
			<HBox Spacing={8}>
				<Button OnClicked={() => setItems([...items(), newItem(name() || `Item ${items().length + 1}`)])}>Add</Button>
				<Button OnClicked={() => setItems([...items()].reverse())}>Reverse</Button>
			</HBox>
			<For each={items()}>
				{(item) => (
					<HBox Spacing={8}>
						<Label Slot={{ Fill: 1 }}>{item.text}</Label>
						<Button OnClicked={() => setItems(items().filter((other) => other.id !== item.id))}>Remove</Button>
					</HBox>
				)}
			</For>
		</VBox>
	);
}
