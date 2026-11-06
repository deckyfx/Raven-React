/**
 * The island at the top of the window. Folded, it says what plays; unfolded (pointer over it), it
 * is a small player. On a MacBook it lives in the notch and stays there when the window moves.
 */

import type { ReactNode, RefObject } from "react";
import { ComboBox, HBox, Island, Label, Separator, Slider, VBox, type WidgetInstance } from "@decky.fx/raven-react";
import { hex, trackAt } from "./library";
import { LOOK_NAMES, useMusic } from "./music";
import { useProgress } from "./PlayerBar";
import { Cover, Heading, Icon, Visualizer } from "./tags";
import { IconButton, PlayButton } from "./widgets";

/** The line of the time, on its own so that nothing else renders with the clock. */
function IslandProgress(): ReactNode {
	const { elapsed, length, fraction } = useProgress();
	const music = useMusic();
	return (
		<HBox Spacing={8}>
			<Label Text={elapsed} Class="muted" TextSize={11} Slot={{ VAlign: "Center" }} />
			<Slider Class="seek" Min={0} Max={1} Value={fraction} OnChanged={music.seek} Slot={{ Fill: 1, VAlign: "Center" }} />
			<Label Text={length} Class="muted" TextSize={11} Slot={{ VAlign: "Center" }} />
		</HBox>
	);
}

/** The props of `IslandPanel`. */
export interface IslandPanelProps {
	/** Handed over to the window, which is where an island floats. */
	readonly islandRef: RefObject<WidgetInstance | null>;
	/** Unfolded from the start. */
	readonly expanded: boolean;
}

/** The island, with its two contents: the first folded, the second unfolded. */
export function IslandPanel({ islandRef, expanded }: IslandPanelProps): ReactNode {
	const music = useMusic();
	const { player, album } = music;
	const likedTrack = music.liked.has(player.track);
	return (
		<Island ref={islandRef} Attached Notch ExpandOnHover Expanded={expanded}>
			{/* folded */}
			<HBox Spacing={8} Slot={{ Padding: [6, 4] }}>
				<Cover Album={album.index} Size={20} CornerRadius={5} Slot={{ VAlign: "Center" }} />
				<Label Text={music.islandTitle} TextSize={12} Slot={{ VAlign: "Center" }} />
				<Visualizer Bars={4} Gap={2} Width={16} Height={12} Slot={{ VAlign: "Center" }} />
			</HBox>

			{/* unfolded */}
			<VBox Spacing={12} Width={380} Slot={{ Padding: [16, 12, 16, 14] }}>
				<HBox Spacing={12}>
					<Cover Album={album.index} Size={60} CornerRadius={10} />
					<VBox Spacing={3} Slot={{ Fill: 1, VAlign: "Center" }}>
						<Heading Text={trackAt(player.track).title} TextSize={16} />
						<Label Text={album.artist} Class="muted" TextSize={13} />
					</VBox>
					<Visualizer Bars={6} Gap={2} Width={30} Height={24} Slot={{ VAlign: "Center" }} />
				</HBox>
				<IslandProgress />
				<HBox Spacing={14} Slot={{ HAlign: "Center" }}>
					<IconButton
						Glyph={likedTrack ? "heart-filled" : "heart"}
						Tint={likedTrack ? hex(music.accent) : undefined}
						OnClicked={music.toggleLikeCurrent}
						Tip="Save to Liked songs"
						Size={18}
						Slot={{ VAlign: "Center" }}
					/>
					<IconButton Glyph="previous" OnClicked={music.previous} Tip="Previous" Size={22} Slot={{ VAlign: "Center" }} />
					<PlayButton Playing={player.playing} OnClicked={music.toggle} White Size={44} IconSize={20} />
					<IconButton Glyph="next" OnClicked={music.next} Tip="Next" Size={22} Slot={{ VAlign: "Center" }} />
					<IconButton Glyph="panel" OnClicked={music.togglePanel} Tip="Now playing panel" Size={18} Slot={{ VAlign: "Center" }} />
				</HBox>
				<Separator />
				<HBox Spacing={10}>
					<Icon Glyph="moon" Size={16} Opacity={0.8} Slot={{ VAlign: "Center" }} />
					<Label Text="Look" Class="muted" Slot={{ VAlign: "Center" }} />
					<ComboBox Items={LOOK_NAMES} Selected={music.look} OnChanged={music.chooseLook} Slot={{ Fill: 1 }} />
				</HBox>
			</VBox>
		</Island>
	);
}
