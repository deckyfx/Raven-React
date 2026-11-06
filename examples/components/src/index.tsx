/**
 * Tags of your own, and documents built from code. The port of `examples/components` of Raven.
 *
 *   `<Widget Name="Card">`   is a component (`widgets.tsx`, and `Row` here)
 *   `<Repeat>`, `<ForEach>`  are `.map`
 *   `If="..."`               is `&&`
 *   `<Include>`              is an import
 *
 * The "Add a card" button is the part that stays Raven's own: it builds a piece of interface as
 * a document (`Rxml_document_...`, `Rxml_node_...`), asks the library for the widgets and shows
 * the XML it wrote. A document can only name tags the library knows, so the components of
 * `widgets.tsx` are registered as tags (`registerTag`): Raven builds `<Card>` with React's
 * `Card`, and there is no other declaration of it. Where the original writes `Into="footer"` on
 * a child, a child of a component's tag goes in `<Into Name="footer">`.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Expander, HBox, Label, raven, runApp, ScrollBox, TextEditor, VBox, WrapBox, type WidgetInstance } from "@decky.fx/raven-react";
import { Badge, Card, registerTags, Stat, TAG_NAMES } from "./widgets";

const DOCUMENT_TITLES = ["Builds", "Tickets", "Reviews", "Deploys"];
const REGIONS = ["paris", "tokyo", "oslo"];
const SERVERS = [0, 1, 2, 3];

/** A person of the team. */
function Row({ Name, Role, Online = false }: { readonly Name: string; readonly Role: string; readonly Online?: boolean }): ReactNode {
	return (
		<HBox Spacing={8}>
			<Label Slot={{ Fill: 1 }}>{Name}</Label>
			<Label Opacity={0.6}>{Role}</Label>
			<Badge Text={Online ? "online" : "away"} Color={Online ? "#46A758" : "gray"} />
		</HBox>
	);
}

/** The tags the library knows, as the original shows them: here, the components registered by `registerTags`. */
function declaredTags(): string {
	return `Tags of components: ${TAG_NAMES.filter((name) => raven.Rxml_is_tag_registered(name)).map((name) => `<${name}>`).join(" ")}`;
}

/**
 * Builds, as a document:
 * `<Card Title="..." Badge="new" Appear="Drop"> <Stat .../> <Stat .../> <Into Name="footer"> <Button/> </Into> </Card>`
 */
function buildCardDocument(added: number): raven.Rid {
	const document = raven.Rxml_document_create("Card");
	const card = raven.Rxml_document_get_root(document);
	raven.Rxml_node_set_attribute(card, "Title", DOCUMENT_TITLES[added % DOCUMENT_TITLES.length] ?? "");
	raven.Rxml_node_set_attribute(card, "Badge", "new");
	raven.Rxml_node_set_attribute(card, "Appear", "Drop");
	["Open", "Closed today"].forEach((label, i) => {
		const stat = raven.Rxml_node_add_child(card, "Stat", -1);
		raven.Rxml_node_set_attribute(stat, "Label", label);
		raven.Rxml_node_set_attribute(stat, "Value", String(3 + (added * 7 + i * 11) % 40));
		raven.Rxml_node_set_attribute(stat, "Trend", i === 0 ? "-1" : "1");
	});
	// (a tag of a component sends what <Into> holds to its prop of that name: the footer of Card)
	const footer = raven.Rxml_node_add_child(card, "Into", -1);
	raven.Rxml_node_set_attribute(footer, "Name", "footer");
	const button = raven.Rxml_node_add_child(footer, "Button", -1);
	raven.Rxml_node_set_attribute(button, "Text", "Remove");
	raven.Rxml_node_set_attribute(button, "Style", "Flat");
	raven.Rxml_node_set_attribute(button, "OnClicked", "card.remove");
	return document;
}

/** The whole window. */
function App(): ReactNode {
	const cards = useRef<WidgetInstance>(null);
	/** How many cards were added from C: their titles and numbers follow from it. */
	const addedCount = useRef(0);
	const [status, setStatus] = useState(declaredTags);
	const [source, setSource] = useState('<!-- press "Add a card" -->');

	// "Remove" is in a card made from a document, which names its action in text. `useAction`
	// does not say who fired an action, and this one needs to know: it goes through the C API.
	useEffect(() => {
		raven.Raction_bind("card.remove", (sender) => {
			// the button is inside the card it removes: climb to the child of the list of cards
			const list = cards.current?.widget;
			let widget = sender;
			while (widget !== raven.R_INVALID_ID && raven.Rwidget_get_parent(widget) !== list) {
				widget = raven.Rwidget_get_parent(widget);
			}
			if (widget !== raven.R_INVALID_ID) {
				raven.Rwidget_destroy(widget);
			}
		});
		return () => raven.Raction_unbind("card.remove");
	}, []);

	/** The document becomes widgets, beside the ones React made: `<Card>` is expanded as from a file. */
	const addCard = (): void => {
		// (a ref, not state: two clicks before React renders again would read the same count, and make the same card)
		const number = addedCount.current;
		const document = buildCardDocument(number);
		const widget = raven.Rxml_document_create_widget(document);
		if (widget !== raven.R_INVALID_ID && cards.current) {
			raven.Rwidget_add_child(cards.current.widget, widget);
			addedCount.current = number + 1;
			// and it can be written back as text
			setSource(raven.Rxml_document_to_string(document) ?? "");
			setStatus(number === 0 ? "1 card added from C." : 'Several cards added from C; "Remove" takes one away.');
		}
		raven.Rxml_document_destroy(document);
	};

	const showDetails = (): void => setStatus('A button given to a card with Into="footer" was clicked.');

	return (
		<ScrollBox>
			<VBox Spacing={12} Slot={{ Padding: 16 }}>
				<HBox Spacing={12}>
					<Label TextSize={24} Slot={{ Fill: 1 }}>Dashboard</Label>
					<Button Style="Primary" OnClicked={addCard} Slot={{ VAlign: "Center" }}>Add a card</Button>
				</HBox>

				<WrapBox ref={cards} Spacing={12}>
					<Card Title="Sales" Badge="hot" Appear="Pop" footer={<Button Style="Flat" OnClicked={showDetails}>Details</Button>}>
						<Stat Label="This week" Value="1 284" Trend={1} />
						<Stat Label="Returns" Value="37" Trend={-1} />
					</Card>

					<Card Title="Team" Appear="Pop" AppearDelay={0.06}>
						<Row Name="Ada" Role="Lead" Online />
						<Row Name="Linus" Role="Kernel" />
						<Row Name="Grace" Role="Compiler" Online />
					</Card>

					<Card
						Title="Servers"
						Badge="4"
						Wide
						Appear="Pop"
						AppearDelay={0.12}
						footer={
							<>
								<Button OnClicked={showDetails}>Restart all</Button>
								<Button Style="Flat" OnClicked={showDetails}>Logs</Button>
							</>
						}
					>
						<HBox Spacing={16}>
							{SERVERS.map((i) => <Stat key={i} Label={`node-${i + 1}`} Value={`${20 + i * 17} %`} Trend={i === 3 ? -1 : 0} />)}
						</HBox>
						<HBox Spacing={6}>
							<Label Opacity={0.6} Slot={{ VAlign: "Center" }}>Regions:</Label>
							{REGIONS.map((city, n) => <Badge key={city} Text={city} Color={n % 2 === 0 ? "#8E4EC6" : "#05A2C2"} />)}
						</HBox>
					</Card>
				</WrapBox>

				<Label Opacity={0.7}>{status}</Label>
				<Expander Title="The XML of the cards added from C" Expanded>
					<TextEditor Language="XML" ReadOnly Height={150} Text={source} />
				</Expander>
			</VBox>
		</ScrollBox>
	);
}

await runApp(<App />, { Title: "Raven - components", Width: 760, Height: 560, MinWidth: 520, MinHeight: 400 }, {
	appName: "components",
	setup: registerTags,
});
