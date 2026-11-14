/**
 * Bundles this package for Node.js, which runs neither its TypeScript in a package nor bun:ffi:
 * the entry points, with what they share in chunks of their own (one core, whichever entry
 * imports it), resolved with the condition "node" (#backend, #native and #raven are then those of
 * Node.js). The frameworks and the packages of the platforms stay outside, as dependencies.
 *
 *     bun run build:node [--out dist/node]
 */

import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { optionalArgument } from "./targets";

/** The entry points that run on Node.js, by the subpath of the package that names them. */
export const NODE_ENTRIES: Readonly<Record<string, string>> = {
	".": "src/core/index.ts",
	"./react": "src/react/index.ts",
	"./solid": "src/solid/index.ts",
};

/** What the bundle imports instead of holding. */
const EXTERNAL = ["react", "react-reconciler", "react-reconciler/*", "solid-js", "solid-js/*", "@decky.fx/*", "@babel/core", "babel-preset-solid"];

/** Bundles the entry points into a folder, emptied first. */
export async function buildForNode(root: string, outdir: string): Promise<void> {
	rmSync(outdir, { recursive: true, force: true });
	const result = await Bun.build({
		entrypoints: Object.values(NODE_ENTRIES).map((entry) => `${root}/${entry}`),
		root: `${root}/src`,
		outdir,
		target: "node",
		format: "esm",
		splitting: true,
		conditions: ["node"],
		external: EXTERNAL,
	});
	if (!result.success) {
		for (const log of result.logs) {
			console.error(log.message);
		}
		throw new Error("bundling for Node.js failed");
	}
}

if (import.meta.main) {
	const root = resolve(`${import.meta.dir}/../..`);
	const outdir = resolve(optionalArgument("out") ?? `${root}/dist/node`);
	await buildForNode(root, outdir);
	console.log(`${outdir}: ${Object.keys(NODE_ENTRIES).join(", ")}`);
}
