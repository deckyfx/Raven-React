/** Home: the tiles, then rows of cards. */

import { useMemo, type ReactNode } from "react";
import { Grid, HBox, ScrollBox, VBox } from "@decky.fx/raven-tsx/react";
import { albumAt, albums, ALBUM_COUNT, playlistAt, playlists } from "./library";
import { useMusic } from "./music";
import { Heading } from "./tags";
import { AlbumCard, AlbumOrArtistCard, Chip, QuickCard, SectionHeader } from "./widgets";

/** A word for the time of day. */
function greeting(hour: number): string {
	return hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** A row of cards that scrolls across. */
function CardRow({ children }: { readonly children: ReactNode }): ReactNode {
	return (
		<ScrollBox Orientation="Horizontal" Height={286}>
			<HBox Spacing={4}>{children}</HBox>
		</ScrollBox>
	);
}

/** Ten numbers from a formula that lists albums. */
const tenAlbums = (formula: (i: number) => number): readonly number[] => Array.from({ length: 10 }, (_, i) => formula(i) % ALBUM_COUNT);

/** The page Home. */
export function Home(): ReactNode {
	const music = useMusic();
	const showLibrary = music.showLibrary;
	const onlyMusic = (): void => music.notice("Only music here");
	const newest = useMemo(() => [...albums()].sort((a, b) => b.year - a.year).slice(0, 10), []);
	const hello = useMemo(() => greeting(new Date().getHours()), []);
	return (
		<ScrollBox>
			<VBox Spacing={14} Slot={{ Padding: [24, 20, 24, 32] }}>
				<HBox Spacing={8}>
					<Chip Text="All" Active OnClicked={onlyMusic} />
					<Chip Text="Music" OnClicked={onlyMusic} />
					<Chip Text="Podcasts" OnClicked={onlyMusic} />
					<Chip Text="Audiobooks" OnClicked={onlyMusic} />
				</HBox>
				<Heading Text={hello} TextSize={30} Appear="FlyUp" Slot={{ Padding: [0, 8, 0, 0] }} />

				{/* six tiles: the liked songs, a playlist and albums */}
				<Grid Columns="1,1,1" Spacing={10} Appear="Fade" AppearDelay={0.05}>
					{[0, 2].map((p, i) => (
						<QuickCard
							key={p}
							Album={playlistAt(p).cover}
							Title={playlistAt(p).title}
							OnClicked={() => music.openPlaylist(p)}
							IsPlayingAlbum={false}
							Column={i}
							Row={0}
						/>
					))}
					{[2, 3, 4, 5].map((i) => {
						const a = (i * 5 + 3) % ALBUM_COUNT;
						return (
							<QuickCard
								key={`album-${a}`}
								Album={a}
								Title={albumAt(a).title}
								OnClicked={() => music.openAlbum(a)}
								IsPlayingAlbum={music.album.index === a}
								Column={i % 3}
								Row={Math.trunc(i / 3)}
							/>
						);
					})}
				</Grid>

				<SectionHeader Title="Made for you" OnClicked={showLibrary} />
				<CardRow>
					{playlists().slice(1).map((playlist) => (
						<AlbumCard
							key={playlist.index}
							Album={playlist.cover}
							Title={playlist.title}
							Subtitle={playlist.description}
							OnClicked={() => music.openPlaylist(playlist.index)}
							Appear="Fade"
						/>
					))}
				</CardRow>

				<SectionHeader Title="Recently played" OnClicked={showLibrary} />
				<CardRow>
					{tenAlbums((i) => i * 7 + 2).map((album, i) => <AlbumOrArtistCard key={i} Album={album} Appear="Fade" />)}
				</CardRow>

				<SectionHeader Title="Your favorite artists" />
				<CardRow>
					{tenAlbums((i) => i * 3 + 1).map((album, i) => <AlbumOrArtistCard key={i} Album={album} Round Appear="Fade" />)}
				</CardRow>

				<SectionHeader Title="New releases" OnClicked={showLibrary} />
				<CardRow>
					{newest.map((album) => <AlbumOrArtistCard key={album.index} Album={album.index} Appear="Fade" />)}
				</CardRow>
			</VBox>
		</ScrollBox>
	);
}

