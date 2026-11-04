/**
 * The software renderer: fills an RGBA image, one band of rows at a time. All it reads and writes
 * is in shared memory, so that the main thread and the workers run this same code on one frame.
 */

import { MAX_OBJECTS, PALETTE, type SceneObject } from "./scene";

/** Rows in a band: the unit of work that threads share. */
const BAND_ROWS = 8;
/** What the next row is while no frame is being rendered: past any height. */
const NO_WORK = 0x7fff0000;
/** Numbers per object in the shared scene: x, y, radius, speed, phase, color, visible. */
const OBJECT_FIELDS = 7;
/** Reserved, not used, memory for pixels: the frame grows into it as the viewport does (8K). */
const MAX_PIXEL_BYTES = 7680 * 4320 * 4;

/** Where each number is in the shared control block. */
const enum Control {
	Generation,
	NextRow,
	RowsDone,
	Width,
	Height,
	ObjectCount,
	Selected,
	Stop,
	Size,
}

/** The memory of a frame, given to each worker. */
export interface FrameBuffers {
	readonly control: SharedArrayBuffer;
	readonly scene: SharedArrayBuffer;
	readonly pixels: SharedArrayBuffer;
}

/** Makes the memory of a frame. */
export function makeFrameBuffers(): FrameBuffers {
	return {
		control: new SharedArrayBuffer(Control.Size * Int32Array.BYTES_PER_ELEMENT),
		scene: new SharedArrayBuffer((1 + MAX_OBJECTS * OBJECT_FIELDS) * Float64Array.BYTES_PER_ELEMENT),
		pixels: new SharedArrayBuffer(4, { maxByteLength: MAX_PIXEL_BYTES }),
	};
}

/** One view of a frame in shared memory, one per thread. */
export class SharedFrame {
	private readonly control: Int32Array<SharedArrayBuffer>;
	private readonly scene: Float64Array<SharedArrayBuffer>;
	/** The vertical center of each disc at this time: the same for all the pixels of a frame. */
	private readonly centers = new Float64Array(MAX_OBJECTS);
	/** The discs that cross the current row, and how far each is from it. */
	private readonly crossing = new Int32Array(MAX_OBJECTS);
	private readonly rowDistance = new Float64Array(MAX_OBJECTS);
	/** The pixels of the frame, tightly packed. */
	readonly pixels: Uint8Array<SharedArrayBuffer>;

	constructor(private readonly buffers: FrameBuffers) {
		this.control = new Int32Array(buffers.control);
		this.scene = new Float64Array(buffers.scene);
		this.pixels = new Uint8Array(buffers.pixels);
	}

	/** Runs in a worker: takes part in each frame, until told to stop. */
	serve(): void {
		let seen = 0;
		while (Atomics.load(this.control, Control.Stop) === 0) {
			const generation = Atomics.load(this.control, Control.Generation);
			if (generation === seen) {
				Atomics.wait(this.control, Control.Generation, seen);
			} else {
				seen = generation;
				this.takeBands();
			}
		}
	}

	/** Tells the workers to end. */
	stop(): void {
		Atomics.store(this.control, Control.Stop, 1);
		Atomics.notify(this.control, Control.Generation);
	}

	/** Renders a frame on this thread alone, or with the workers when `shared`. */
	render(objects: readonly SceneObject[], selected: number, time: number, width: number, height: number, shared: boolean): void {
		this.prepare(objects, selected, time, width, height);
		if (!shared) {
			this.renderRows(0, height);
			return;
		}
		// (a worker that is late finds no work until everything above is written)
		Atomics.store(this.control, Control.RowsDone, 0);
		Atomics.store(this.control, Control.NextRow, 0);
		Atomics.add(this.control, Control.Generation, 1);
		Atomics.notify(this.control, Control.Generation);
		this.takeBands();
		for (let done = Atomics.load(this.control, Control.RowsDone); done < height; done = Atomics.load(this.control, Control.RowsDone)) {
			Atomics.wait(this.control, Control.RowsDone, done);
		}
		Atomics.store(this.control, Control.NextRow, NO_WORK);
	}

	/** Writes what a frame needs in shared memory. */
	private prepare(objects: readonly SceneObject[], selected: number, time: number, width: number, height: number): void {
		const bytes = width * height * 4;
		if (bytes > this.buffers.pixels.byteLength) {
			this.buffers.pixels.grow(Math.min(bytes, MAX_PIXEL_BYTES));
		}
		this.control[Control.Width] = width;
		this.control[Control.Height] = height;
		this.control[Control.ObjectCount] = objects.length;
		this.control[Control.Selected] = selected;
		this.scene[0] = time;
		objects.forEach((object, index) => {
			this.scene.set([object.x, object.y, object.radius, object.speed, object.phase, object.color, object.visible ? 1 : 0], 1 + index * OBJECT_FIELDS);
		});
	}

	/** Renders bands until the frame has none left, as `Rparallel_for` does on the job system. */
	private takeBands(): void {
		for (;;) {
			const begin = Atomics.add(this.control, Control.NextRow, BAND_ROWS);
			const height = this.control[Control.Height] ?? 0;
			if (begin >= height) {
				return;
			}
			const end = Math.min(begin + BAND_ROWS, height);
			this.renderRows(begin, end);
			Atomics.add(this.control, Control.RowsDone, end - begin);
			Atomics.notify(this.control, Control.RowsDone);
		}
	}

	/** One number of an object in the shared scene. */
	private field(object: number, field: number): number {
		return this.scene[1 + object * OBJECT_FIELDS + field] ?? 0;
	}

	/**
	 * Renders rows: a gradient with a grid, then a shaded disc with a soft edge per object, the
	 * selected one with a ring. Discs that do not cross a row are left out before its pixels.
	 */
	private renderRows(begin: number, end: number): void {
		const { pixels, centers, crossing, rowDistance } = this;
		const width = this.control[Control.Width] ?? 0;
		const height = this.control[Control.Height] ?? 0;
		const count = this.control[Control.ObjectCount] ?? 0;
		const selected = this.control[Control.Selected] ?? -1;
		const time = this.scene[0] ?? 0;
		const aspect = width / height;
		for (let i = 0; i < count; i++) {
			centers[i] = this.field(i, 1) + 0.06 * Math.sin(time * this.field(i, 3) + this.field(i, 4));
		}
		for (let row = begin; row < end; row++) {
			const v = (row + 0.5) / height;
			const backgroundR = 0.07 + 0.05 * v;
			const backgroundG = 0.08 + 0.06 * v;
			const backgroundB = 0.11 + 0.1 * v;
			const gridV = v * 10;
			const gridRow = gridV - Math.floor(gridV) < 0.03;
			let crossingCount = 0;
			for (let i = 0; i < count; i++) {
				const dy = v - (centers[i] ?? 0);
				if (this.field(i, 6) !== 0 && Math.abs(dy) <= this.field(i, 2) + 0.01) {
					rowDistance[i] = dy;
					crossing[crossingCount++] = i;
				}
			}
			let out = row * width * 4;
			for (let column = 0; column < width; column++) {
				const u = (column + 0.5) / width;
				const gridU = u * aspect * 10;
				let r = backgroundR;
				let g = backgroundG;
				let b = backgroundB;
				if (gridRow || gridU - Math.floor(gridU) < 0.03) {
					r += 0.04;
					g += 0.04;
					b += 0.05;
				}
				for (let k = 0; k < crossingCount; k++) {
					const i = crossing[k] ?? 0;
					const radius = this.field(i, 2);
					const dx = (u - this.field(i, 0)) * aspect;
					const dy = rowDistance[i] ?? 0;
					const distance = Math.sqrt(dx * dx + dy * dy);
					if (distance > radius + 0.01) {
						continue;
					}
					const ratio = distance / radius;
					let shade = 1 - 0.55 * ratio * ratio;
					const edge = Math.max(0, Math.min(1, (radius - distance) * height * 0.5));
					if (i === selected && distance > radius - 0.012) {
						shade = 1.6;
					}
					const color = PALETTE[this.field(i, 5)] ?? [1, 1, 1];
					r += (color[0] * shade - r) * edge;
					g += (color[1] * shade - g) * edge;
					b += (color[2] * shade - b) * edge;
				}
				pixels[out++] = 255 * Math.min(r, 1);
				pixels[out++] = 255 * Math.min(g, 1);
				pixels[out++] = 255 * Math.min(b, 1);
				pixels[out++] = 255;
			}
		}
	}
}
