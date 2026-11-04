/** The bar of the player, at the bottom: the song, the transport and its progress, the volume. */

import type { ReactNode } from "react";
import { Border, Grid, HBox, Label, Slider, VBox } from "@decky.fx/raven-react";
import { formatTime, hex, trackAt } from "./library";
import { useMusic, usePosition } from "./music";
import { Cover, Visualizer } from "./tags";
import { IconButton, PlayButton } from "./widgets";

/** The progress of the song, from the clock of the player. */
export interface Progress {
	readonly elapsed: string;
	readonly length: string;
	readonly fraction: number;
}

/** Reads the progress: a component that calls this renders four times a second. */
export function useProgress(): Progress {
	const position = usePosition();
	const { player } = useMusic();
	const seconds = player.track >= 0 ? trackAt(player.track).seconds : 0;
	return {
		elapsed: formatTime(position),
		length: formatTime(seconds),
		fraction: seconds > 0 ? position / seconds : 0,
	};
}

/** The line of the time, on its own so that nothing else renders with the clock. */
function PlayerProgress(): ReactNode {
	const { elapsed, length, fraction } = useProgress();
	const music = useMusic();
	return (
		<HBox Spacing={10}>
			<Label Text={elapsed} Class="muted" TextSize={12} Width={40} TextAlign="Right" Slot={{ VAlign: "Center" }} />
			<Slider Class="seek" Min={0} Max={1} Value={fraction} OnChanged={music.seek} Slot={{ Fill: 1, VAlign: "Center" }} />
			<Label Text={length} Class="muted" TextSize={12} Width={40} Slot={{ VAlign: "Center" }} />
		</HBox>
	);
}

/** The bar. */
export function PlayerBar(): ReactNode {
	const music = useMusic();
	const { player, album } = music;
	const track = trackAt(player.track);
	const likedTrack = music.liked.has(player.track);
	return (
		<Border Class="bar" Height={88} Padding={[16, 0]}>
			<Grid Columns="1,1.3,1" Spacing={16}>
				{/* the song */}
				<HBox Spacing={14} Slot={{ Column: 0, VAlign: "Center" }}>
					<Cover Album={album.index} Size={58} CornerRadius={6} />
					<VBox Spacing={3} Slot={{ VAlign: "Center" }}>
						<Label Text={track.title} TextSize={15} />
						<Label Text={album.artist} Class="muted" TextSize={13} />
					</VBox>
					<IconButton
						Glyph={likedTrack ? "heart-filled" : "heart"}
						Tint={likedTrack ? hex(music.accent) : undefined}
						OnClicked={music.toggleLikeCurrent}
						Tip="Save to Liked songs (Ctrl+L)"
						Size={18}
						Slot={{ VAlign: "Center" }}
					/>
				</HBox>

				{/* the transport */}
				<VBox Spacing={4} Slot={{ Column: 1, VAlign: "Center" }}>
					<HBox Spacing={12} Slot={{ HAlign: "Center" }}>
						<IconButton
							Glyph="shuffle"
							Color={player.shuffle ? music.accent : null}
							OnClicked={music.toggleShuffle}
							Tip="Shuffle"
							Size={18}
							Slot={{ VAlign: "Center" }}
						/>
						<IconButton Glyph="previous" OnClicked={music.previous} Tip="Previous (Ctrl+Left)" Size={20} Slot={{ VAlign: "Center" }} />
						<PlayButton Playing={player.playing} OnClicked={music.toggle} White Size={40} IconSize={18} />
						<IconButton Glyph="next" OnClicked={music.next} Tip="Next (Ctrl+Right)" Size={20} Slot={{ VAlign: "Center" }} />
						<IconButton
							Glyph={player.repeat === "one" ? "repeat-one" : "repeat"}
							Color={player.repeat !== "off" ? music.accent : null}
							OnClicked={music.cycleRepeat}
							Tip="Repeat"
							Size={18}
							Slot={{ VAlign: "Center" }}
						/>
					</HBox>
					<PlayerProgress />
				</VBox>

				{/* the rest */}
				<HBox Spacing={6} Slot={{ Column: 2, HAlign: "Right", VAlign: "Center" }}>
					<Visualizer Bars={5} Width={22} Height={16} Slot={{ VAlign: "Center", Padding: [0, 0, 8, 0] }} />
					<IconButton Glyph="microphone" OnClicked={music.notInThisDemo} Tip="Lyrics" Size={18} Slot={{ VAlign: "Center" }} />
					<IconButton Glyph="panel" OnClicked={music.togglePanel} Tip="Now playing panel" Size={18} Slot={{ VAlign: "Center" }} />
					<IconButton Glyph="queue" OnClicked={music.notInThisDemo} Tip="Queue" Size={18} Slot={{ VAlign: "Center" }} />
					<IconButton Glyph={player.muted ? "muted" : "volume"} OnClicked={music.toggleMute} Tip="Mute" Size={18} Slot={{ VAlign: "Center" }} />
					<Slider Min={0} Max={1} Value={player.muted ? 0 : player.volume} OnChanged={music.setVolume} Width={120} Slot={{ VAlign: "Center" }} />
				</HBox>
			</Grid>
		</Border>
	);
}
