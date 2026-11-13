/** The backend of Bun: a JSCallback, which decodes what C gives as Raven's Node addon does. */

import { CString, JSCallback, ptr, toArrayBuffer, type FFITypeOrString, type Pointer } from "bun:ffi";
import type { NativeArg, NativeCallback, NativeResult, NativeReturn, NativeValue } from "./types";

/** The type bun:ffi passes for what C gives. */
function ffiTypeOf(arg: NativeArg): FFITypeOrString {
	return typeof arg === "string" && arg !== "pointer" && arg !== "text" && arg !== "float" ? arg : "ptr";
}

/** What C gave, as the function receives it. */
function decode(arg: NativeArg, raw: number | Pointer | null): NativeValue {
	if (typeof arg !== "string") {
		return arg.from(raw as Pointer | null);
	}
	switch (arg) {
		case "text":
			return raw ? new CString(raw as Pointer).toString() : null;
		case "float":
			return raw ? new Float32Array(toArrayBuffer(raw as Pointer, 0, Float32Array.BYTES_PER_ELEMENT)) : null;
		default:
			return raw;
	}
}

/**
 * A function C can call, with what it gives decoded, and its user data last, which the function
 * does not read. It lives for ever: the core makes one per kind of event, shared by the widgets.
 */
export function nativeCallback(args: readonly NativeArg[], returns: NativeReturn, run: (...values: NativeValue[]) => NativeResult): NativeCallback {
	// (a text returned is read by C after the call: it lives until the next one)
	let text = Buffer.from([0]);
	const callback = new JSCallback(
		(...raw: (number | Pointer | null)[]): number | Pointer | void => {
			const result = run(...args.map((arg, index) => decode(arg, raw[index] ?? null)));
			if (returns === "text") {
				text = Buffer.from(`${typeof result === "string" ? result : ""}\0`);
				return ptr(text);
			}
			if (returns === "i32") {
				return typeof result === "number" ? result : 0;
			}
		},
		{ args: [...args.map(ffiTypeOf), "ptr"], returns: returns === "text" ? "ptr" : returns },
	);
	return callback.ptr as NativeCallback;
}
