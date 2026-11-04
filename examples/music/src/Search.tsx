/** Search: while nothing is typed, the genres; then what matches. */

import { useMemo, type ReactNode } from "react";
import { Button, HBox, Label, ScrollBox, Switcher, VBox, WrapBox } from "@decky.fx/raven-react";
import { albumAt, albums, ALBUM_COUNT, genreColor, genres, hex, tracks } from "./library";
import { useMusic } from "./music";
import { Cover, Heading } from "./tags";
import { AlbumOrArtistCard, GenreTile, SectionHeader, TrackRow } from "./widgets";

/** Whether a text holds a part, whatever the case. */
function contains(text: string, part: string): boolean {
	return text.toLowerCase().includes(part.toLowerCase());
}

/** What a query finds. */
interface Results {
	readonly albums: readonly number[];
	readonly songs: readonly number[];
	/** The first album found, else the album of the first song; -1 for nothing. */
	readonly top: number;
}

/** Finds up to ten albums and five songs. */
function runSearch(query: string): Results {
	const found = albums().filter((album) => contains(album.title, query) || contains(album.artist, query) || contains(album.genre, query));
	const songs = tracks().filter((track) => contains(track.title, query) || contains(albumAt(track.album).artist, query)).slice(0, 5);
	return {
		albums: found.slice(0, 10).map((album) => album.index),
		songs: songs.map((track) => track.index),
		top: found[0]?.index ?? songs[0]?.album ?? -1,
	};
}

/** The album a genre shows in its tile: its first one, else any. */
function genreCover(name: string, index: number): number {
	return albums().find((album) => album.genre === name)?.index ?? index % ALBUM_COUNT;
}

/** The page Search. */
export function Search(): ReactNode {
	const music = useMusic();
	const { query } = music;
	const results = useMemo(() => runSearch(query), [query]);
	const { top } = results;
	const topAlbum = albumAt(top >= 0 ? top : 0);
	return (
		<ScrollBox>
			<Switcher Index={query ? 1 : 0} Slot={{ Padding: [24, 20, 24, 32] }}>
				<VBox Spacing={14}>
					<Heading Text="Browse all" TextSize={26} />
					<WrapBox Spacing={16}>
						{genres().map((name, i) => (
							<GenreTile key={name} Title={name} Color={hex(genreColor(i))} Album={genreCover(name, i)} OnClicked={() => music.openGenre(name)} />
						))}
					</WrapBox>
				</VBox>
				<VBox Spacing={14}>
					<HBox Spacing={24}>
						<VBox Spacing={12} Width={300}>
							<Heading Text="Top result" TextSize={22} />
							<Button
								Style="Default"
								Class="card top"
								OnClicked={() => music.openAlbum(top)}
								Cursor="Hand"
								Visibility={top >= 0 ? "Visible" : "Hidden"}
							>
								<VBox Spacing={14} Slot={{ Padding: 20 }}>
									<Cover Album={topAlbum.index} Size={96} CornerRadius={8} Slot={{ HAlign: "Left" }} />
									<Heading Text={topAlbum.title} TextSize={26} Wrap />
									<HBox Spacing={8}>
										<Label Class="muted" Text="Album" />
										<Label Text="·" Class="muted" />
										<Label Text={topAlbum.artist} />
									</HBox>
								</VBox>
							</Button>
						</VBox>
						<VBox Spacing={6} Slot={{ Fill: 1 }}>
							<Heading Text="Songs" TextSize={22} Slot={{ Padding: [0, 0, 0, 6] }} />
							<VBox>
								{results.songs.map((track, i) => <TrackRow key={track} Track={track} Number={i + 1} ShowCover={false} ShowAlbum={false} />)}
							</VBox>
						</VBox>
					</HBox>
					<SectionHeader Title="Albums" />
					<ScrollBox Orientation="Horizontal" Height={286}>
						<HBox Spacing={4}>
							{results.albums.map((album) => <AlbumOrArtistCard key={album} Album={album} Appear="Fade" />)}
						</HBox>
					</ScrollBox>
					<Label
						Text={`Nothing matches "${query.slice(0, 60)}". Try another word: a genre, a city, a color...`}
						Class="muted"
						TextSize={16}
						Visibility={top < 0 ? "Visible" : "Collapsed"}
					/>
				</VBox>
			</Switcher>
		</ScrollBox>
	);
}
