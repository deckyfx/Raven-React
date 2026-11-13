/**
 * The backend of Node.js: the function itself, which Raven's addon calls with what C gives already
 * decoded (a text as a string, a float to write as a Float32Array, a structure as its class), and
 * keeps as long as Raven may call it.
 */

import type { NativeArg, NativeCallback, NativeResult, NativeReturn, NativeValue } from "./types";

/** A function C can call: see the backend of Bun, which this one behaves as. */
export function nativeCallback(_args: readonly NativeArg[], returns: NativeReturn, run: (...values: NativeValue[]) => NativeResult): NativeCallback {
	const callback = (...values: NativeValue[]): number | string | void => {
		const result = run(...values);
		if (returns === "text") {
			return typeof result === "string" ? result : "";
		}
		if (returns === "i32") {
			return typeof result === "number" ? result : 0;
		}
	};
	// (a setter of the binding takes a function where C takes a callback: the type says an address,
	// as the core passes the same value on Bun)
	return callback as never as NativeCallback;
}
