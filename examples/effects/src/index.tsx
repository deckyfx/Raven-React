/**
 * The effects that come with Raven, and two effects of the application. The port of `examples/effects` of Raven.
 *
 * `assets/wave.spv` and `assets/liquid.spv` are compiled from the `.frag` files next to them:
 *   glslangValidator -V -I<raven>/include/raven/shaders wave.frag -o wave.spv
 */

import type { ReactNode } from "react";
import { Border, HBox, Label, Overlay, raven, runApp, UniformGrid, VBox } from "@decky.fx/raven-tsx/react";

/** A shader of this example. */
function shader(file: string): string {
	return `${import.meta.dir}/../assets/${file}`;
}

/** The effects that only need a card to show them. */
const PLAIN_EFFECTS = ["aurora", "mesh", "plasma", "grain", "spotlight", "shimmer"];

/** What a card says, at its bottom left. */
function Caption({ children }: { readonly children: string }): ReactNode {
	return <Label TextSize={18} Slot={{ HAlign: "Left", VAlign: "Bottom", Padding: 16 }}>{children}</Label>;
}

/** A card showing an effect of Raven. */
function Card({ effect }: { readonly effect: string }): ReactNode {
	return (
		<VBox Spacing={8}>
			<Border Effect={effect} CornerRadius={18} Height={190}>
				<Caption>{effect}</Caption>
			</Border>
		</VBox>
	);
}

/** Text that is seen through the rings of the ripple effect. */
function RippleCard(): ReactNode {
	return (
		<Overlay Height={190}>
			<Border CornerRadius={18} Background="#1C1C1E">
				<VBox Spacing={2} Slot={{ Padding: 14 }}>
					<Label TextSize={22}>Rings run over</Label>
					<Label TextSize={22}>what is behind,</Label>
					<Label TextSize={22} Color={{ Text: "#64D2FF" }}>like water.</Label>
				</VBox>
			</Border>
			<Border Effect="ripple" CornerRadius={18} EffectColor="#64D2FF20" EffectParams={[1, 5, 1.4, 0.7]}>
				<Caption>ripple</Caption>
			</Border>
		</Overlay>
	);
}

function App(): ReactNode {
	return (
		<VBox Spacing={22} Slot={{ Padding: 32 }}>
			<HBox Spacing={12}>
				<Label TextSize={28} Slot={{ Fill: 1 }}>Effects</Label>
				<Label Opacity={0.6} Slot={{ VAlign: "Center" }}>{'Border Effect="..."  -  your own: a .spv written with raven_effect.glsl'}</Label>
			</HBox>
			<UniformGrid Columns={4} Spacing={18}>
				{PLAIN_EFFECTS.map((effect) => <Card key={effect} effect={effect} />)}
				<Border Effect="neon" CornerRadius={18} Height={190} Background="#16161A">
					<Caption>neon</Caption>
				</Border>
				<RippleCard />
			</UniformGrid>
			<HBox Spacing={18} Height={150}>
				{/* a shader of the application (wave.frag) */}
				<Border Effect={shader("wave.spv")} EffectColor="#1C1C1E" EffectColor2="#0A84FF" CornerRadius={18} Slot={{ Fill: 1 }}>
					<Caption>wave.spv: an effect of the application</Caption>
				</Border>
				{/* a shader that reads what is behind it (liquid.frag) */}
				<Overlay Slot={{ Fill: 1 }}>
					<Border CornerRadius={18} Effect="mesh" />
					<Border Effect={shader("liquid.spv")} EffectBackdrop EffectColor="#FFFFFF18" EffectParams={8} CornerRadius={18} Slot={{ Padding: 22 }}>
						<Caption>liquid.spv: reads what is behind</Caption>
					</Border>
				</Overlay>
			</HBox>
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven effects", Width: 1180, Height: 720 }, {
	appName: "Raven effects",
	setup: () => raven.Rtheme_apply(raven.R_THEME_DARK),
});
