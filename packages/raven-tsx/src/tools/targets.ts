/** The platforms a native package exists for, shared by the tools. */

import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { STAMP_FILE, type LibraryStamp } from "../core/library-check";
import mainManifest from "../../package.json";

export interface Target {
	readonly os: string;
	readonly cpu: string;
	/** The file the library is in. */
	readonly library: string;
}

export const TARGETS: Readonly<Record<string, Target>> = {
	"linux-x64": { os: "linux", cpu: "x64", library: "libraven.so" },
	"linux-arm64": { os: "linux", cpu: "arm64", library: "libraven.so" },
	"darwin-arm64": { os: "darwin", cpu: "arm64", library: "libraven.dylib" },
	"darwin-x64": { os: "darwin", cpu: "x64", library: "libraven.dylib" },
	"win32-x64": { os: "win32", cpu: "x64", library: "raven.dll" },
};

/** The name of the package of a platform. */
export function packageName(mainName: string, target: string): string {
	return `${mainName}-${target}`;
}

/** The target of a name, or an exit with what is valid. */
export function targetOf(name: string): Target {
	const target = TARGETS[name];
	if (!target) {
		console.error(`unknown target "${name}": one of ${Object.keys(TARGETS).join(", ")}`);
		process.exit(1);
	}
	return target;
}

/** The value after a `--name` argument, or an exit saying it is missing. */
export function argument(name: string): string {
	const index = process.argv.indexOf(`--${name}`);
	const value = index >= 0 ? process.argv[index + 1] : undefined;
	if (!value) {
		console.error(`missing --${name}`);
		process.exit(1);
	}
	return value;
}

/** The value after a `--name` argument, if it was given. */
export function optionalArgument(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * Writes a file beside its place and moves it there: a program running from the old library
 * keeps it, and a program starting now finds a whole one.
 */
async function replaceFile(path: string, content: Blob | string): Promise<void> {
	const beside = `${path}.${process.pid}.tmp`;
	await Bun.write(beside, content);
	renameSync(beside, path);
}

/** The addon of Raven's Node.js binding, in the package of a platform beside the library. */
export const ADDON_FILE = "raven_napi.node";

/**
 * Writes the package of a platform: the library, its stamp, the addon of Raven's Node.js binding
 * when there is one, and the module that says where the library is (for Bun, which embeds it in an
 * executable, and for Node.js).
 */
export async function writePlatformPackage(options: {
	readonly mainName: string;
	readonly version: string;
	readonly target: string;
	readonly libraryPath: string;
	/** The addon of Raven's Node.js binding, built for this platform: none on Windows yet. */
	readonly addonPath?: string | undefined;
	readonly directory: string;
	readonly licensesFrom?: string;
	/** What the library is, for `raven.json`. */
	readonly stamp: LibraryStamp;
}): Promise<void> {
	const { mainName, version, target, libraryPath, addonPath, licensesFrom, stamp } = options;
	const { os, cpu, library } = targetOf(target);
	const files = ["index.ts", "index.js", library, STAMP_FILE];
	// (absolute: removing a path that holds ".." fails on Windows, in Bun.$ and in rmSync)
	const directory = resolve(options.directory);
	mkdirSync(directory, { recursive: true });
	await replaceFile(`${directory}/${library}`, Bun.file(libraryPath));
	await replaceFile(`${directory}/${STAMP_FILE}`, `${JSON.stringify(stamp, null, 2)}\n`);
	await replaceFile(`${directory}/index.ts`, `import path from "./${library}" with { type: "file" };\n\nexport default path;\n`);
	// (Node.js has no import of a file: the path is beside this module)
	await replaceFile(`${directory}/index.js`, `import { fileURLToPath } from "node:url";\n\nexport default fileURLToPath(new URL("./${library}", import.meta.url));\n`);
	if (addonPath) {
		await replaceFile(`${directory}/${ADDON_FILE}`, Bun.file(addonPath));
		files.push(ADDON_FILE);
	}
	for (const name of ["LICENSE", "NOTICE", "THIRD_PARTY.md"]) {
		if (licensesFrom && (await Bun.file(`${licensesFrom}/${name}`).exists())) {
			await replaceFile(`${directory}/${name}`, Bun.file(`${licensesFrom}/${name}`));
			files.push(name);
		}
	}
	const manifest = {
		name: packageName(mainName, target),
		version,
		description: `The native library of Raven for ${target}, used by ${mainName}`,
		license: "Apache-2.0",
		type: "module",
		os: [os],
		cpu: [cpu],
		exports: { ".": { bun: "./index.ts", node: "./index.js", default: "./index.ts" } },
		files,
		repository: mainManifest.repository,
	};
	await replaceFile(`${directory}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
	for (const name of readdirSync(directory)) {
		if (name !== "package.json" && !files.includes(name)) {
			rmSync(`${directory}/${name}`, { recursive: true, force: true });
		}
	}
}
