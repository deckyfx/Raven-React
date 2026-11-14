/**
 * What the core asks of the runtime it runs on, Bun or Node.js: a function C can call. The two
 * bindings of Raven have the same surface (functions, structures, callbacks), but not the same way
 * to call back: Bun makes a JSCallback that the core decodes, Node.js gives the function to Raven's
 * addon, which decodes. `#backend` is one of `bun.ts` and `node.ts`, by the runtime.
 */

import type { Pointer } from "bun:ffi";

/** A structure of Raven that C gives to a callback, read where it is: `REvent`, `RTileItem`. */
export interface StructType {
	from(pointer: Pointer | null): object | null;
}

/**
 * What C gives a callback, in order, after which comes its user data: a number of a C type, a
 * text, an address passed on as it is (a painter), one float C reads back once the callback
 * returns, or a structure.
 */
export type NativeArg = "u32" | "i32" | "f32" | "f64" | "pointer" | "text" | "float" | StructType;

/** A value as the function receives it: a text as a string, a float to write as a `Float32Array`. */
export type NativeValue = number | string | Float32Array | object | Pointer | null;

/** What C reads back: nothing, a number (an `int`, or an `Rid`), or a text valid until the next call. */
export type NativeReturn = "void" | "i32" | "u32" | "text";

/** What the function returns for C: a number for "i32" and "u32", a text for "text". */
export type NativeResult = number | string | null | void;

/** A callback for C as a setter of Raven takes it: on Bun an address, on Node.js the function. */
export type NativeCallback = Pointer;
