import { useEffect, useState, type ReactNode } from "react";
import { Button, Checkbox, HBox, Label, TextInput, VBox } from "@deckyfx/raven-react";

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

/** The testing ground of raven-react: state, typed text, a timer, conditions and a list. */
export function App(): ReactNode {
	const [clicks, setClicks] = useState(0);
	const [name, setName] = useState("");
	const [shout, setShout] = useState(false);
	const [seconds, setSeconds] = useState(0);
	const [items, setItems] = useState<Item[]>(() => [newItem("Apples"), newItem("Pears")]);

	useEffect(() => {
		const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
		return () => clearInterval(timer);
	}, []);

	const greeting = `Hello, ${name || "World"}!`;

	return (
		<VBox Spacing={12} Slot={{ Padding: 24 }}>
			<Label TextSize={24}>{shout ? greeting.toUpperCase() : greeting}</Label>
			<TextInput Placeholder="Your name" Text={name} OnChanged={setName} />
			<Checkbox Checked={shout} OnChanged={setShout}>Shout</Checkbox>
			<HBox Spacing={12}>
				<Button Style="Primary" OnClicked={() => setClicks(clicks + 1)}>Click me</Button>
				<Label Opacity={0.7}>{clicks === 0 ? "Not clicked yet" : `Clicked ${clicks} time(s)`}</Label>
			</HBox>
			{clicks >= 3 && <Label>You like clicking.</Label>}
			<Label Opacity={0.7}>Open for {seconds} s</Label>
			<HBox Spacing={8}>
				<Button OnClicked={() => setItems([...items, newItem(name || `Item ${items.length + 1}`)])}>Add</Button>
				<Button OnClicked={() => setItems([...items].reverse())}>Reverse</Button>
			</HBox>
			{items.map((item) => (
				<HBox key={item.id} Spacing={8}>
					<Label Slot={{ Fill: 1 }}>{item.text}</Label>
					<Button OnClicked={() => setItems(items.filter((other) => other.id !== item.id))}>Remove</Button>
				</HBox>
			))}
		</VBox>
	);
}
