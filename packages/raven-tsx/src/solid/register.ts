/**
 * Runs an application of `@decky.fx/raven-tsx/solid` under Node.js, as the preload does on Bun:
 *
 *     node --import @decky.fx/raven-tsx/solid/register src/index.tsx
 *
 * Its hooks, in the thread of the application (`module.registerHooks`):
 *
 * - compile `.tsx` and `.jsx` outside node_modules for Solid, with Babel (see `./compile`), and give
 *   the result to Node.js as TypeScript, whose types it takes away itself: erasable TypeScript
 *   only, as Node.js runs it;
 * - resolve `solid-js` with the condition "browser": on Node.js it is otherwise its build for
 *   servers, which does not react.
 */

import babel from "@babel/core";
import solid from "babel-preset-solid";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { isTypeScript, solidBabelOptions, SOURCES } from "./compile";

/** Whether a specifier is of solid-js, which must be its build for clients. */
const isSolid = (specifier: string): boolean => specifier === "solid-js" || specifier.startsWith("solid-js/");

registerHooks({
	resolve(specifier, context, nextResolve) {
		return nextResolve(specifier, isSolid(specifier) ? { ...context, conditions: ["browser", ...context.conditions] } : context);
	},
	load(url, context, nextLoad) {
		const path = url.startsWith("file:") ? fileURLToPath(url) : null;
		if (!path || !SOURCES.test(path)) {
			return nextLoad(url, context);
		}
		const result = babel.transformSync(readFileSync(path, "utf8"), solidBabelOptions(path, solid));
		if (typeof result?.code !== "string") {
			throw new Error(`raven-tsx: Babel compiled nothing from ${path}`);
		}
		return { format: isTypeScript(path) ? "module-typescript" : "module", source: result.code, shortCircuit: true };
	},
});
