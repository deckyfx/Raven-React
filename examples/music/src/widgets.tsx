/** The tags the C example declares in `ui/widgets.xml`, as components. */

import { useLayoutEffect, useRef, type ComponentProps, type ReactNode, type RefObject } from "react";
import { Border, Button, Grid, HBox, Label, Overlay, raven, VBox, type WidgetInstance } from "@decky.fx/raven-react";
import type { Glyph } from "./glyphs";
import { albumAt, formatTime, hex, trackAt, type Rgb } from "./library";
import { useMusic } from "./music";
import { Cover, Heading, Icon, Visualizer } from "./tags";

type SlotProp = ComponentProps<typeof Button>["Slot"];
type AppearProp = ComponentProps<typeof Button>["Appear"];

/**
 * Gives a widget and what is in it a color of text, or takes it back. A prop could not do this:
 * Raven has no way to give an attribute its default back, and removing one remakes the widget.
 */
export function useTextColor(widget: RefObject<WidgetInstance | null>, color: Rgb | null): void {
	useLayoutEffect(() => {
		if (!widget.current) {
			return;
		}
		if (color) {
			raven.Rwidget_set_color(widget.current.widget, raven.R_COLOR_TEXT, color[0], color[1], color[2], 1);
		} else {
			raven.Rwidget_clear_color(widget.current.widget, raven.R_COLOR_TEXT);
		}
	}, [widget, color]);
}

/** The props of `IconButton`. */
export interface IconButtonProps {
	readonly Glyph: Glyph;
	readonly Tip: string;
	readonly OnClicked: () => void;
	readonly Size?: number;
	readonly Slot?: SlotProp;
	/** A heart that is on wears the accent: the color of the picture alone. */
	readonly Tint?: string;
	/** A button that is on, as shuffle: the color of what it holds. */
	readonly Color?: Rgb | null;
}

/** A round button with a picture: the transport buttons, the heart... */
export function IconButton({ Glyph, Tip, OnClicked, Size = 20, Slot, Tint, Color = null }: IconButtonProps): ReactNode {
	const button = useRef<WidgetInstance>(null);
	useTextColor(button, Color);
	return (
		<Button ref={button} Style="Flat" Class="icon" OnClicked={OnClicked} Tooltip={Tip} Cursor="Hand" AccessibleName={Tip} Slot={Slot}>
			<Icon Glyph={Glyph} Size={Size} Tint={Tint} />
		</Button>
	);
}

/** The props of `PlayButton`. */
export interface PlayButtonProps {
	readonly Playing: boolean;
	readonly OnClicked: () => void;
	readonly Size?: number;
	readonly IconSize?: number;
	/** White whatever the accent, as in the bar of the player. */
	readonly White?: boolean;
}

/** The big round button: play, pause. */
export function PlayButton({ Playing, OnClicked, Size = 48, IconSize = 22, White = false }: PlayButtonProps): ReactNode {
	return (
		<Button
			Style="Primary"
			Class={White ? "round white" : "round"}
			Width={Size}
			Height={Size}
			OnClicked={OnClicked}
			Tooltip="Play / pause (Space)"
			Cursor="Hand"
			AccessibleName="Play"
		>
			<Icon Glyph={Playing ? "pause" : "play"} Size={IconSize} Slot={{ HAlign: "Center", VAlign: "Center" }} />
		</Button>
	);
}

/** The props of `NavItem`. */
export interface NavItemProps {
	readonly Glyph: Glyph;
	readonly Text: string;
	readonly Active: boolean;
	readonly OnClicked: () => void;
	readonly Slot?: SlotProp;
}

/** An entry of the side bar. */
export function NavItem({ Glyph, Text, Active, OnClicked, Slot }: NavItemProps): ReactNode {
	return (
		<Button Style="Flat" Class={Active ? "nav active" : "nav"} OnClicked={OnClicked} Cursor="Hand" AccessibleName={Text} Slot={Slot}>
			<HBox Spacing={16} Slot={{ Padding: [6, 4] }}>
				<Icon Glyph={Glyph} Size={24} Slot={{ VAlign: "Center" }} />
				<Heading Text={Text} TextSize={15} Slot={{ VAlign: "Center" }} />
			</HBox>
		</Button>
	);
}

/** The props of `Chip`. */
export interface ChipProps {
	readonly Text: string;
	readonly OnClicked: () => void;
	readonly Active?: boolean;
}

/** A small filter, rounded. */
export function Chip({ Text, OnClicked, Active = false }: ChipProps): ReactNode {
	return <Button Class={Active ? "chip on" : "chip"} Text={Text} OnClicked={OnClicked} Cursor="Hand" />;
}

/** The props of `SectionHeader`. */
export interface SectionHeaderProps {
	readonly Title: string;
	readonly Link?: string;
	/** What its link does. With nothing, it has no link. */
	readonly OnClicked?: () => void;
}

/** The title of a row of cards, and its link. */
export function SectionHeader({ Title, Link = "Show all", OnClicked }: SectionHeaderProps): ReactNode {
	return (
		<HBox Spacing={8} Slot={{ Padding: [0, 10, 0, 2] }}>
			<Heading Text={Title} TextSize={22} Slot={{ Fill: 1, VAlign: "Bottom" }} />
			{OnClicked && <Button Style="Flat" Class="link" Text={Link} OnClicked={OnClicked} Cursor="Hand" Slot={{ VAlign: "Bottom" }} />}
		</HBox>
	);
}

/** The props of `AlbumCard`. */
export interface AlbumCardProps {
	readonly Album: number;
	readonly Title: string;
	readonly Subtitle: string;
	readonly OnClicked: () => void;
	readonly Round?: boolean;
	readonly Appear?: AppearProp;
}

/** An album or a playlist as a card. */
export function AlbumCard({ Album, Title, Subtitle, OnClicked, Round = false, Appear }: AlbumCardProps): ReactNode {
	return (
		<Button Style="Flat" Class="card" OnClicked={OnClicked} Width={188} Clip Cursor="Hand" AccessibleName={Title} Appear={Appear}>
			<VBox Spacing={6} Slot={{ Padding: 10 }}>
				<Cover Album={Album} Size={168} CornerRadius={Round ? 84 : 8} />
				<Heading Text={Title} TextSize={14} Slot={{ Padding: [2, 6, 0, 0] }} />
				<Label Text={Subtitle} Class="muted" TextSize={13} Wrap Slot={{ Padding: [2, 0] }} />
			</VBox>
		</Button>
	);
}

/** The card of an album or of its artist (round), with what it says. */
export function AlbumOrArtistCard({ Album, Round = false, Appear }: { readonly Album: number; readonly Round?: boolean; readonly Appear?: AppearProp }): ReactNode {
	const music = useMusic();
	const album = albumAt(Album);
	return (
		<AlbumCard
			Album={Album}
			Title={Round ? album.artist : album.title}
			Subtitle={Round ? "Artist" : `${album.year} · ${album.artist}`}
			OnClicked={() => music.openAlbum(Album)}
			Round={Round}
			Appear={Appear}
		/>
	);
}

/** The props of `QuickCard`. */
export interface QuickCardProps {
	readonly Album: number;
	readonly Title: string;
	readonly OnClicked: () => void;
	/** Whether its bars can show: on the tile of an album, when that album plays. */
	readonly IsPlayingAlbum: boolean;
	readonly Column: number;
	readonly Row: number;
}

/** The tiles at the top of Home: a cover and a name. */
export function QuickCard({ Album, Title, OnClicked, IsPlayingAlbum, Column, Row }: QuickCardProps): ReactNode {
	return (
		<Button Style="Default" Class="quick" OnClicked={OnClicked} Height={60} Clip Cursor="Hand" AccessibleName={Title} Slot={{ Column, Row }}>
			<HBox Spacing={12}>
				<Cover Album={Album} Size={60} CornerRadius={6} />
				<Heading Text={Title} TextSize={14} Slot={{ Fill: 1, VAlign: "Center" }} />
				<Visualizer Bars={4} Width={16} Height={14} Visibility={IsPlayingAlbum ? "Visible" : "Collapsed"} Slot={{ VAlign: "Center", Padding: [0, 0, 12, 0] }} />
			</HBox>
		</Button>
	);
}

/** The props of `TrackRow`. */
export interface TrackRowProps {
	readonly Track: number;
	readonly Number: number;
	readonly ShowCover: boolean;
	readonly ShowAlbum: boolean;
}

/** One song in a list: number, cover, title and artist, album, heart, length. The song playing is written in the accent. */
export function TrackRow({ Track, Number, ShowCover, ShowAlbum }: TrackRowProps): ReactNode {
	const music = useMusic();
	const track = trackAt(Track);
	const album = albumAt(track.album);
	const liked = music.liked.has(Track);
	const row = useRef<WidgetInstance>(null);
	useTextColor(row, music.player.track === Track ? music.accent : null);
	return (
		<Button
			ref={row}
			Style="Flat"
			Class="row"
			OnClicked={() => music.playTrack(Track)}
			Height={56}
			Clip
			AccessibleName={`${track.title}, ${album.artist}`}
		>
			<Grid Columns={ShowAlbum ? "0,4,3,0,0" : "0,1,0,0,0"} Spacing={14} Slot={{ Padding: [6, 0] }}>
				<Label Text={Number} Class="muted" Width={26} TextAlign="Right" Slot={{ Column: 0, VAlign: "Center" }} />
				<HBox Spacing={12} Width={1} Slot={{ Column: 1, VAlign: "Center" }}>
					{ShowCover && <Cover Album={track.album} Size={40} CornerRadius={4} />}
					<VBox Spacing={2} Slot={{ VAlign: "Center" }}>
						<Label Text={track.title} TextSize={15} />
						<Label Text={album.artist} Class="muted" TextSize={13} />
					</VBox>
				</HBox>
				<Label Text={ShowAlbum ? album.title : ""} Class="muted" TextSize={13} Width={1} Slot={{ Column: 2, VAlign: "Center" }} />
				<Button
					Style="Flat"
					Class="icon"
					OnClicked={() => music.toggleLike(Track)}
					Tooltip={liked ? "Remove from Liked songs" : "Save to Liked songs"}
					Slot={{ Column: 3, VAlign: "Center" }}
				>
					<Icon Glyph={liked ? "heart-filled" : "heart"} Size={16} Opacity={liked ? 1 : 0.55} Tint={liked ? hex(music.accent) : undefined} />
				</Button>
				<Label Text={formatTime(track.seconds)} Class="muted" TextSize={13} Width={44} TextAlign="Right" Slot={{ Column: 4, VAlign: "Center" }} />
			</Grid>
		</Button>
	);
}

/** The props of `LibraryRow`. */
export interface LibraryRowProps {
	readonly Album: number;
	readonly Title: string;
	readonly Subtitle: string;
	readonly OnClicked: () => void;
}

/** An entry of "Your library" in the side bar. */
export function LibraryRow({ Album, Title, Subtitle, OnClicked }: LibraryRowProps): ReactNode {
	return (
		<Button Style="Flat" Class="row" OnClicked={OnClicked} Clip Cursor="Hand" AccessibleName={Title}>
			<HBox Spacing={12} Slot={{ Padding: 4 }}>
				<Cover Album={Album} Size={46} CornerRadius={5} />
				<VBox Spacing={3} Slot={{ VAlign: "Center" }}>
					<Label Text={Title} TextSize={14} />
					<Label Text={Subtitle} Class="muted" TextSize={12} />
				</VBox>
			</HBox>
		</Button>
	);
}

/** The props of `GenreTile`. */
export interface GenreTileProps {
	readonly Title: string;
	readonly Color: string;
	readonly Album: number;
	readonly OnClicked: () => void;
}

/** A genre in Search: a colored tile, a cover in its corner. */
export function GenreTile({ Title, Color, Album, OnClicked }: GenreTileProps): ReactNode {
	return (
		<Button Style="Flat" Class="tile" OnClicked={OnClicked} Cursor="Hand" AccessibleName={Title}>
			<Border Background={Color} CornerRadius={10} Width={184} Height={112} Clip>
				<Overlay>
					<Heading Text={Title} TextSize={22} Color="white" Slot={{ Padding: [16, 14], HAlign: "Left", VAlign: "Top" }} />
					<Cover Album={Album} Size={80} CornerRadius={6} Slot={{ HAlign: "Right", VAlign: "Bottom", Padding: [0, 0, -10, -8] }} />
				</Overlay>
			</Border>
		</Button>
	);
}

/** The props of `SettingRow`. */
export interface SettingRowProps {
	readonly Title: string;
	readonly Description: string;
	readonly children: ReactNode;
}

/** A setting: its name and what it does on the left, the control on the right. */
export function SettingRow({ Title, Description, children }: SettingRowProps): ReactNode {
	return (
		<HBox Spacing={16} Slot={{ Padding: [0, 6] }}>
			<VBox Spacing={3} Slot={{ Fill: 1, VAlign: "Center" }}>
				<Label Text={Title} TextSize={15} />
				<Label Text={Description} Class="muted" TextSize={13} Wrap />
			</VBox>
			<HBox Slot={{ VAlign: "Center" }}>{children}</HBox>
		</HBox>
	);
}
