/** The panel of the song playing, on the right. */

import type { ReactNode } from "react";
import { Border, Button, HBox, Label, ScrollBox, VBox } from "@decky.fx/raven-react";
import { albumAt, hex, trackAt } from "./library";
import { useMusic } from "./music";
import { Cover, Heading, Visualizer } from "./tags";
import { IconButton, LibraryRow } from "./widgets";

const QUEUE_SHOWN = 4;

/** The panel. It stays made while hidden, as in the C example. */
export function NowPlaying(): ReactNode {
	const music = useMusic();
	const { player, album } = music;
	const track = trackAt(player.track);
	const likedTrack = music.liked.has(player.track);
	const listeners = `${1 + (album.index * 37) % 90},${String((album.index * 211) % 1000).padStart(3, "0")} monthly listeners`;
	const bio = `${album.artist} makes ${album.genre} from ${album.index % 2 ? "a small room" : "a big city"}, ${album.year}. `
		+ `Their last album, ${album.title}, came out this year.`;
	const next = player.queue.slice(player.queuePosition + 1, player.queuePosition + 1 + QUEUE_SHOWN);
	return (
		<Border Class="surface" CornerRadius={12} Width={320} Clip Visibility={music.panel ? "Visible" : "Collapsed"}>
			<ScrollBox>
				<VBox Spacing={14} Slot={{ Padding: 16 }}>
					<HBox Spacing={6}>
						<Heading Text={player.context} TextSize={15} Slot={{ Fill: 1, VAlign: "Center" }} />
						<IconButton Glyph="more" OnClicked={music.notInThisDemo} Tip="More options" Size={18} />
						<IconButton Glyph="close" OnClicked={() => music.setPanel(false)} Tip="Hide the panel" Size={18} />
					</HBox>
					<Border CornerRadius={10} Shadow={[30, 0, 10]}>
						<Cover Album={album.index} Size={288} CornerRadius={10} />
					</Border>
					<HBox Spacing={8}>
						<VBox Spacing={3} Slot={{ Fill: 1 }}>
							<Heading Text={track.title} TextSize={22} />
							<Label Text={album.artist} Class="muted" TextSize={15} />
						</VBox>
						<IconButton Glyph="share" OnClicked={music.notInThisDemo} Tip="Share" Size={20} Slot={{ VAlign: "Center" }} />
						<IconButton
							Glyph={likedTrack ? "heart-filled" : "heart"}
							Tint={likedTrack ? hex(music.accent) : undefined}
							OnClicked={music.toggleLikeCurrent}
							Tip="Save to Liked songs (Ctrl+L)"
							Size={22}
							Slot={{ VAlign: "Center" }}
						/>
					</HBox>
					<Visualizer Bars={36} Gap={3} Height={56} />

					{/* the artist, over the colors of the album */}
					<Border
						Effect="aurora"
						EffectColor={hex(album.color, 0.7)}
						EffectColor2={hex(album.color2, 0.3)}
						EffectPointer={false}
						EffectAnimate={music.animate}
						CornerRadius={10}
						Padding={16}
					>
						<VBox Spacing={6}>
							<Label Text="About the artist" Class="eyebrow" Color="white" />
							<Heading Text={album.artist} TextSize={20} Color="white" />
							<Label Text={listeners} Color="white" Opacity={0.8} />
							<Label Text={bio} Wrap Color="white" Opacity={0.85} TextSize={13} />
						</VBox>
					</Border>

					<Border Class="card-flat" CornerRadius={10} Padding={14}>
						<VBox Spacing={6}>
							<HBox>
								<Heading Text="Next in queue" TextSize={15} Slot={{ Fill: 1 }} />
								<Button Style="Flat" Class="link" Text="Open queue" OnClicked={music.notInThisDemo} />
							</HBox>
							<VBox Spacing={0}>
								{next.map((queued, i) => {
									const song = trackAt(queued);
									return (
										<LibraryRow
											key={i}
											Album={song.album}
											Title={song.title}
											Subtitle={albumAt(song.album).artist}
											OnClicked={() => music.jumpInQueue(player.queuePosition + 1 + i)}
										/>
									);
								})}
								{next.length === 0 && <Label key="none" Text="Nothing after this song." Class="muted" Slot={{ Padding: [4, 6] }} />}
							</VBox>
						</VBox>
					</Border>
				</VBox>
			</ScrollBox>
		</Border>
	);
}
