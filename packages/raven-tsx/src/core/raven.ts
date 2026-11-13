/**
 * The binding of Raven. It opens the library as soon as it is imported, so `#native`, which
 * finds it, comes first. Everything in this package imports Raven from here.
 *
 * `#raven` is Raven's binding for the runtime: for Bun (bun:ffi), or for Node.js (Raven's
 * Node-API addon). They have the same functions, structures and callbacks, under the same names;
 * the types are those of the binding for Bun.
 */

import "#native";

export * from "#raven";
// (shared with onFrame: a name given here has priority over the one of `export *`)
export { Rset_frame_callback } from "./frame";
