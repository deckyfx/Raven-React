/**
 * Builds what Node.js takes of this package, which runs neither its TypeScript in a package nor
 * bun:ffi, into `dist`:
 *
 * - `dist/node`: the entry points bundled, with what they share in chunks of their own (one core,
 *   whichever entry imports it), resolved with the condition "node" (#backend, #native and #raven
 *   are then those of Node.js). The frameworks and the packages of the platforms stay outside.
 * - `dist/types`: their declarations, as TypeScript resolves them for Node.js ("NodeNext"): the
 *   relative imports end in `.js`, and what the sources take from Bun (bun:ffi, #raven) points to
 *   declarations here, so that a project of Node.js needs no types of Bun.
 *
 *     bun run build:node [--out dist]
 */

import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { optionalArgument } from "./targets";

/** The entry points that run on Node.js, by the subpath of the package that names them. */
export const NODE_ENTRIES: Readonly<Record<string, string>> = {
	".": "src/core/index.ts",
	"./react": "src/react/index.ts",
	"./solid": "src/solid/index.ts",
};

/** What the bundle imports instead of holding. */
const EXTERNAL = ["react", "react-reconciler", "react-reconciler/*", "solid-js", "solid-js/*", "@decky.fx/*", "@babel/core", "babel-preset-solid"];

/**
 * The types of bun:ffi that the declarations name, for a project without those of Bun: an
 * address as Raven's bindings brand it, and the functions of a library (`webFunctions`, on Bun).
 */
const BUN_FFI_TYPES = `/** The types of bun:ffi that the declarations of raven-tsx name, for a project without those of Bun. */

/** An address of the library, as Raven's bindings brand it. */
export type Pointer = number & { __pointer__: null };

/** A value a function of a library takes or returns. */
type NativeValue = number | bigint | string | boolean | object | null;

/** How a function of a library is called: what it takes, and what it returns. */
export interface FFIFunction {
	readonly args?: readonly string[];
	readonly returns?: string;
}

/** The functions of a library, by name. */
export type ConvertFns<S> = { readonly [K in keyof S]: (...args: NativeValue[]) => NativeValue | void };
`;

/** Bundles the entry points into a folder, emptied first. */
async function bundle(root: string, outdir: string): Promise<void> {
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

/** Every file below a folder, recursively. */
function filesUnder(folder: string): string[] {
	return readdirSync(folder).flatMap((name) => {
		const path = join(folder, name);
		return statSync(path).isDirectory() ? filesUnder(path) : [path];
	});
}

/** A path from a declaration to another, as an import in it writes it: `./x.js`, `../y/index.js`. */
function specifierTo(from: string, to: string): string {
	const path = relative(dirname(from), to).replaceAll("\\", "/");
	return path.startsWith(".") ? path : `./${path}`;
}

/**
 * Makes the declarations of one file resolvable under "NodeNext": a relative import names its
 * file (`.js`, or the `index.js` of a folder), bun:ffi and #raven point to declarations here,
 * and `import "#native"`, which only loads the library, goes.
 */
function forNodeNext(file: string, types: string): string {
	const text = readFileSync(file, "utf8");
	return text
		.replace(/^import "#native";\n/gm, "")
		.replace(/(from\s+|import\s*\(\s*)"([^"]+)"/g, (whole, before: string, specifier: string) => {
			if (specifier === "bun:ffi") {
				return `${before}"${specifierTo(file, join(types, "bun-ffi.js"))}"`;
			}
			if (specifier === "#raven") {
				return `${before}"${specifierTo(file, join(types, "vendor/raven.js"))}"`;
			}
			if (!specifier.startsWith(".")) {
				return whole;
			}
			const target = resolve(dirname(file), specifier);
			const asFolder = statSync(target, { throwIfNoEntry: false })?.isDirectory() === true;
			return `${before}"${specifier}${asFolder ? "/index.js" : ".js"}"`;
		});
}

/** Writes the declarations of the sources for Node.js into a folder, emptied first. */
async function declare(root: string, types: string): Promise<void> {
	rmSync(types, { recursive: true, force: true });
	const tsc = Bun.spawn(
		["bun", "x", "tsc", "-p", `${root}/tsconfig.json`, "--noEmit", "false", "--declaration", "--emitDeclarationOnly", "--rootDir", `${root}/src`, "--outDir", types],
		{ cwd: root, stdout: "pipe", stderr: "pipe" },
	);
	const [output, errors, code] = await Promise.all([new Response(tsc.stdout).text(), new Response(tsc.stderr).text(), tsc.exited]);
	if (code !== 0) {
		throw new Error(`declaring the sources failed:\n${output}${errors}`);
	}
	// (the tests and the tools are not part of the package)
	for (const folder of ["test", "tools"]) {
		rmSync(join(types, folder), { recursive: true, force: true });
	}
	for (const file of filesUnder(types)) {
		writeFileSync(file, forNodeNext(file, types));
	}
	writeFileSync(join(types, "bun-ffi.d.ts"), BUN_FFI_TYPES);
}

/** Builds `node` and `types` in a folder: what Node.js takes of the package. */
export async function buildForNode(root: string, dist: string): Promise<void> {
	await bundle(root, join(dist, "node"));
	await declare(root, join(dist, "types"));
}

if (import.meta.main) {
	const root = resolve(`${import.meta.dir}/../..`);
	const dist = resolve(optionalArgument("out") ?? `${root}/dist`);
	await buildForNode(root, dist);
	console.log(`${dist}: node and types for ${Object.keys(NODE_ENTRIES).join(", ")}`);
}
