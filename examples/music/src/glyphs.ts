/**
 * The pictures of the player: signed distances, drawn once into one texture. The port of the
 * first half of `tags.c`. An `<Icon>` shows a region of this texture.
 */

import { raven } from "@decky.fx/raven-tsx/react";

const CELL = 96;
const COLUMNS = 8;
const ROWS = 4;
/** The width of a line. */
const W = 0.075;

const GLYPHS = [
	"play", "pause", "next", "previous", "shuffle", "repeat", "repeat-one", "heart",
	"heart-filled", "home", "search", "library", "volume", "muted", "queue", "settings",
	"plus", "clock", "more", "back", "forward", "note", "microphone", "check",
	"panel", "user", "sparkle", "close", "moon", "radio", "download", "share",
] as const;

/** The name of a picture. */
export type Glyph = (typeof GLYPHS)[number];

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const line = (d: number): number => d - W * 0.5;
const ring = (d: number): number => Math.abs(d) - W * 0.5;

/** Distance to a segment. */
function seg(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
	const ex = bx - ax;
	const ey = by - ay;
	const wx = x - ax;
	const wy = y - ay;
	const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
	return Math.hypot(wx - ex * t, wy - ey * t);
}

/** Signed distance to a polygon of any shape, given as x, y, x, y... */
function poly(x: number, y: number, v: readonly number[]): number {
	const n = v.length / 2;
	const point = (i: number, axis: 0 | 1): number => v[i * 2 + axis] ?? 0;
	const dx0 = x - point(0, 0);
	const dy0 = y - point(0, 1);
	let d = dx0 * dx0 + dy0 * dy0;
	let s = 1;
	for (let i = 0, j = n - 1; i < n; j = i, i++) {
		const ex = point(j, 0) - point(i, 0);
		const ey = point(j, 1) - point(i, 1);
		const wx = x - point(i, 0);
		const wy = y - point(i, 1);
		const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
		const c1 = y >= point(i, 1);
		const c2 = y < point(j, 1);
		const c3 = ex * wy > ey * wx;
		const px = wx - ex * t;
		const py = wy - ey * t;
		d = Math.min(d, px * px + py * py);
		if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) {
			s = -s;
		}
	}
	return s * Math.sqrt(d);
}

/** Signed distance to a triangle. */
function tri(x: number, y: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
	return poly(x, y, [ax, ay, bx, by, cx, cy]);
}

/** Signed distance to a rounded box. */
function box(x: number, y: number, cx: number, cy: number, hx: number, hy: number, r: number): number {
	const dx = Math.abs(x - cx) - hx + r;
	const dy = Math.abs(y - cy) - hy + r;
	return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

/** Signed distance to a circle. */
function circle(x: number, y: number, cx: number, cy: number, r: number): number {
	return Math.hypot(x - cx, y - cy) - r;
}

/** The heart of Inigo Quilez: tip at the bottom. */
function heart(x: number, y: number): number {
	const s = 0.6;
	const qx = Math.abs(x - 0.5) / s;
	const qy = (0.8 - y) / s;
	if (qy + qx > 1) {
		return (Math.hypot(qx - 0.25, qy - 0.75) - 0.35355) * s;
	}
	const m = 0.5 * Math.max(qx + qy, 0);
	const a = qx * qx + (qy - 1) * (qy - 1);
	const b = (qx - m) * (qx - m) + (qy - m) * (qy - m);
	return Math.sqrt(Math.min(a, b)) * (qx - qy > 0 ? 1 : -1) * s;
}

/** The body of a loudspeaker. */
function speaker(x: number, y: number): number {
	return poly(x, y, [0.14, 0.38, 0.3, 0.38, 0.5, 0.2, 0.5, 0.8, 0.3, 0.62, 0.14, 0.62]) - 0.01;
}

/** The loop of the repeat buttons. */
function repeatShape(x: number, y: number): number {
	// a gap in the top line, for the arrow
	const loop = Math.max(ring(box(x, y, 0.5, 0.5, 0.32, 0.2, 0.14)), -box(x, y, 0.66, 0.3, 0.07, 0.1, 0));
	return Math.min(loop, tri(x, y, 0.58, 0.17, 0.58, 0.43, 0.75, 0.3));
}

/** The eight points of the sparkle. */
const SPARKLE = Array.from({ length: 8 }, (_, i) => {
	const a = i * 0.785398 - 1.570796;
	const r = i % 2 ? 0.1 : 0.36;
	return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r];
}).flat();

/** The signed distance to a picture, from a point of its cell, from 0 to 1. */
function glyph(index: number, x: number, y: number): number {
	switch (index) {
		case 0: // play
			return tri(x, y, 0.32, 0.22, 0.32, 0.78, 0.8, 0.5) - 0.035;
		case 1: // pause
			return Math.min(box(x, y, 0.36, 0.5, 0.075, 0.28, 0.035), box(x, y, 0.64, 0.5, 0.075, 0.28, 0.035));
		case 2: // next
			return Math.min(tri(x, y, 0.22, 0.25, 0.22, 0.75, 0.62, 0.5) - 0.03, box(x, y, 0.72, 0.5, 0.05, 0.26, 0.03));
		case 3: // previous
			return glyph(2, 1 - x, y);
		case 4: { // shuffle
			const a = Math.min(seg(x, y, 0.14, 0.32, 0.34, 0.32), seg(x, y, 0.34, 0.32, 0.6, 0.68), seg(x, y, 0.6, 0.68, 0.78, 0.68));
			const b = Math.min(seg(x, y, 0.14, 0.68, 0.34, 0.68), seg(x, y, 0.34, 0.68, 0.6, 0.32), seg(x, y, 0.6, 0.32, 0.78, 0.32));
			const arrows = Math.min(tri(x, y, 0.74, 0.19, 0.74, 0.45, 0.9, 0.32), tri(x, y, 0.74, 0.55, 0.74, 0.81, 0.9, 0.68));
			return Math.min(line(Math.min(a, b)), arrows);
		}
		case 5: // repeat
			return repeatShape(x, y);
		case 6: // repeat one
			return Math.min(repeatShape(x, y), line(Math.min(seg(x, y, 0.5, 0.42, 0.5, 0.6), seg(x, y, 0.44, 0.46, 0.5, 0.42))) + 0.01);
		case 7: // heart
			return ring(heart(x, y));
		case 8: // heart, filled
			return heart(x, y);
		case 9: // home
			return Math.min(ring(poly(x, y, [0.18, 0.46, 0.5, 0.18, 0.82, 0.46, 0.82, 0.82, 0.18, 0.82])), box(x, y, 0.5, 0.71, 0.07, 0.11, 0.02));
		case 10: // search
			return Math.min(ring(circle(x, y, 0.44, 0.44, 0.24)), seg(x, y, 0.62, 0.62, 0.82, 0.82) - W * 0.6);
		case 11: // library
			return line(Math.min(seg(x, y, 0.22, 0.2, 0.22, 0.8), seg(x, y, 0.42, 0.2, 0.42, 0.8), seg(x, y, 0.6, 0.22, 0.8, 0.78)));
		case 12: { // volume
			const r = Math.hypot(x - 0.5, y - 0.5);
			const arcs = Math.min(ring(r - 0.17), ring(r - 0.32));
			return Math.min(speaker(x, y), Math.max(arcs, 0.6 - x));
		}
		case 13: // muted
			return Math.min(speaker(x, y), line(Math.min(seg(x, y, 0.64, 0.38, 0.86, 0.62), seg(x, y, 0.64, 0.62, 0.86, 0.38))));
		case 14: // queue
			return Math.min(
				line(Math.min(seg(x, y, 0.16, 0.28, 0.84, 0.28), seg(x, y, 0.16, 0.5, 0.84, 0.5), seg(x, y, 0.16, 0.72, 0.5, 0.72))),
				tri(x, y, 0.62, 0.6, 0.62, 0.84, 0.84, 0.72),
			);
		case 15: { // settings
			const r = Math.hypot(x - 0.5, y - 0.5);
			const a = Math.atan2(y - 0.5, x - 0.5);
			const outer = 0.3 + 0.08 * clamp((Math.cos(a * 8) - 0.1) * 3, 0, 1);
			return Math.max(r - outer, 0.12 - r);
		}
		case 16: // plus
			return line(Math.min(seg(x, y, 0.5, 0.2, 0.5, 0.8), seg(x, y, 0.2, 0.5, 0.8, 0.5)));
		case 17: // clock
			return Math.min(ring(circle(x, y, 0.5, 0.5, 0.32)), line(Math.min(seg(x, y, 0.5, 0.5, 0.5, 0.3), seg(x, y, 0.5, 0.5, 0.64, 0.58))));
		case 18: // more
			return Math.min(circle(x, y, 0.24, 0.5, 0.065), circle(x, y, 0.5, 0.5, 0.065), circle(x, y, 0.76, 0.5, 0.065));
		case 19: // back
			return Math.min(seg(x, y, 0.6, 0.22, 0.36, 0.5), seg(x, y, 0.36, 0.5, 0.6, 0.78)) - W * 0.6;
		case 20: // forward
			return glyph(19, 1 - x, y);
		case 21: // note
			return Math.min(circle(x, y, 0.36, 0.72, 0.12), line(Math.min(seg(x, y, 0.47, 0.72, 0.47, 0.18), seg(x, y, 0.47, 0.18, 0.72, 0.3))));
		case 22: { // microphone
			const body = ring(seg(x, y, 0.5, 0.26, 0.5, 0.44) - 0.12);
			const arc = Math.max(ring(circle(x, y, 0.5, 0.42, 0.24)), 0.44 - y);
			return Math.min(body, arc, line(Math.min(seg(x, y, 0.5, 0.66, 0.5, 0.82), seg(x, y, 0.36, 0.84, 0.64, 0.84))));
		}
		case 23: // check
			return line(Math.min(seg(x, y, 0.22, 0.52, 0.42, 0.72), seg(x, y, 0.42, 0.72, 0.8, 0.3)));
		case 24: // panel
			return Math.min(ring(box(x, y, 0.5, 0.5, 0.34, 0.28, 0.08)), line(seg(x, y, 0.62, 0.22, 0.62, 0.78)));
		case 25: // user
			return Math.min(ring(circle(x, y, 0.5, 0.36, 0.14)), Math.max(ring(circle(x, y, 0.5, 0.92, 0.32)), y - 0.84));
		case 26: // sparkle
			return poly(x, y, SPARKLE) - 0.01;
		case 27: // close
			return line(Math.min(seg(x, y, 0.26, 0.26, 0.74, 0.74), seg(x, y, 0.26, 0.74, 0.74, 0.26)));
		case 28: // moon
			return Math.max(circle(x, y, 0.5, 0.5, 0.32), -circle(x, y, 0.66, 0.38, 0.26));
		case 29: // radio (waves)
			return Math.min(
				circle(x, y, 0.5, 0.5, 0.07),
				Math.max(ring(circle(x, y, 0.5, 0.5, 0.2)), 0.08 - Math.abs(x - 0.5)),
				Math.max(ring(circle(x, y, 0.5, 0.5, 0.34)), 0.14 - Math.abs(x - 0.5)),
			);
		case 30: // download
			return Math.min(line(Math.min(seg(x, y, 0.5, 0.18, 0.5, 0.6), seg(x, y, 0.22, 0.82, 0.78, 0.82))), tri(x, y, 0.32, 0.5, 0.68, 0.5, 0.5, 0.7));
		default: // share
			return Math.min(
				line(Math.min(seg(x, y, 0.5, 0.24, 0.5, 0.6), seg(x, y, 0.24, 0.52, 0.24, 0.8), seg(x, y, 0.24, 0.8, 0.76, 0.8), seg(x, y, 0.76, 0.8, 0.76, 0.52))),
				tri(x, y, 0.33, 0.36, 0.67, 0.36, 0.5, 0.15),
			);
	}
}

let atlas: number = raven.R_INVALID_ID;

/** Draws all the pictures into one texture. Needs Raven started. */
export function drawAtlas(): void {
	const width = CELL * COLUMNS;
	const height = CELL * ROWS;
	const pixels = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = Math.trunc(y / CELL) * COLUMNS + Math.trunc(x / CELL);
			const coverage = clamp(0.5 - glyph(index, ((x % CELL) + 0.5) / CELL, ((y % CELL) + 0.5) / CELL) * CELL, 0, 1);
			const offset = (y * width + x) * 4;
			pixels[offset] = 255;
			pixels[offset + 1] = 255;
			pixels[offset + 2] = 255;
			pixels[offset + 3] = coverage * 255 + 0.5;
		}
	}
	atlas = raven.Rtexture_create_from_pixels(pixels, width, height);
	raven.Rtexture_set_filter(atlas, raven.R_FILTER_MIPMAP);
}

/** The texture of the pictures. */
export const atlasTexture = (): number => atlas;

/** Where a picture is in the texture, for `Region`. */
export function glyphRegion(name: Glyph): readonly number[] {
	const i = GLYPHS.indexOf(name);
	const u = (i % COLUMNS) / COLUMNS;
	const v = Math.trunc(i / COLUMNS) / ROWS;
	return [u, v, u + 1 / COLUMNS, v + 1 / ROWS];
}
