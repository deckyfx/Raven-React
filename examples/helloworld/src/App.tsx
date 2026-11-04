import { useEffect, useState, type ReactNode } from "react";
import { Button, Checkbox, ComboBox, Custom, Expander, HBox, Label, ListView, raven, Slider, SpinBox, TabView, TextInput, VBox, Window } from "@deckyfx/raven-react";

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

/** State, typed text, a timer, conditions and a list. */
function Basics({ onOpenWindow }: { onOpenWindow: () => void }): ReactNode {
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
		<VBox Spacing={12} Slot={{ Padding: 16, Title: "Basics" }}>
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
				<Button OnClicked={onOpenWindow}>Open a window</Button>
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

/** The widgets that give a value, and a list of a million rows. */
function Inputs(): ReactNode {
	const [volume, setVolume] = useState(0.5);
	const [copies, setCopies] = useState(2);
	const [fruit, setFruit] = useState(0);
	const [open, setOpen] = useState(true);
	const [row, setRow] = useState(0);
	const fruits = ["Apples", "Pears", "Plums"];

	return (
		<VBox Spacing={12} Slot={{ Padding: 16, Title: "Inputs" }}>
			<Label>Volume {Math.round(volume * 100)} %</Label>
			<Slider Value={volume} OnChanged={setVolume} />
			<HBox Spacing={12}>
				<Label>Copies {copies}</Label>
				<SpinBox Value={copies} Step={1} Width={100} OnChanged={setCopies} />
			</HBox>
			<HBox Spacing={12}>
				<Label>{fruits[fruit]}</Label>
				<ComboBox Items={fruits} Selected={fruit} Width={120} OnChanged={setFruit} />
			</HBox>
			<Expander Title={open ? "Open" : "Closed"} Expanded={open} OnChanged={setOpen}>
				<Label>What the expander holds</Label>
			</Expander>
			<Label>Row {row} of a million</Label>
			<ListView Height={100} ItemCount={1_000_000} ItemText={(index) => `Row ${index}`} Selected={row} OnChanged={setRow} />
		</VBox>
	);
}

/** Drawing with the C API, following the state. */
function Painting(): ReactNode {
	const [bend, setBend] = useState(0.6);
	return (
		<VBox Spacing={12} Slot={{ Padding: 16, Title: "Paint" }}>
			<Slider Value={bend} OnChanged={setBend} />
			<Custom
				OnMeasure={() => ({ Width: 400, Height: 200 })}
				OnPaint={(painter, width, height) => {
					raven.Rdraw_rect(painter, 0, 0, width, height, 8, 0.15, 0.2, 0.3, 1);
					const pull = height * bend;
					raven.Rdraw_curve(painter, 10, height - 10, width * 0.3, pull, width * 0.7, height - pull, width - 10, 10, 4, 1, 0.8, 0.2, 1);
				}}
			/>
		</VBox>
	);
}

/** The testing ground of raven-react. */
export function App(): ReactNode {
	const [extraOpen, setExtraOpen] = useState(false);
	const [opened, setOpened] = useState(0);

	return (
		<>
			<Window Title="Hello World" Width={520} Height={560}>
				<TabView Slot={{ Fill: 1 }}>
					<Basics
						onOpenWindow={() => {
							setExtraOpen(true);
							setOpened(opened + 1);
						}}
					/>
					<Inputs />
					<Painting />
				</TabView>
			</Window>
			{extraOpen && (
				<Window Title={`Another window (${opened})`} Width={320} Height={160} OnClose={() => setExtraOpen(false)}>
					<VBox Spacing={12} Slot={{ Padding: 16 }}>
						<Label>This window is an element: it closes when React takes it out.</Label>
						<Button OnClicked={() => setExtraOpen(false)}>Close it from here</Button>
					</VBox>
				</Window>
			)}
		</>
	);
}
