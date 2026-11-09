/** Everything in your library, as cards. */

import type { ReactNode } from "react";
import { Label, ScrollBox, VBox, WrapBox } from "@decky.fx/raven-tsx/react";
import { albums, playlists } from "./library";
import { useMusic } from "./music";
import { Heading } from "./tags";
import { AlbumCard, AlbumOrArtistCard, SectionHeader } from "./widgets";

/** The page of the library. */
export function LibraryPage(): ReactNode {
	const music = useMusic();
	const { likedCount } = music;
	return (
		<ScrollBox>
			<VBox Spacing={14} Slot={{ Padding: [24, 20, 24, 32] }}>
				<Heading Text="Your library" TextSize={30} />
				<Label Text={`${playlists().length} playlists, ${albums().length} albums (${music.likedAlbums.size} saved), ${likedCount} liked songs.`} Class="muted" />
				<SectionHeader Title="Playlists" />
				<WrapBox Spacing={4}>
					{playlists().map((playlist) => (
						<AlbumCard
							key={playlist.index}
							Album={playlist.cover}
							Title={playlist.title}
							Subtitle={`${playlist.index === 0 ? likedCount : playlist.tracks.length} songs`}
							OnClicked={() => music.openPlaylist(playlist.index)}
						/>
					))}
				</WrapBox>
				<SectionHeader Title="Albums" />
				<WrapBox Spacing={4}>
					{albums().map((album) => <AlbumOrArtistCard key={album.index} Album={album.index} />)}
				</WrapBox>
			</VBox>
		</ScrollBox>
	);
}
