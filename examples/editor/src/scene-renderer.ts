/** Renders the scene into a texture, on this thread or on all the cores. */

import { raven } from "@decky.fx/raven-react";
import type { SceneObject } from "./scene";
import { makeFrameBuffers, MAX_PIXEL_BYTES, SharedFrame, type FrameBuffers } from "./shared-frame";

/** The divisor of each choice of the Resolution box. */
const DIVISORS: readonly number[] = [1, 2, 4];

/** What a frame needs to be rendered. */
export interface RenderRequest {
	readonly objects: readonly SceneObject[];
	readonly selected: number;
	readonly time: number;
	readonly scale: number;
	readonly threaded: boolean;
}

/**
 * The size of a frame for a viewport, divided as the Resolution box says, and made smaller, in
 * the same shape, when the pixels would not fit in the memory reserved for a frame (past 8K).
 */
export function frameSize(viewportWidth: number, viewportHeight: number, divisor: number): [width: number, height: number] {
	const width = viewportWidth / divisor;
	const height = viewportHeight / divisor;
	const fit = Math.min(1, Math.sqrt(MAX_PIXEL_BYTES / 4 / (width * height)));
	return [Math.floor(width * fit), Math.floor(height * fit)];
}

/**
 * The renderer of the viewport. `Rparallel_for` cannot run JavaScript on Raven's worker threads,
 * so this keeps its own workers on shared memory, as many as Raven has, started when first used.
 */
export class SceneRenderer {
	private readonly buffers: FrameBuffers = makeFrameBuffers();
	private readonly frame = new SharedFrame(this.buffers);
	private readonly workers: Worker[] = [];
	private texture = raven.R_INVALID_ID;
	private viewportWidth = 0;
	private viewportHeight = 0;
	/** Says what the last frame was, for the panel of properties. */
	info = "";

	constructor(private readonly workerCount: number) {}

	/** The size of the viewport in pixels changed. */
	resize(width: number, height: number): void {
		this.viewportWidth = width;
		this.viewportHeight = height;
	}

	/** Starts the workers the first time they are needed. */
	private startWorkers(): void {
		while (this.workers.length < this.workerCount) {
			const worker = new Worker(new URL("./render-worker.ts", import.meta.url).href);
			worker.postMessage(this.buffers);
			this.workers.push(worker);
		}
	}

	/** Renders a frame and gives it to a viewport. Returns whether the viewport has a size to render to. */
	render(viewport: raven.Rid, request: RenderRequest): boolean {
		const [width, height] = frameSize(this.viewportWidth, this.viewportHeight, DIVISORS[request.scale % DIVISORS.length] ?? 1);
		if (width < 2 || height < 2) {
			return false;
		}
		const shared = request.threaded && this.workerCount > 0;
		if (shared) {
			this.startWorkers();
		}
		const start = raven.Rget_time();
		this.frame.render(request.objects, request.selected, request.time, width, height, shared);
		const milliseconds = (raven.Rget_time() - start) * 1000;
		// (the pixels are copied: Raven uploads them on its own thread)
		if (this.texture === raven.R_INVALID_ID) {
			this.texture = raven.Rtexture_create_from_pixels(this.frame.pixels, width, height);
			raven.Rviewport_set_texture(viewport, this.texture);
		} else {
			raven.Rtexture_update(this.texture, this.frame.pixels, width, height);
		}
		const threads = request.threaded ? this.workerCount + 1 : 1;
		this.info = `${width} x ${height} pixels in ${milliseconds.toFixed(2)} ms on ${threads} thread${threads > 1 ? "s" : ""}`;
		return true;
	}

	/** Ends the workers and frees the texture. */
	dispose(): void {
		this.frame.stop();
		for (const worker of this.workers) {
			worker.terminate();
		}
		if (this.texture !== raven.R_INVALID_ID) {
			raven.Rtexture_destroy(this.texture);
		}
	}
}
