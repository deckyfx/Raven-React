/**
 * Registers the plugin of `@decky.fx/raven-tsx/solid/plugin` for what Bun runs and tests:
 *
 *     # bunfig.toml
 *     preload = ["@decky.fx/raven-tsx/solid/preload"]
 *
 *     [test]
 *     preload = ["@decky.fx/raven-tsx/solid/preload"]
 */

import { plugin } from "bun";
import { solidPlugin } from "./plugin";

plugin(solidPlugin());
