/**
 * The state of the player, and everything it can do. The port of the logic of `main.c`.
 *
 * The song "plays" by the clock: no sound exists, in this example or in the C one. Its position
 * has a context of its own, as it changes four times a second and only two small parts of the
 * interface show it: the rest does not render for it.
 */

import { createContext, use, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";
import { raven, type WidgetInstance } from "@decky.fx/raven-react";
import { albumAt, albumTracks, playlistAt, PLAYLIST_CAPACITY, tracks as allTracks, trackAt, type Album, type Rgb } from "./library";

export const PAGE_HOME = 0;
export const PAGE_COLLECTION = 1;
export const PAGE_SEARCH = 2;
export const PAGE_LIBRARY = 3;
export const PAGE_SETTINGS = 4;

export type RepeatMode = "off" | "all" | "one";
export type LibraryFilter = "all" | "playlists" | "albums";

/** The looks the player offers: its three themes, then the looks of Raven. */
export const LOOKS: readonly { readonly name: string; readonly theme: string | null; readonly look: raven.RLook }[] = [
	{ name: "Nocturne", theme: "Nocturne", look: raven.R_LOOK_RAVEN_DARK },
	{ name: "Aurora glass", theme: "Aurora glass", look: raven.R_LOOK_RAVEN_GLASS_DARK },
	{ name: "Daylight", theme: "Daylight", look: raven.R_LOOK_RAVEN_LIGHT },
	{ name: "Raven dark", theme: null, look: raven.R_LOOK_RAVEN_DARK },
	{ name: "Raven light", theme: null, look: raven.R_LOOK_RAVEN_LIGHT },
	{ name: "Raven glass dark", theme: null, look: raven.R_LOOK_RAVEN_GLASS_DARK },
	{ name: "Raven glass light", theme: null, look: raven.R_LOOK_RAVEN_GLASS_LIGHT },
	{ name: "High contrast", theme: null, look: raven.R_LOOK_RAVEN_HIGH_CONTRAST_DARK },
	{ name: "Windows 11 dark", theme: null, look: raven.R_LOOK_WINDOWS_DARK },
	{ name: "Windows 11 light", theme: null, look: raven.R_LOOK_WINDOWS_LIGHT },
	{ name: "macOS dark", theme: null, look: raven.R_LOOK_MACOS_DARK },
	{ name: "macOS light", theme: null, look: raven.R_LOOK_MACOS_LIGHT },
	{ name: "macOS 26 glass dark", theme: null, look: raven.R_LOOK_MACOS_GLASS_DARK },
	{ name: "GNOME dark", theme: null, look: raven.R_LOOK_GNOME_DARK },
	{ name: "GNOME light", theme: null, look: raven.R_LOOK_GNOME_LIGHT },
	{ name: "This system", theme: null, look: raven.R_LOOK_NATIVE_DARK },
];

/** The names of the looks, for the two boxes that offer them. */
export const LOOK_NAMES: readonly string[] = LOOKS.map((look) => look.name);

/** Makes a look current. Raven's themes are global: this is not state a prop can say. */
export function applyLook(index: number): void {
	const look = LOOKS[index];
	if (!look) {
		return;
	}
	if (look.theme) {
		raven.Rtheme_use(look.theme);
	} else {
		// a look of Raven, and the classes of the player over it
		raven.Rlook_set(look.look);
		raven.Rtheme_use("Player over the look");
	}
}

/** Whether the theme in use has a dark window. */
export function isDarkTheme(): boolean {
	const [r, g, b] = raven.Rtheme_get_color(raven.R_COLOR_WINDOW);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

/* ---- the player ---- */

/** What the player holds, but its position. */
export interface PlayerState {
	readonly queue: readonly number[];
	readonly queuePosition: number;
	readonly track: number;
	readonly playing: boolean;
	readonly shuffle: boolean;
	readonly repeat: RepeatMode;
	readonly muted: boolean;
	readonly volume: number;
	/** The name of the list it plays from. */
	readonly context: string;
}

/** The player with its position. `player` stays the same object while only the position moves. */
interface Transport {
	readonly player: PlayerState;
	readonly position: number;
}

type TransportAction =
	| { readonly type: "tick"; readonly elapsed: number }
	| { readonly type: "playList"; readonly queue: readonly number[]; readonly start: number; readonly context: string }
	| { readonly type: "jump"; readonly position: number }
	| { readonly type: "toggle" }
	| { readonly type: "next" }
	| { readonly type: "previous" }
	| { readonly type: "seek"; readonly fraction: number }
	| { readonly type: "shuffle" }
	| { readonly type: "repeat" }
	| { readonly type: "volume"; readonly value: number }
	| { readonly type: "mute" };

const NEXT_REPEAT: Readonly<Record<RepeatMode, RepeatMode>> = { off: "all", all: "one", one: "off" };

/** Starts the song at a position of the queue. */
function playPosition(state: Transport, position: number): Transport {
	const { queue } = state.player;
	if (queue.length === 0) {
		return state;
	}
	const queuePosition = position >= 0 && position < queue.length ? position : 0;
	return { position: 0, player: { ...state.player, queuePosition, track: queue[queuePosition] ?? -1, playing: true } };
}

/** Moves the player on by the clock, and goes to the next song at the end of one. */
function tick(state: Transport, elapsed: number): Transport {
	const { player } = state;
	if (!player.playing || player.track < 0) {
		return state;
	}
	const position = state.position + elapsed;
	if (position < trackAt(player.track).seconds) {
		return { ...state, position };
	}
	if (player.repeat === "one") {
		return { ...state, position: 0 };
	}
	if (player.queuePosition + 1 < player.queue.length) {
		return playPosition(state, player.queuePosition + 1);
	}
	if (player.repeat === "all") {
		return playPosition(state, 0);
	}
	return { position: 0, player: { ...player, playing: false } };
}

/** What each action does to the player. */
function transportReducer(state: Transport, action: TransportAction): Transport {
	const { player } = state;
	switch (action.type) {
		case "tick":
			return tick(state, action.elapsed);
		case "playList":
			return playPosition({ ...state, player: { ...player, queue: action.queue, context: action.context } }, action.start);
		case "jump":
			return playPosition(state, action.position);
		case "toggle":
			return { ...state, player: { ...player, playing: !player.playing } };
		case "next":
			return playPosition(state, player.queuePosition + 1 < player.queue.length ? player.queuePosition + 1 : 0);
		case "previous":
			// a few seconds in, back to the start of the song; else the one before
			return state.position > 3 || player.queuePosition === 0 ? { ...state, position: 0 } : playPosition(state, player.queuePosition - 1);
		case "seek":
			return player.track >= 0 ? { ...state, position: action.fraction * trackAt(player.track).seconds } : state;
		case "shuffle":
			return { ...state, player: { ...player, shuffle: !player.shuffle } };
		case "repeat":
			return { ...state, player: { ...player, repeat: NEXT_REPEAT[player.repeat] } };
		case "volume":
			return { ...state, player: { ...player, volume: action.value, muted: action.value <= 0.001 } };
		case "mute": {
			const muted = !player.muted;
			return { ...state, player: { ...player, muted, volume: !muted && player.volume <= 0.001 ? 0.5 : player.volume } };
		}
	}
}

/** A queue in random order, with the song at `start` first. */
function shuffledQueue(list: readonly number[], start: number): readonly number[] {
	const queue = [...list];
	const swap = (a: number, b: number): void => {
		const held = queue[a] ?? 0;
		queue[a] = queue[b] ?? 0;
		queue[b] = held;
	};
	swap(0, start);
	for (let i = queue.length - 1; i > 1; i--) {
		swap(i, 1 + Math.floor(Math.random() * i));
	}
	return queue;
}

/** Whether two lists hold the same songs in the same order. */
function sameList(a: readonly number[], b: readonly number[]): boolean {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

/* ---- what is shown ---- */

/** An album or a playlist, on the page that shows them all. `opened` counts each time it is opened. */
export interface Collection {
	readonly kind: "album" | "playlist";
	readonly index: number;
	readonly opened: number;
}

/** The page, and the way back. */
interface Navigation {
	readonly page: number;
	readonly history: readonly number[];
}

const MAX_HISTORY = 32;

/** Goes to a page, and remembers where it was. */
function goTo(navigation: Navigation, page: number): Navigation {
	if (page === navigation.page) {
		return navigation;
	}
	// (the oldest page goes when it is full: Back always goes to the page before)
	const history = [...navigation.history, navigation.page].slice(-MAX_HISTORY);
	return { page, history };
}

/** The Liked songs are a playlist made when it is needed. */
function likedPlaylist(liked: ReadonlySet<number>): readonly number[] {
	return allTracks().filter((track) => liked.has(track.index)).slice(0, PLAYLIST_CAPACITY).map((track) => track.index);
}

/** How the application starts, from what the C example also reads in its environment. */
export interface StartOptions {
	readonly look: number;
	/** The name of a page: `album`, `playlist`, `search`, `genres`, `library`, `settings`. */
	readonly page: string | undefined;
	readonly paused: boolean;
}

/** All the interface reads, and all it can ask, but the position of the song. */
export interface Music {
	readonly player: PlayerState;
	readonly liked: ReadonlySet<number>;
	/** How many songs the Liked songs playlist holds. */
	readonly likedCount: number;
	readonly likedAlbums: ReadonlySet<number>;
	readonly page: number;
	readonly collection: Collection;
	/** The songs of the collection shown. */
	readonly collectionTracks: readonly number[];
	/** Whether the player plays the collection shown. */
	readonly playingCollection: boolean;
	readonly libraryFilter: LibraryFilter;
	readonly query: string;
	readonly look: number;
	readonly dark: boolean;
	readonly followCover: boolean;
	readonly animate: boolean;
	readonly effect: number;
	readonly panel: boolean;
	/** The accent in use. */
	readonly accent: Rgb;
	/** The accent picked in the settings, used when it does not follow the cover. */
	readonly picked: Rgb;
	/** The album of the song playing. */
	readonly album: Album;
	/** What the folded island says. */
	readonly islandTitle: string;
	/** The text box of Search, set by the header. */
	readonly searchInput: RefObject<WidgetInstance | null>;

	readonly showPage: (page: number) => void;
	readonly back: () => void;
	readonly showSearch: () => void;
	readonly showLibrary: () => void;
	readonly openAlbum: (index: number) => void;
	readonly openPlaylist: (index: number) => void;
	readonly setLibraryFilter: (filter: LibraryFilter) => void;
	readonly search: (query: string) => void;
	readonly openGenre: (name: string) => void;

	readonly toggle: () => void;
	readonly next: () => void;
	readonly previous: () => void;
	readonly seek: (fraction: number) => void;
	readonly toggleShuffle: () => void;
	readonly cycleRepeat: () => void;
	readonly toggleLikeCurrent: () => void;
	readonly toggleLike: (track: number) => void;
	readonly setVolume: (value: number) => void;
	readonly toggleMute: () => void;
	/** Plays a track from the list it is in. `position` is its row in the page's list, when it was clicked there. */
	readonly playTrack: (track: number, position?: number) => void;
	readonly jumpInQueue: (position: number) => void;
	readonly playCollection: () => void;
	readonly shuffleCollection: () => void;
	readonly likeCollection: () => void;

	readonly chooseLook: (index: number) => void;
	readonly setFollowCover: (follow: boolean) => void;
	readonly pickAccent: (color: Rgb) => void;
	readonly setEffect: (index: number) => void;
	readonly setAnimate: (animate: boolean) => void;
	readonly setPanel: (shown: boolean) => void;
	readonly togglePanel: () => void;
	/** A short word in the folded island, for a moment. */
	readonly notice: (text: string) => void;
	/** What this demonstration does not do. */
	readonly notInThisDemo: () => void;
}

const MusicContext = createContext<Music | null>(null);
const PositionContext = createContext(0);
const PlayingContext = createContext(false);

/** The state of the player and what it can do. */
export function useMusic(): Music {
	const music = use(MusicContext);
	if (!music) {
		throw new Error("music: useMusic outside of MusicProvider");
	}
	return music;
}

/** The position of the song, in seconds. A component that reads it renders four times a second. */
export const usePosition = (): number => use(PositionContext);

/** Whether a song plays. It changes less often than the rest, and the visualizers read only it. */
export const usePlaying = (): boolean => use(PlayingContext);

/** Holds the state of the player. The children only render for what they read. */
export function MusicProvider({ start, children }: { readonly start: StartOptions; readonly children: ReactNode }): ReactNode {
	// something is already playing when the player opens: the third song of the fourth album, in its 47th second
	const [transport, dispatch] = useReducer(transportReducer, null, (): Transport => {
		const album = albumAt(3);
		const queue = albumTracks(album);
		return {
			position: 47,
			player: {
				queue,
				queuePosition: 2,
				track: queue[2] ?? -1,
				playing: !start.paused,
				shuffle: false,
				repeat: "off",
				muted: false,
				volume: 0.7,
				context: album.title,
			},
		};
	});
	const { player, position } = transport;

	const [liked, setLiked] = useState<ReadonlySet<number>>(() => new Set(allTracks().filter((track) => track.likedAtStart).map((track) => track.index)));
	const [likedAlbums, setLikedAlbums] = useState<ReadonlySet<number>>(() => new Set([2, 5]));
	const [navigation, setNavigation] = useState<Navigation>(() => {
		const pages: Readonly<Record<string, number>> = {
			album: PAGE_COLLECTION,
			playlist: PAGE_COLLECTION,
			search: PAGE_SEARCH,
			genres: PAGE_SEARCH,
			library: PAGE_LIBRARY,
			settings: PAGE_SETTINGS,
		};
		return goTo({ page: PAGE_HOME, history: [] }, pages[start.page ?? ""] ?? PAGE_HOME);
	});
	const [collection, setCollection] = useState<Collection>(() => {
		if (start.page === "album") {
			return { kind: "album", index: 7, opened: 1 };
		}
		return start.page === "playlist" ? { kind: "playlist", index: 1, opened: 1 } : { kind: "album", index: 3, opened: 0 };
	});
	const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
	const [query, setQuery] = useState(start.page === "search" ? "the" : "");
	const [theme, setTheme] = useState(() => ({ look: start.look, dark: isDarkTheme() }));
	const [followCover, setFollowCover] = useState(true);
	const [picked, setPicked] = useState<Rgb>([0.72, 0.61, 1]);
	const [animate, setAnimate] = useState(true);
	const [effect, setEffect] = useState(0);
	const [panel, setPanel] = useState(true);
	const [noticeText, setNoticeText] = useState<string | null>(null);

	const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const searchInput = useRef<WidgetInstance>(null);

	const album = albumAt(player.track >= 0 ? trackAt(player.track).album : 0);

	// the clock of the player
	useEffect(() => {
		let last = raven.Rget_time();
		const ticker = setInterval(() => {
			const now = raven.Rget_time();
			dispatch({ type: "tick", elapsed: now - last });
			last = now;
		}, 250);
		return () => clearInterval(ticker);
	}, []);

	useEffect(
		() => () => {
			if (noticeTimer.current) {
				clearTimeout(noticeTimer.current);
			}
		},
		[],
	);

	// the accent: the color of the cover (on a light window, a darker shade of it), or the one picked
	const accent = useMemo((): Rgb => {
		if (!followCover) {
			return picked;
		}
		const [r, g, b] = album.color;
		return theme.dark ? album.color : [r * 0.62, g * 0.62, b * 0.62];
	}, [followCover, picked, album, theme.dark]);

	// (a theme brings its own accent: it must be given again after one is chosen)
	useLayoutEffect(() => {
		raven.Rtheme_set_accent(accent[0], accent[1], accent[2]);
	}, [accent, theme.look]);

	const music = useMemo((): Music => {
		const showPage = (page: number): void => setNavigation((current) => goTo(current, page));

		const notice = (text: string): void => {
			setNoticeText(text);
			if (noticeTimer.current) {
				clearTimeout(noticeTimer.current);
			}
			noticeTimer.current = setTimeout(() => setNoticeText(null), 2500);
		};

		const collectionTracks = collection.kind === "album"
			? albumTracks(albumAt(collection.index))
			: collection.index === 0 ? likedPlaylist(liked) : playlistAt(collection.index).tracks;
		const collectionName = collection.kind === "album" ? albumAt(collection.index).title : playlistAt(collection.index).title;
		const samePlaying = player.queue.length > 0 && sameList(player.queue, collectionTracks);

		/** Plays a list from one of its songs; with shuffle, the others in random order after it. */
		const playList = (list: readonly number[], first: number, context: string, shuffle = player.shuffle): void => {
			if (list.length > 0) {
				dispatch(shuffle
					? { type: "playList", queue: shuffledQueue(list, first), start: 0, context }
					: { type: "playList", queue: list, start: first, context });
			}
		};

		const toggleLike = (track: number): void => {
			const next = new Set(liked);
			if (next.has(track)) {
				next.delete(track);
			} else {
				next.add(track);
			}
			setLiked(next);
			notice(next.has(track) ? "Added to Liked songs" : "Removed from Liked songs");
		};

		return {
			player,
			liked,
			likedCount: Math.min(liked.size, PLAYLIST_CAPACITY),
			likedAlbums,
			page: navigation.page,
			collection,
			collectionTracks,
			playingCollection: player.playing && samePlaying,
			libraryFilter,
			query,
			look: theme.look,
			dark: theme.dark,
			followCover,
			animate,
			effect,
			panel,
			accent,
			picked,
			album,
			islandTitle: noticeText ?? (player.track >= 0 ? trackAt(player.track).title : "Raven Music"),
			searchInput,

			showPage,
			back: () => setNavigation(({ page, history }) => {
				const previous = history.at(-1);
				return previous === undefined ? { page, history } : { page: previous, history: history.slice(0, -1) };
			}),
			showSearch: () => {
				showPage(PAGE_SEARCH);
				searchInput.current?.focus();
			},
			showLibrary: () => showPage(PAGE_LIBRARY),
			openAlbum: (index) => {
				setCollection((current) => ({ kind: "album", index, opened: current.opened + 1 }));
				showPage(PAGE_COLLECTION);
			},
			openPlaylist: (index) => {
				setCollection((current) => ({ kind: "playlist", index, opened: current.opened + 1 }));
				showPage(PAGE_COLLECTION);
			},
			setLibraryFilter,
			search: (text) => {
				setQuery(text);
				showPage(PAGE_SEARCH);
			},
			openGenre: setQuery,

			toggle: () => dispatch({ type: "toggle" }),
			next: () => dispatch({ type: "next" }),
			previous: () => dispatch({ type: "previous" }),
			seek: (fraction) => dispatch({ type: "seek", fraction }),
			toggleShuffle: () => {
				dispatch({ type: "shuffle" });
				notice(player.shuffle ? "Shuffle off" : "Shuffle on");
			},
			cycleRepeat: () => {
				dispatch({ type: "repeat" });
				const next = NEXT_REPEAT[player.repeat];
				notice(next === "off" ? "Repeat off" : next === "all" ? "Repeat all" : "Repeat this song");
			},
			toggleLikeCurrent: () => {
				if (player.track >= 0) {
					toggleLike(player.track);
				}
			},
			toggleLike,
			setVolume: (value) => dispatch({ type: "volume", value }),
			toggleMute: () => dispatch({ type: "mute" }),
			playTrack: (track, position) => {
				// the list it is in plays from it: the page (from the row clicked, as a playlist can hold a song twice), else its album
				const atRow = position !== undefined && collectionTracks[position] === track ? position : collectionTracks.lastIndexOf(track);
				const inPage = navigation.page === PAGE_COLLECTION ? atRow : -1;
				if (inPage >= 0) {
					playList(collectionTracks, inPage, collectionName);
				} else {
					const itsAlbum = albumAt(trackAt(track).album);
					playList(albumTracks(itsAlbum), track - itsAlbum.firstTrack, itsAlbum.title);
				}
			},
			jumpInQueue: (position) => dispatch({ type: "jump", position }),
			playCollection: () => {
				if (samePlaying && !player.shuffle) {
					dispatch({ type: "toggle" });
				} else {
					playList(collectionTracks, 0, collectionName);
				}
			},
			shuffleCollection: () => playList(collectionTracks, Math.floor(Math.random() * collectionTracks.length), collectionName, true),
			likeCollection: () => {
				if (collection.kind !== "album") {
					notice("It is your playlist already");
					return;
				}
				const next = new Set(likedAlbums);
				if (next.has(collection.index)) {
					next.delete(collection.index);
				} else {
					next.add(collection.index);
				}
				setLikedAlbums(next);
				notice(next.has(collection.index) ? "Saved to your library" : "Removed from your library");
			},

			chooseLook: (index) => {
				applyLook(index);
				setTheme({ look: index, dark: isDarkTheme() });
			},
			setFollowCover,
			pickAccent: (color) => {
				setPicked(color);
				setFollowCover(false);
			},
			setEffect,
			setAnimate,
			setPanel,
			togglePanel: () => setPanel(!panel),
			notice,
			notInThisDemo: () => notice("Not in this demo"),
		};
	}, [player, liked, likedAlbums, navigation, collection, libraryFilter, query, theme, followCover, animate, effect, panel, accent, picked, album, noticeText]);

	return (
		<MusicContext value={music}>
			<PlayingContext value={player.playing}>
				<PositionContext value={position}>{children}</PositionContext>
			</PlayingContext>
		</MusicContext>
	);
}
