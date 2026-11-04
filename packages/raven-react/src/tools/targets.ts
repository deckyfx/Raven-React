/** The platforms a native package exists for, shared by the tools. */

import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

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

/** Writes the package of a platform: the library, and the module that says where it is. */
export async function writePlatformPackage(options: {
	readonly mainName: string;
	readonly version: string;
	readonly target: string;
	readonly libraryPath: string;
	readonly directory: string;
	readonly licensesFrom?: string;
}): Promise<void> {
	const { mainName, version, target, libraryPath, licensesFrom } = options;
	const { os, cpu, library } = targetOf(target);
	const files = ["index.ts", library];
	// (absolute: removing a path that holds ".." fails on Windows, in Bun.$ and in rmSync)
	const directory = resolve(options.directory);
	rmSync(directory, { recursive: true, force: true });
	mkdirSync(directory, { recursive: true });
	await Bun.write(`${directory}/${library}`, Bun.file(libraryPath));
	await Bun.write(`${directory}/index.ts`, `import path from "./${library}" with { type: "file" };\n\nexport default path;\n`);
	for (const name of ["LICENSE", "NOTICE", "THIRD_PARTY.md"]) {
		if (licensesFrom && (await Bun.file(`${licensesFrom}/${name}`).exists())) {
			await Bun.write(`${directory}/${name}`, Bun.file(`${licensesFrom}/${name}`));
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
		exports: { ".": "./index.ts" },
		files,
		repository: { type: "git", url: "git+https://github.com/deckyfx/Raven-React.git" },
	};
	await Bun.write(`${directory}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
}
