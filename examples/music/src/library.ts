/**
 * The albums, the tracks and the playlists, all made up, and their covers. The port of `library.c`.
 *
 * The names come from a fixed seed: the same library as the C example, song for song.
 * Covers are read from `assets/covers/01.jpg`, `02.jpg`... (or `.png`); an album with no file
 * gets one drawn here. Each cover gives its album two colors, the accent of the interface and
 * of the background while it plays.
 */

import { toArrayBuffer } from "bun:ffi";
import { raven } from "@decky.fx/raven-react";

export const ALBUM_COUNT = 24;
export const MAX_TRACKS = 320;
export const PLAYLIST_COUNT = 6;
/** How many songs a playlist can hold: the Liked songs stop there. */
export const PLAYLIST_CAPACITY = 40;

const COVERS_DIR = `${import.meta.dir}/../assets/covers`;

export type Rgb = readonly [number, number, number];

/** An album. */
export interface Album {
	readonly index: number;
	readonly title: string;
	readonly artist: string;
	readonly genre: string;
	readonly year: number;
	readonly firstTrack: number;
	readonly trackCount: number;
	/** The color it is known by: the accent while it plays. */
	readonly color: Rgb;
	readonly color2: Rgb;
	readonly texture: number;
}

/** A song. Whether it is liked is state of the application: this is only how it starts. */
export interface Track {
	readonly index: number;
	readonly title: string;
	readonly album: number;
	readonly seconds: number;
	readonly likedAtStart: boolean;
}

/** A playlist. The tracks of the Liked songs, the first one, are made when needed. */
export interface Playlist {
	readonly index: number;
	readonly title: string;
	readonly description: string;
	readonly tracks: readonly number[];
	/** The album whose cover it borrows. */
	readonly cover: number;
}

/** Reads a list at a position that must exist. */
function at<T>(list: readonly T[], index: number): T {
	const item = list[index];
	if (item === undefined) {
		throw new RangeError(`music: nothing at ${index} in a list of ${list.length}`);
	}
	return item;
}

/* ---- made-up names ---- */

let seed = 20261101;

/** The next number of the sequence of the C example, on 32 bits. */
function nextRandom(): number {
	seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
	return seed >>> 8;
}

/** A number from 0 to `count - 1`. */
function pick(count: number): number {
	return nextRandom() % count;
}

/** An item of a list. */
function pickOf(list: readonly string[]): string {
	return at(list, pick(list.length));
}

const ADJECTIVES = [
	"Velvet", "Neon", "Paper", "Glass", "Midnight", "Golden", "Silent", "Electric", "Hollow", "Crimson",
	"Northern", "Lucid", "Static", "Wild", "Slow", "Distant", "Burning", "Quiet", "Endless", "Broken",
	"Little", "Blue", "Copper", "Stray", "Silver", "Tender", "Restless", "Faded", "Bright", "Lonely",
] as const;
const NOUNS = [
	"Harbor", "Satellites", "Weather", "Gardens", "Echoes", "Highways", "Motel", "Summer", "Tides", "Signals",
	"Lanterns", "Cathedral", "Rivers", "Daydreams", "Machines", "Orchards", "Avenue", "Fever", "Horizon", "Comets",
	"Heartbeat", "Mirrors", "Wolves", "Arcade", "Paradise", "Skyline", "Strangers", "Waves", "Embers", "Ghosts",
] as const;
const PLACES = [
	"Tokyo", "the Rain", "Lisbon", "the Dark", "July", "Berlin", "the Valley", "Room 9", "the Desert", "Brooklyn",
	"Marseille", "the Morning", "Seoul", "the Deep End", "Nowhere",
] as const;
const VERBS = ["Call", "Hold", "Wake", "Take", "Find", "Leave", "Save", "Show", "Keep", "Tell"] as const;
const ADVERBS = ["Slowly", "Again", "Tonight", "Home", "Closer", "Gently", "Back", "Forever"] as const;
const FIRST_NAMES = ["Mira", "Jonah", "Elio", "Sasha", "Noor", "Theo", "Lena", "Kai", "Ines", "Felix", "Ava", "Remy", "Yuna", "Otis", "Zadie", "Milo"] as const;
const LAST_NAMES = ["Solen", "Hart", "Vale", "Okafor", "Lindqvist", "Moreau", "Kane", "Rivers", "Sato", "Bellamy", "Quinn", "Delacroix", "Ash", "Novak"] as const;
const GENRES = ["Pop", "Hip-Hop", "Rock", "Indie", "R&B", "Electronic", "Soul", "Folk", "Jazz", "Chill"] as const;
const GENRE_COLORS = [0xe8115b, 0xba5d07, 0xe91429, 0x608108, 0x8d67ab, 0x0d73ec, 0xdc148c, 0x477d95, 0x1e3264, 0x27856a] as const;

/*
 * The C example picks the words in the arguments of snprintf, and its compiler (GCC) runs
 * those from right to left: the second word is picked first. The same order here gives
 * the same names.
 */

/** Two words, the second one picked first. */
function twoWords(first: readonly string[], second: readonly string[], write: (a: string, b: string) => string): string {
	const b = pickOf(second);
	const a = pickOf(first);
	return write(a, b);
}

/** The name of an artist. */
function makeArtist(): string {
	switch (pick(4)) {
		case 0: return twoWords(ADJECTIVES, NOUNS, (a, b) => `The ${a} ${b}`);
		case 1: return twoWords(ADJECTIVES, NOUNS, (a, b) => `${a} ${b}`);
		default: return twoWords(FIRST_NAMES, LAST_NAMES, (a, b) => `${a} ${b}`);
	}
}

/** The title of an album. */
function makeAlbumTitle(): string {
	switch (pick(5)) {
		case 0: return pickOf(NOUNS);
		case 1: return twoWords(NOUNS, PLACES, (a, b) => `${a} in ${b}`);
		case 2: return twoWords(ADJECTIVES, NOUNS, (a, b) => `The ${a} ${b}`);
		default: return twoWords(ADJECTIVES, NOUNS, (a, b) => `${a} ${b}`);
	}
}

/** The title of a song. */
function makeTrackTitle(): string {
	switch (pick(7)) {
		case 0: return twoWords(ADJECTIVES, NOUNS, (a, b) => `${a} ${b}`);
		case 1: return twoWords(NOUNS, PLACES, (a, b) => `${a} in ${b}`);
		case 2: return twoWords(VERBS, ADVERBS, (a, b) => `${a} Me ${b}`);
		case 3: return `The ${pickOf(NOUNS)}`;
		case 4: return pickOf(NOUNS);
		case 5: return twoWords(ADJECTIVES, NOUNS, (a, b) => `${a} ${b} (Interlude)`);
		default: return twoWords(PLACES, ADVERBS, (a, b) => `${a}, ${b}`);
	}
}

/* ---- colors ---- */

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** Hue, saturation and value, from 0 to 1. */
function rgbToHsv(r: number, g: number, b: number): Rgb {
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	const s = max > 0 ? d / max : 0;
	if (d <= 0) {
		return [0, s, max];
	}
	if (max === r) {
		return [(((g - b) / d + 6) % 6) / 6, s, max];
	}
	return max === g ? [((b - r) / d + 2) / 6, s, max] : [((r - g) / d + 4) / 6, s, max];
}

/** Back to red, green and blue. */
function hsvToRgb(h: number, s: number, v: number): Rgb {
	const channel = (k: number): number => {
		const x = (k + h * 6) % 6;
		return v - v * s * Math.max(0, Math.min(x, 4 - x, 1));
	};
	return [channel(5), channel(3), channel(1)];
}

/** A color that reads well as an accent on a dark window: vivid enough, light enough. */
function makeAccent(color: Rgb): Rgb {
	const [h, s, v] = rgbToHsv(color[0], color[1], color[2]);
	return hsvToRgb(h, clamp(s, 0.45, 0.85), clamp(v, 0.78, 0.98));
}

/** A color of a genre. */
function genreRgb(genre: number): Rgb {
	const c = at(GENRE_COLORS, genre);
	return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

/** The two most vivid colors of a picture: twelve families of hue, weighted by how vivid each pixel is. */
function coverColors(pixels: Uint8Array, width: number, height: number, genre: number): { color: Rgb; color2: Rgb } {
	const weight = new Float64Array(12);
	const sum = new Float64Array(36);
	const step = Math.max(Math.floor(width / 48), 1);
	for (let y = 0; y < height; y += step) {
		for (let x = 0; x < width; x += step) {
			const offset = (y * width + x) * 4;
			const r = (pixels[offset] ?? 0) / 255;
			const g = (pixels[offset + 1] ?? 0) / 255;
			const b = (pixels[offset + 2] ?? 0) / 255;
			const [h, s, v] = rgbToHsv(r, g, b);
			if (v < 0.18) {
				continue;
			}
			const w = s * s * v;
			const bin = Math.floor(h * 12) % 12;
			weight[bin] = (weight[bin] ?? 0) + w;
			sum[bin * 3] = (sum[bin * 3] ?? 0) + r * w;
			sum[bin * 3 + 1] = (sum[bin * 3 + 1] ?? 0) + g * w;
			sum[bin * 3 + 2] = (sum[bin * 3 + 2] ?? 0) + b * w;
		}
	}
	const weightOf = (bin: number): number => weight[bin] ?? 0;
	let first = 0;
	for (let i = 1; i < 12; i++) {
		if (weightOf(i) > weightOf(first)) {
			first = i;
		}
	}
	let second = -1;
	for (let i = 0; i < 12; i++) {
		const apart = Math.abs(i - first);
		const distance = apart > 6 ? 12 - apart : apart;
		if (distance >= 2 && (second < 0 || weightOf(i) > weightOf(second))) {
			second = i;
		}
	}
	// a picture with almost no color (black and white): the color of its genre
	if (weightOf(first) < 2) {
		const color = makeAccent(genreRgb(genre));
		return { color, color2: [color[0] * 0.35, color[1] * 0.35, color[2] * 0.35] };
	}
	const average = (bin: number): Rgb => [
		(sum[bin * 3] ?? 0) / weightOf(bin),
		(sum[bin * 3 + 1] ?? 0) / weightOf(bin),
		(sum[bin * 3 + 2] ?? 0) / weightOf(bin),
	];
	const color = makeAccent(average(first));
	if (second >= 0 && weightOf(second) > weightOf(first) * 0.12) {
		return { color, color2: makeAccent(average(second)) };
	}
	const [h, s, v] = rgbToHsv(color[0], color[1], color[2]);
	return { color, color2: hsvToRgb((h + 0.12) % 1, s, v * 0.7) };
}

/* ---- the covers drawn here ---- */

const DRAWN = 256;

/** Hermite step between two edges. */
function smooth(edge0: number, edge1: number, x: number): number {
	const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
}

/** Four kinds of abstract covers, in the colors of the album. */
function drawCover(index: number, a: Rgb, b: Rgb): Uint8Array {
	const pixels = new Uint8Array(DRAWN * DRAWN * 4);
	const kind = index % 4;
	let noise = (12345 + Math.imul(index, 977)) >>> 0;
	let offset = 0;
	for (let y = 0; y < DRAWN; y++) {
		for (let x = 0; x < DRAWN; x++) {
			const u = (x + 0.5) / DRAWN;
			const v = (y + 0.5) / DRAWN;
			let mix = 0;
			let light = 1;
			if (kind === 0) {
				// rings around a point
				const d = Math.hypot(u - 0.32, v - 0.68);
				mix = 0.5 + 0.5 * Math.sin(d * 38);
				light = 1.05 - d * 0.6;
			} else if (kind === 1) {
				// a sun over the sea
				const d = Math.hypot(u - 0.5, v - 0.46);
				const sun = 1 - smooth(0.2, 0.205, d);
				const band = v > 0.46 ? ((v * 30) % 1 < 0.5 + (v - 0.46) * 0.9 ? 1 : 0) : 1;
				mix = v;
				light = 0.35 + sun * band * 0.9 + (1 - sun) * 0.25;
			} else if (kind === 2) {
				// stripes across
				mix = smooth(0.45, 0.55, ((u + v) * 7) % 1) * 0.8 + u * 0.2;
				light = 0.6 + 0.5 * (1 - v);
			} else {
				// soft blobs
				const d1 = (u - 0.3) * (u - 0.3) + (v - 0.3) * (v - 0.3);
				const d2 = (u - 0.75) * (u - 0.75) + (v - 0.65) * (v - 0.65);
				mix = Math.exp(-d2 * 9) / (Math.exp(-d1 * 9) + Math.exp(-d2 * 9));
				light = 0.4 + 0.8 * Math.max(Math.exp(-d1 * 7), Math.exp(-d2 * 7));
			}
			noise = (Math.imul(noise, 1103515245) + 12345) >>> 0;
			const grain = (((noise >>> 16) & 255) / 255) * 0.06 - 0.03;
			for (let i = 0; i < 3; i++) {
				const c = (a[i as 0 | 1 | 2] * (1 - mix) + b[i as 0 | 1 | 2] * mix) * light + grain;
				pixels[offset + i] = clamp(c, 0, 1) * 255;
			}
			pixels[offset + 3] = 255;
			offset += 4;
		}
	}
	return pixels;
}

/** What a cover gives an album. */
interface LoadedCover {
	readonly texture: number;
	readonly color: Rgb;
	readonly color2: Rgb;
}

/** A cover from a file, if there is one. */
function loadCoverFile(index: number, genre: number): LoadedCover | null {
	const name = String(index + 1).padStart(2, "0");
	for (const extension of ["jpg", "png", "jpeg"]) {
		const data = raven.Rfile_read(`${COVERS_DIR}/${name}.${extension}`);
		if (!data) {
			continue;
		}
		const [pixels, width, height] = raven.Rimage_decode(data);
		if (pixels) {
			const texture = raven.Rtexture_create_from_pixels(pixels, width, height);
			const colors = coverColors(new Uint8Array(toArrayBuffer(pixels, 0, width * height * 4)), width, height, genre);
			raven.Rpixels_free(pixels);
			raven.Rtexture_set_filter(texture, raven.R_FILTER_MIPMAP);
			return { texture, ...colors };
		}
	}
	return null;
}

/** The cover of an album: its file, else one drawn in the colors of the genre, turned a little. */
function loadCover(index: number, genre: number): LoadedCover {
	const fromFile = loadCoverFile(index, genre);
	if (fromFile) {
		return fromFile;
	}
	const base = genreRgb(genre);
	const [h, s] = rgbToHsv(base[0], base[1], base[2]);
	const other = hsvToRgb((h + 0.08 * (index % 5) + 0.5) % 1, Math.min(s + 0.1, 1), 0.55);
	const texture = raven.Rtexture_create_from_pixels(drawCover(index, base, other), DRAWN, DRAWN);
	raven.Rtexture_set_filter(texture, raven.R_FILTER_MIPMAP);
	return { texture, color: makeAccent(base), color2: makeAccent(other) };
}

/* ---- the library ---- */

const PLAYLIST_TITLES = ["Liked songs", "Late night drive", "Focus flow", "Sunday morning", "Heavy rotation", "Fresh finds"] as const;
const PLAYLIST_DESCRIPTIONS = [
	"The songs you marked with a heart.",
	"Long roads, city lights and the windows down.",
	"Quiet songs to keep your head down.",
	"Slow coffee, open windows, nowhere to be.",
	"What you have been playing the most lately.",
	"New songs picked for you, every Friday.",
] as const;

const allAlbums: Album[] = [];
const allTracks: Track[] = [];
const allPlaylists: Playlist[] = [];

/**
 * Makes up the library and loads the covers. Needs Raven started, for the textures.
 *
 * The expressions with several picks are spelled out in the order GCC evaluates them in the
 * C example, as they decide what comes next in the sequence.
 */
export function initLibrary(): void {
	for (let a = 0; a < ALBUM_COUNT; a++) {
		const genre = pick(GENRES.length);
		const title = makeAlbumTitle();
		const artist = makeArtist();
		const yearA = pick(40);
		const yearB = pick(3);
		const yearC = pick(6);
		const year = 2026 - yearA * (yearB === 0 ? 1 : 0) - yearC;
		const firstTrack = allTracks.length;
		const wanted = 6 + pick(7);
		for (let t = 0; t < wanted && allTracks.length < MAX_TRACKS; t++) {
			const trackTitle = makeTrackTitle();
			const seconds = 128 + pick(200);
			// (how often it was played, which the interface never shows)
			pick(4000);
			pick(900);
			allTracks.push({ index: allTracks.length, title: trackTitle, album: a, seconds, likedAtStart: pick(6) === 0 });
		}
		const cover = loadCover(a, genre);
		allAlbums.push({
			index: a,
			title,
			artist,
			genre: at(GENRES, genre),
			year,
			firstTrack,
			trackCount: allTracks.length - firstTrack,
			...cover,
		});
	}
	for (let p = 0; p < PLAYLIST_COUNT; p++) {
		const tracks: number[] = [];
		// (the Liked songs are made when they are shown)
		if (p > 0) {
			while (tracks.length < 14 + p * 3 && tracks.length < PLAYLIST_CAPACITY) {
				tracks.push(pick(allTracks.length));
			}
		}
		allPlaylists.push({
			index: p,
			title: at(PLAYLIST_TITLES, p),
			description: at(PLAYLIST_DESCRIPTIONS, p),
			tracks,
			cover: p === 0 ? 15 : (p * 7 + 3) % ALBUM_COUNT,
		});
	}
}

/** All the albums. */
export const albums = (): readonly Album[] => allAlbums;
/** All the songs. */
export const tracks = (): readonly Track[] => allTracks;
/** All the playlists. */
export const playlists = (): readonly Playlist[] => allPlaylists;
/** An album by its index. */
export const albumAt = (index: number): Album => at(allAlbums, index);
/** A song by its index. */
export const trackAt = (index: number): Track => at(allTracks, index);
/** A playlist by its index. */
export const playlistAt = (index: number): Playlist => at(allPlaylists, index);

/** The songs of an album, in order. */
export function albumTracks(album: Album): readonly number[] {
	return Array.from({ length: album.trackCount }, (_, t) => album.firstTrack + t);
}

/** The length of an album, in seconds. */
export function albumSeconds(album: Album): number {
	return albumTracks(album).reduce((total, track) => total + trackAt(track).seconds, 0);
}

/** A length as `3:07`. */
export function formatTime(seconds: number): string {
	const whole = Math.max(Math.trunc(seconds), 0);
	return `${Math.trunc(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A color as `#RRGGBB`, multiplied by a scale. */
export function hex(color: Rgb, scale = 1): string {
	const channel = (value: number): string => Math.round(clamp(value * scale, 0, 1) * 255).toString(16).toUpperCase().padStart(2, "0");
	return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

/** The genres Search shows, with their colors. */
export const genres = (): readonly string[] => GENRES;
/** The color of a tile of a genre. */
export const genreColor = (index: number): Rgb => genreRgb(index);
