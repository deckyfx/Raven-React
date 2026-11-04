/** The settings. The look can be any look of Raven or any of the three themes of the player. */

import { useRef, useState, type ReactNode } from "react";
import { Border, Checkbox, ColorPicker, ComboBox, HBox, Label, raven, ScrollBox, Separator, Slider, VBox, type WidgetInstance } from "@decky.fx/raven-react";
import { LOOK_NAMES, useMusic } from "./music";
import { Heading } from "./tags";
import { SettingRow } from "./widgets";

const ABOUT = `**Raven Music** is a showcase of Raven: no server, no sound, only the interface.

- every part is a React component of \`src/\`, as each part of the C example is an XML file
- the cards, the rows and the tiles are components of \`widgets.tsx\`
- \`Icon\`, \`Cover\`, \`Visualizer\` and \`Heading\` are made by the application
- the themes are files of \`assets/themes/\`; the accent follows the cover playing
- the island at the top lives in the notch of a MacBook`;

/** The page of the settings. */
export function Settings(): ReactNode {
	const music = useMusic();
	const [crossfade, setCrossfade] = useState(5);
	const picker = useRef<WidgetInstance>(null);

	const onAccent = (): void => {
		if (picker.current) {
			const [r, g, b] = raven.Rcolor_picker_get_color(picker.current.widget);
			music.pickAccent([r, g, b]);
		}
	};

	return (
		<ScrollBox>
			<VBox Spacing={18} MaxWidth={820} Slot={{ Padding: [32, 24, 32, 40] }}>
				<Heading Text="Settings" TextSize={30} />

				<Label Class="eyebrow" Text="APPEARANCE" Slot={{ Padding: [0, 8, 0, 0] }} />
				<SettingRow Title="Look" Description="A theme of the player, or a look of Raven: Windows, macOS, GNOME, glass, high contrast.">
					<ComboBox Items={LOOK_NAMES} Selected={music.look} OnChanged={music.chooseLook} Width={260} />
				</SettingRow>
				<SettingRow Title="Accent from the cover" Description="The color of the controls follows the cover of what plays.">
					<Checkbox Style="Switch" Checked={music.followCover} OnChanged={music.setFollowCover} />
				</SettingRow>
				<SettingRow Title="Accent" Description="The color of the controls, when it does not follow the cover.">
					<ColorPicker ref={picker} Popup Alpha={false} Color="#B79CFF" OnChanged={onAccent} />
				</SettingRow>
				<SettingRow Title="Background" Description="What moves behind the panels, in the colors of the cover.">
					<ComboBox Items={["Mesh", "Aurora", "Plasma", "Spotlight", "Shimmer", "None"]} Selected={music.effect} OnChanged={music.setEffect} Width={160} />
				</SettingRow>
				<SettingRow Title="Animate the background" Description="Off, the background stays still and the window draws only when something changes.">
					<Checkbox Style="Switch" Checked={music.animate} OnChanged={music.setAnimate} />
				</SettingRow>
				<SettingRow Title="Now playing panel" Description="The panel on the right, with the cover and what comes next.">
					<Checkbox Style="Switch" Checked={music.panel} OnChanged={music.setPanel} />
				</SettingRow>

				<Separator />
				<Label Class="eyebrow" Text="PLAYBACK" />
				<SettingRow Title="Crossfade" Description="Songs fade into each other.">
					<HBox Spacing={10}>
						<Slider Min={0} Max={12} Step={1} Value={crossfade} Width={180} OnChanged={setCrossfade} Slot={{ VAlign: "Center" }} />
						<Label Text={`${Math.round(crossfade)} s`} Width={36} Slot={{ VAlign: "Center" }} />
					</HBox>
				</SettingRow>
				<SettingRow Title="Normalize the volume" Description="The same loudness for every song.">
					<Checkbox Style="Switch" Checked />
				</SettingRow>
				<SettingRow Title="Streaming quality" Description="Nothing is streamed: the songs of this player are made up.">
					<ComboBox Items={["Low", "Normal", "High", "Very high"]} Selected={2} Width={160} />
				</SettingRow>

				<Separator />
				<Label Class="eyebrow" Text="ABOUT" />
				<Border Class="surface" CornerRadius={12} Padding={18}>
					<Label Markdown Wrap Text={ABOUT} />
				</Border>
			</VBox>
		</ScrollBox>
	);
}
