/// <reference path="./babel-preset-solid.d.ts" />
/**
 * The Bun plugin that runs an application of `@decky.fx/raven-tsx/solid`. Bun compiles JSX as
 * React does; Solid compiles it to calls of its renderer, with Babel (`babel-preset-solid`, in its
 * universal mode, for the renderer of `@decky.fx/raven-tsx/solid/renderer`). And on Bun, `solid-js`
 * resolves to its build for servers, which does not react: the plugin loads the one for clients.
 *
 * To run: `preload = ["@decky.fx/raven-tsx/solid/preload"]` in bunfig.toml. To build:
 *
 *     await Bun.build({ entrypoints: ["src/index.tsx"], plugins: [solidPlugin()], compile: true });
 */

import type { BunPlugin } from "bun";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

/** What the plugin can be told. */
export interface SolidPluginOptions {
	/** The files it compiles for Solid. All `.tsx` and `.jsx` files outside node_modules by default. */
	readonly filter?: RegExp | undefined;
	/** Takes the development builds of Solid, which warn of mistakes. */
	readonly development?: boolean | undefined;
}

/** The files compiled by default: `.tsx` and `.jsx`, but those of node_modules, which come compiled. */
const SOURCES = /^(?!.*[\\/]node_modules[\\/]).*\.[jt]sx$/;

/** What `exports` of a package.json gives for a subpath, or a choice of conditions. */
type ExportsEntry = string | null | { readonly [condition: string]: ExportsEntry };

/** The entry of the first condition that is one of these, as Node picks one. */
function pick(entry: ExportsEntry | undefined, conditions: readonly string[]): string | undefined {
	if (typeof entry === "string") {
		return entry;
	}
	for (const [condition, value] of Object.entries(entry ?? {})) {
		const found = conditions.includes(condition) ? pick(value, conditions) : undefined;
		if (found) {
			return found;
		}
	}
	return undefined;
}

/** The files of Solid for servers, by package folder, each with the file for clients that replaces it. */
const clientFiles = new Map<string, ReadonlyMap<string, string>>();

/**
 * What replaces each build of a solid-js for servers: the one a client would take for the same
 * import, as Node picks them from `exports` (Bun takes `node` and finds the server's).
 */
function clientFilesOf(root: string, development: boolean): ReadonlyMap<string, string> {
	let files = clientFiles.get(root);
	if (!files) {
		const { exports } = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as { readonly exports: Readonly<Record<string, ExportsEntry>> };
		const map = new Map<string, string>();
		for (const entry of Object.values(exports)) {
			for (const style of ["import", "require"]) {
				const server = pick(entry, ["node", style, "default"]);
				const client = pick(entry, development ? ["browser", "development", style, "default"] : ["browser", style, "default"]);
				if (server && client && server !== client) {
					map.set(resolve(root, server), resolve(root, client));
				}
			}
		}
		files = map;
		clientFiles.set(root, files);
	}
	return files;
}

/** The folder of the solid-js package a file of it is in. */
const solidRoot = (path: string): string => path.slice(0, path.lastIndexOf(`${sep}solid-js${sep}`) + `${sep}solid-js`.length);

/** The plugin: compiles TSX for Solid, and takes Solid's build for clients. */
export function solidPlugin(options: SolidPluginOptions = {}): BunPlugin {
	const development = options.development ?? false;
	return {
		name: "raven-tsx-solid",
		setup(build) {
			// (Bun runs no onResolve of a plugin for a package: the server's file is read as the client's)
			build.onLoad({ filter: /[\\/]solid-js[\\/].*server\.c?js$/ }, ({ path }) => {
				const client = clientFilesOf(solidRoot(path), development).get(path);
				return { contents: readFileSync(client ?? path, "utf8"), loader: "js" };
			});
			build.onLoad({ filter: options.filter ?? SOURCES }, async ({ path }) => {
				// (loaded here, so that an application of React never needs Babel)
				const [{ transformAsync }, { default: solid }] = await Promise.all([import("@babel/core"), import("babel-preset-solid")]);
				const typescript = /\.tsx$/.test(path);
				const result = await transformAsync(await Bun.file(path).text(), {
					filename: path,
					babelrc: false,
					configFile: false,
					// (an error says the line of the source: Bun does not read Babel's source maps)
					retainLines: true,
					// (the types stay, for Bun to take away: Babel only compiles the JSX)
					parserOpts: { plugins: typescript ? ["jsx", "typescript"] : ["jsx"] },
					presets: [[solid, { generate: "universal", moduleName: "@decky.fx/raven-tsx/solid/renderer" }]],
				});
				if (typeof result?.code !== "string") {
					throw new Error(`raven-tsx: Babel compiled nothing from ${path}`);
				}
				return { contents: result.code, loader: typescript ? "ts" : "js" };
			});
		},
	};
}
