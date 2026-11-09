/** An album or a playlist: the same page shows them all. */

import { useEffect, useRef, type ReactNode } from "react";
import { Border, Grid, HBox, Label, raven, ScrollBox, Separator, Spacer, VBox, type WidgetInstance } from "@decky.fx/raven-tsx/react";
import { albumAt, albumSeconds, hex, playlistAt, trackAt } from "./library";
import { useMusic } from "./music";
import { Cover, Heading, Icon } from "./tags";
import { IconButton, PlayButton, TrackRow } from "./widgets";

/** What the head of the page says. */
interface CollectionHead {
	readonly cover: number;
	readonly kind: string;
	readonly title: string;
	readonly description: string;
	readonly artist: string;
	readonly meta: string;
	readonly column: string;
	readonly footer: string;
}

/** The page of the album or playlist opened last. */
export function Collection(): ReactNode {
	const music = useMusic();
	const { collection, collectionTracks } = music;
	const isAlbum = collection.kind === "album";
	const page = useRef<WidgetInstance>(null);

	// each time one is opened, from its top
	useEffect(() => {
		if (page.current) {
			raven.Rscroll_box_set_offset(page.current.widget, 0, 0);
		}
	}, [collection.opened]);

	const head = ((): CollectionHead => {
		if (isAlbum) {
			const album = albumAt(collection.index);
			const seconds = albumSeconds(album);
			return {
				cover: album.index,
				kind: "ALBUM",
				title: album.title,
				description: "",
				artist: album.artist,
				meta: `·  ${album.year}  ·  ${album.trackCount} songs, ${Math.trunc(seconds / 60)} min ${seconds % 60} s`,
				column: "",
				footer: `${album.year}. ${album.genre}. Released by Raven Records under a license that does not exist.`,
			};
		}
		const playlist = playlistAt(collection.index);
		const seconds = collectionTracks.reduce((total, track) => total + trackAt(track).seconds, 0);
		const minutes = String(Math.trunc(seconds / 60) % 60).padStart(2, "0");
		return {
			cover: playlist.cover,
			kind: "PLAYLIST",
			title: playlist.title,
			description: playlist.description,
			artist: "Raven Music",
			meta: `·  ${collectionTracks.length} songs, about ${Math.trunc(seconds / 3600)} h ${minutes} min`,
			column: "Album",
			footer: "",
		};
	})();

	const cover = albumAt(head.cover);
	const saved = isAlbum && music.likedAlbums.has(collection.index);
	// a long title in smaller letters
	const titleSize = head.title.length <= 12 ? 60 : head.title.length <= 18 ? 46 : 38;

	return (
		<ScrollBox ref={page}>
			<VBox>
				{/* the top of the page, in dark shades of the colors of the cover: its texts are white, whatever the theme */}
				<Border
					Effect="aurora"
					EffectColor={hex(cover.color, 0.55)}
					EffectColor2={hex(cover.color2, 0.22)}
					EffectPointer={false}
					EffectAnimate={music.animate}
					Padding={[28, 40, 28, 26]}
				>
					<HBox Spacing={26}>
						<Border CornerRadius={8} Shadow={[40, 0, 14]} Slot={{ VAlign: "Bottom" }}>
							<Cover Album={head.cover} Size={232} CornerRadius={8} Appear="Zoom" />
						</Border>
						<VBox Spacing={8} Slot={{ Fill: 1, VAlign: "Bottom" }}>
							<Label Text={head.kind} Class="eyebrow" />
							<Heading Text={head.title} TextSize={titleSize} Wrap Color="white" Appear="FlyUp" />
							<Label Text={head.description} Wrap Opacity={0.8} Color="white" Visibility={head.description ? "Visible" : "Collapsed"} />
							<HBox Spacing={8}>
								<Cover Album={head.cover} Size={24} CornerRadius={12} Slot={{ VAlign: "Center" }} />
								<Heading Text={head.artist} TextSize={14} Color="white" Slot={{ VAlign: "Center" }} />
								<Label Text={head.meta} Opacity={0.75} Color="white" Slot={{ VAlign: "Center" }} />
							</HBox>
						</VBox>
					</HBox>
				</Border>

				<VBox Spacing={6} Slot={{ Padding: [24, 20, 24, 32] }}>
					<HBox Spacing={14}>
						<PlayButton Playing={music.playingCollection} OnClicked={music.playCollection} Size={56} IconSize={24} />
						<IconButton Glyph="shuffle" OnClicked={music.shuffleCollection} Tip="Play in random order" Size={26} Slot={{ VAlign: "Center" }} />
						<IconButton
							Glyph={saved ? "heart-filled" : "heart"}
							Tint={saved ? hex(music.accent) : undefined}
							OnClicked={music.likeCollection}
							Tip="Save to your library"
							Size={26}
							Slot={{ VAlign: "Center" }}
						/>
						<IconButton Glyph="download" OnClicked={music.notInThisDemo} Tip="Download" Size={24} Slot={{ VAlign: "Center" }} />
						<IconButton Glyph="more" OnClicked={music.notInThisDemo} Tip="More options" Size={24} Slot={{ VAlign: "Center" }} />
						<Spacer Slot={{ Fill: 1 }} />
						<Label Text="List" Class="muted" Slot={{ VAlign: "Center" }} />
						<Icon Glyph="queue" Size={18} Opacity={0.7} Slot={{ VAlign: "Center" }} />
					</HBox>
					{/* the heads of the columns, as the rows are laid out */}
					<Grid Columns="0,4,3,0,0" Spacing={14} Slot={{ Padding: [12, 10, 12, 0] }}>
						<Label Text="#" Class="muted" Width={26} TextAlign="Right" Slot={{ Column: 0 }} />
						<Label Text="Title" Class="muted" Width={1} Slot={{ Column: 1 }} />
						<Label Text={head.column} Class="muted" Width={1} Slot={{ Column: 2 }} />
						<Spacer Width={32} Slot={{ Column: 3 }} />
						<HBox Width={44} Slot={{ Column: 4 }}>
							<Spacer Slot={{ Fill: 1 }} />
							<Icon Glyph="clock" Size={16} Opacity={0.7} />
						</HBox>
					</Grid>
					<Separator Slot={{ Padding: [0, 4, 0, 6] }} />
					<VBox Spacing={0}>
						{collectionTracks.map((track, i) => (
							<TrackRow key={`${collection.kind}-${collection.index}-${i}`} Track={track} Number={i + 1} Position={i} ShowCover={!isAlbum} ShowAlbum={!isAlbum} />
						))}
						{collectionTracks.length === 0 && (
							<VBox key="empty" Spacing={8} Slot={{ Padding: [12, 24] }}>
								<Heading Text="Songs you like will appear here" TextSize={20} />
								<Label Class="muted" Text="Save songs by tapping the heart icon." />
							</VBox>
						)}
					</VBox>
					<Label Text={head.footer} Class="muted" TextSize={12} Wrap Slot={{ Padding: [12, 18, 12, 0] }} />
				</VBox>
			</VBox>
		</ScrollBox>
	);
}
