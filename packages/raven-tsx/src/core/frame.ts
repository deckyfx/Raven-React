/**
 * The one slot Raven has for a function called at each frame, shared. `onFrame` and
 * `Rset_frame_callback` of the application both end up in one native callback, which goes away
 * when nothing needs it. Without this, each would take the place of the others, and the binding
 * would keep every function it was given alive for ever.
 */

import "./native";
import type { Pointer } from "bun:ffi";
import { addressOf, callFunction, nativeCallback } from "#backend";
import type { NativeCallback } from "./backend/types";
import { Rset_frame_callback as connectNative, type RFrameCallback, type RPointer } from "../vendor/raven";

/** What is called at each frame, with the seconds since the last one. */
export type FrameHandler = (deltaSeconds: number) => void;

class FrameSlot {
	private readonly subscribers = new Set<FrameHandler>();
	private application: FrameHandler | null = null;
	private callback: NativeCallback | null = null;
	private connected = false;

	/** Connects the native callback when something needs it, and takes it away when nothing does. */
	private sync(): void {
		const wanted = this.application !== null || this.subscribers.size > 0;
		if (wanted !== this.connected) {
			this.callback ??= nativeCallback(["f64"], "void", (delta) => this.dispatch(Number(delta)));
			connectNative(wanted ? this.callback : null);
			this.connected = wanted;
		}
	}

	/** An exception must not cross the frames of C, nor keep the others from being called. */
	private dispatch(delta: number): void {
		for (const handler of [...(this.application ? [this.application] : []), ...this.subscribers]) {
			try {
				handler(delta);
			} catch (error) {
				console.error("raven-tsx: exception in a frame callback:", error);
			}
		}
	}

	/** What `Rset_frame_callback` does: one function, replaced by the next, beside the subscribers. */
	setApplication(callback: RFrameCallback | Pointer | null, userData: RPointer): void {
		if (typeof callback === "number") {
			// a function of C: called from here, as it no longer has the slot to itself
			this.application = (delta) => callFunction(callback, delta, addressOf(userData));
		} else if (callback) {
			// an address, as C would give it. An array stays alive for as long as this function does.
			this.application = (delta) => void callback(delta, addressOf(userData));
		} else {
			this.application = null;
		}
		this.sync();
	}

	/** Adds a function, and returns what takes it away. */
	subscribe(handler: FrameHandler): () => void {
		this.subscribers.add(handler);
		this.sync();
		return () => {
			this.subscribers.delete(handler);
			this.sync();
		};
	}
}

export const frameSlot = new FrameSlot();

/**
 * Registers a function called once per frame, before the layout, beside what `onFrame` added.
 * Takes the place of the one of the C API, under the same name.
 */
export function Rset_frame_callback(callback: RFrameCallback | Pointer | null, user_data: RPointer = null): void {
	frameSlot.setApplication(callback, user_data);
}
