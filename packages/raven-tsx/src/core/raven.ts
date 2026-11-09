/**
 * The binding of Raven. It opens the library as soon as it is imported, so `./native`
 * comes first. Everything in this package imports Raven from here.
 */

import "./native";

export * from "../vendor/raven";
// (shared with onFrame: a name given here has priority over the one of `export *`)
export { Rset_frame_callback } from "./frame";
