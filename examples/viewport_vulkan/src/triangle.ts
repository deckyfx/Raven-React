/**
 * The scene of the original, in TypeScript: a rotating triangle with a color per corner.
 * This is what its vertex and fragment shaders compute, run on the CPU. No Vulkan here.
 */

/** A corner of the triangle: its position, and its color. */
export interface Corner {
	readonly x: number;
	readonly y: number;
	readonly red: number;
	readonly green: number;
	readonly blue: number;
}

/** The corners in the clip space of Vulkan, where y goes down. */
const CORNERS: readonly [Corner, Corner, Corner] = [
	{ x: 0, y: -0.7, red: 1, green: 0.35, blue: 0.2 },
	{ x: 0.65, y: 0.5, red: 0.25, green: 0.85, blue: 0.4 },
	{ x: -0.65, y: 0.5, red: 0.25, green: 0.5, blue: 1 },
];

/** The color behind the triangle in the left pane: the clear color of the original, 0.05, 0.06, 0.10. */
const CLEAR_RGBA = 0xff1a0f0d;

/** Places the corners of the triangle in a target of a size, as the vertex shader does. */
export function placeCorners(width: number, height: number, angle: number): readonly [Corner, Corner, Corner] {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const aspect = Math.max(width / height, 0.001);
	const place = (corner: Corner): Corner => ({
		...corner,
		x: (((corner.x * cos - corner.y * sin) / aspect + 1) / 2) * width,
		y: ((corner.x * sin + corner.y * cos + 1) / 2) * height,
	});
	return [place(CORNERS[0]), place(CORNERS[1]), place(CORNERS[2])];
}

/** RGBA pixels in memory of JavaScript, into which the scene is rendered on the CPU. */
export class SoftwareTarget {
	/** The pixels: RGBA8, tightly packed, top row first. What `Rtexture_update` takes. */
	bytes = new Uint8Array(0);
	/** The same memory by pixel. Little-endian, as every platform of Raven: 0xAABBGGRR. */
	private words = new Uint32Array(0);
	width = 0;
	height = 0;

	/** Changes the size, which loses the pixels. */
	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		this.words = new Uint32Array(width * height);
		this.bytes = new Uint8Array(this.words.buffer);
	}

	/** Clears the target and fills the triangle, testing each pixel of its bounds at its center. */
	render(angle: number): void {
		const { width, height, words } = this;
		words.fill(CLEAR_RGBA);
		const [a, b, c] = placeCorners(width, height, angle);
		const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
		if (area === 0) {
			return;
		}
		const left = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
		const right = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
		const top = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
		const bottom = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
		for (let y = top; y <= bottom; y++) {
			const py = y + 0.5;
			const row = y * width;
			for (let x = left; x <= right; x++) {
				const px = x + 0.5;
				// how much of each corner this pixel has: all three are positive inside the triangle
				const wa = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) / area;
				const wb = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) / area;
				const wc = 1 - wa - wb;
				if (wa >= 0 && wb >= 0 && wc >= 0) {
					const red = (wa * a.red + wb * b.red + wc * c.red) * 255;
					const green = (wa * a.green + wb * b.green + wc * c.green) * 255;
					const blue = (wa * a.blue + wb * b.blue + wc * c.blue) * 255;
					words[row + x] = 0xff000000 | (blue << 16) | (green << 8) | red;
				}
			}
		}
	}
}
