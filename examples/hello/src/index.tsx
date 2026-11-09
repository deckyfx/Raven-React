/** A window, a label and two buttons. The port of `examples/hello` of Raven. */

import { useState, type ReactNode } from "react";
import { Button, HBox, Label, runApp, VBox } from "@decky.fx/raven-tsx/react";

function App(): ReactNode {
	const [clicks, setClicks] = useState(0);
	return (
		// a vertical box centered in the window
		<VBox Spacing={12} Slot={{ HAlign: "Center", VAlign: "Center" }}>
			<Label TextSize={24} Slot={{ HAlign: "Center" }}>Hello from Raven</Label>
			<Label Slot={{ HAlign: "Center" }}>{clicks === 0 ? "Press the button" : `Clicked ${clicks} time${clicks > 1 ? "s" : ""}`}</Label>
			<HBox Spacing={8} Slot={{ HAlign: "Center" }}>
				<Button Style="Primary" Tooltip="Counts the clicks" OnClicked={() => setClicks(clicks + 1)}>Click me</Button>
				<Button OnClicked="app.quit">Quit</Button>
			</HBox>
		</VBox>
	);
}

await runApp(<App />, { Title: "Hello Raven", Width: 420, Height: 220 }, { appName: "hello" });
