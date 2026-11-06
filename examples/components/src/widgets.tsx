/**
 * What `widgets.xml` declares in the original, with `<Widget Name="...">`. A tag of your own is
 * a component, its parameters are props, `{...}` is JavaScript, and `<Include>` is this import.
 * `registerTags` makes them tags Raven knows too, for documents built by code: there is no XML
 * declaration of them, these components are the only one.
 */

import type { ReactNode } from "react";
import { Border, HBox, Label, registerTag, Separator, VBox } from "@decky.fx/raven-react";

/** A small colored label. */
export function Badge({ Text = "new", Color = "#3B82F6" }: { readonly Text?: string; readonly Color?: string }): ReactNode {
	return (
		<Border Background={Color} CornerRadius={100} Padding="8,2" Slot={{ VAlign: "Center" }}>
			<Label TextSize={11} Color="white">{Text.toUpperCase()}</Label>
		</Border>
	);
}

/** The color of a number that goes up, goes down, or stays. */
function trendColor(trend: number): string {
	if (trend > 0) {
		return "#46A758";
	}
	return trend < 0 ? "#E5484D" : "gray";
}

/** A number with its name. `Trend` colors the number. */
export function Stat({ Label: name, Value = "0", Trend = 0 }: { readonly Label: string; readonly Value?: string; readonly Trend?: number }): ReactNode {
	return (
		<VBox Spacing={2}>
			<Label Opacity={0.6} TextSize={12}>{name}</Label>
			<Label TextSize={24} Color={trendColor(Trend)}>{Value}</Label>
		</VBox>
	);
}

/** The props of a `Card`. */
interface CardProps {
	readonly Title?: string;
	readonly Badge?: string;
	readonly Wide?: boolean;
	readonly Appear?: "Pop" | "Drop";
	readonly AppearDelay?: number;
	/** What the original marks `Into="footer"`: a named place is simply another prop. */
	readonly footer?: ReactNode;
	readonly children?: ReactNode;
}

/** A card: a title, an optional badge, and whatever is put inside it. */
export function Card({ Title = "Untitled", Badge: badge = "", Wide = false, Appear, AppearDelay, footer, children }: CardProps): ReactNode {
	return (
		<Border Padding={14} CornerRadius={14} Width={Wide ? 452 : 220} Appear={Appear} AppearDelay={AppearDelay}>
			<VBox Spacing={8}>
				<HBox Spacing={8}>
					<Label TextSize={16} Slot={{ Fill: 1, VAlign: "Center" }}>{Title}</Label>
					{badge !== "" && <Badge Text={badge} Color={badge === "hot" ? "#E5484D" : "#3B82F6"} />}
				</HBox>
				<Separator />
				{children}
				<HBox Spacing={6} Slot={{ HAlign: "Right" }}>
					{footer}
				</HBox>
			</VBox>
		</Border>
	);
}

/** The tags `registerTags` gives Raven. */
export const TAG_NAMES = ["Badge", "Stat", "Card"] as const;

/** Makes the components of this file tags Raven knows, with the kinds of their attributes. */
export function registerTags(): void {
	registerTag("Badge", Badge, { attributes: { Text: "string", Color: "string" } });
	registerTag("Stat", Stat, { attributes: { Label: "string", Value: "string", Trend: "number" } });
	registerTag("Card", Card, { attributes: { Title: "string", Badge: "string", Wide: "boolean", Appear: "string", AppearDelay: "number" }, slots: ["footer"] });
}
