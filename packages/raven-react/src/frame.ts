/**
 * The one slot Raven has for a function called at each frame, shared. `useFrame` and
 * `Rset_frame_callback` of the application both end up in one native callback, which goes away
 * when nothing needs it. Without this, each would take the place of the others, and the binding
 * would keep every function it was given alive for ever.
 */

import "./native";
import { CFunction, JSCallback, ptr, type Pointer } from "bun:ffi";
import { Rset_frame_callback as connectNative, type RFrameCallback, type RPointer } from "./vendor/raven";

/** What is called at each frame, with the seconds since the last one. */
export type FrameHandler = (deltaSeconds: number) => void;

class FrameSlot {
	private readonly subscribers = new Set<FrameHandler>();
	private application: FrameHandler | null = null;
	private callback: JSCallback | null = null;
	private connected = false;

	/** Connects the native callback when something needs it, and takes it away when nothing does. */
	private sync(): void {
		const wanted = this.application !== null || this.subscribers.size > 0;
		if (wanted !== this.connected) {
			this.callback ??= new JSCallback((delta: number): void => this.dispatch(delta), { args: ["f64", "ptr"], returns: "void" });
			connectNative(wanted ? this.callback.ptr : null);
			this.connected = wanted;
		}
	}

	/** An exception must not cross the frames of C, nor keep the others from being called. */
	private dispatch(delta: number): void {
		for (const handler of [...(this.application ? [this.application] : []), ...this.subscribers]) {
			try {
				handler(delta);
			} catch (error) {
				console.error("raven-react: exception in a frame callback:", error);
			}
		}
	}

	/** What `Rset_frame_callback` does: one function, replaced by the next, beside the subscribers. */
	setApplication(callback: RFrameCallback | Pointer | null, userData: RPointer): void {
		if (typeof callback === "number") {
			// a function of C: called from here, as it no longer has the slot to itself
			const native = CFunction({ ptr: callback, args: ["f64", "ptr"], returns: "void" });
			this.application = (delta) => void native(delta, userData);
		} else if (callback) {
			// an address, as C would give it. An array stays alive for as long as this function does.
			this.application = (delta) => void callback(delta, userData === null || typeof userData === "number" ? userData : ptr(userData));
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
 * Registers a function called once per frame, before the layout, beside what `useFrame` added.
 * Takes the place of the one of the C API, under the same name.
 */
export function Rset_frame_callback(callback: RFrameCallback | Pointer | null, user_data: RPointer = null): void {
	frameSlot.setApplication(callback, user_data);
}
