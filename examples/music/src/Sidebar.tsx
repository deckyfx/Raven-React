/** The side bar: the places of the player above, "Your library" below. */

import type { ReactNode } from "react";
import { Border, HBox, ScrollBox, VBox } from "@decky.fx/raven-react";
import { albums, playlists } from "./library";
import { PAGE_HOME, PAGE_LIBRARY, PAGE_SEARCH, PAGE_SETTINGS, useMusic } from "./music";
import { Chip, IconButton, LibraryRow, NavItem } from "./widgets";

/** The left column. */
export function Sidebar(): ReactNode {
	const music = useMusic();
	const { page, libraryFilter: filter } = music;
	return (
		<VBox Spacing={8} Width={300}>
			<Border Class="surface" CornerRadius={12} Padding={[10, 8]}>
				<VBox Spacing={2}>
					<NavItem Glyph="home" Text="Home" Active={page === PAGE_HOME} OnClicked={() => music.showPage(PAGE_HOME)} />
					<NavItem Glyph="search" Text="Search" Active={page === PAGE_SEARCH} OnClicked={music.showSearch} />
					<NavItem Glyph="settings" Text="Settings" Active={page === PAGE_SETTINGS} OnClicked={() => music.showPage(PAGE_SETTINGS)} />
				</VBox>
			</Border>
			<Border Class="surface" CornerRadius={12} Padding={[10, 10, 6, 10]} Slot={{ Fill: 1 }}>
				<VBox Spacing={10}>
					<HBox Spacing={6}>
						<NavItem Glyph="library" Text="Your library" Active={page === PAGE_LIBRARY} OnClicked={music.showLibrary} Slot={{ Fill: 1 }} />
						<IconButton Glyph="plus" OnClicked={music.notInThisDemo} Tip="Create a playlist" Size={18} Slot={{ VAlign: "Center" }} />
					</HBox>
					<HBox Spacing={8} Slot={{ Padding: [6, 0] }}>
						<Chip Text="All" Active={filter === "all"} OnClicked={() => music.setLibraryFilter("all")} />
						<Chip Text="Playlists" Active={filter === "playlists"} OnClicked={() => music.setLibraryFilter("playlists")} />
						<Chip Text="Albums" Active={filter === "albums"} OnClicked={() => music.setLibraryFilter("albums")} />
					</HBox>
					<ScrollBox Slot={{ Fill: 1 }}>
						<VBox Spacing={2} Slot={{ Padding: [0, 0, 6, 0] }}>
							{filter !== "albums" && playlists().map((playlist) => (
								<LibraryRow
									key={`playlist-${playlist.index}`}
									Album={playlist.cover}
									Title={playlist.title}
									Subtitle={`Playlist · ${playlist.index === 0 ? music.likedCount : playlist.tracks.length} songs`}
									OnClicked={() => music.openPlaylist(playlist.index)}
								/>
							))}
							{filter !== "playlists" && albums().map((album) => (
								<LibraryRow
									key={`album-${album.index}`}
									Album={album.index}
									Title={album.title}
									Subtitle={`Album · ${album.artist}`}
									OnClicked={() => music.openAlbum(album.index)}
								/>
							))}
						</VBox>
					</ScrollBox>
				</VBox>
			</Border>
		</VBox>
	);
}
