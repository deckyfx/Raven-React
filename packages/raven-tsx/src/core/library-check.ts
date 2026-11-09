/**
 * What a native library is, and whether it fits the binding. Raven cannot say by itself:
 * `Rget_version` is the version in its CMakeLists, the same for every commit between two
 * releases, and no commit is compiled in. So `raven.json` goes beside a library when it is
 * packaged, and the functions the binding opens can be looked for in the file.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The file beside a packaged library that says what it is. */
export const STAMP_FILE = "raven.json";

/** What `raven.json` holds. */
export interface LibraryStamp {
	/** The commit of Raven it was built from, or an empty text when that is not known. */
	readonly commit: string;
	/** What `RAVEN_VERSION` said when it was packaged. */
	readonly pin: string;
	/** What `Rget_version` says. */
	readonly version: string;
	/** The SHA-256 of the library, to see that it is still that one. */
	readonly sha256: string;
	/** False when it was packaged with `--allow-mismatch`. */
	readonly verified: boolean;
}

/** The stamp in a folder, if it has one that can be read. */
export function readStamp(directory: string): LibraryStamp | null {
	try {
		return JSON.parse(readFileSync(`${directory}/${STAMP_FILE}`, "utf8")) as LibraryStamp;
	} catch {
		return null;
	}
}

/** The names of the C functions a binding opens. */
export function functionsOfBinding(binding: string): string[] {
	return Array.from(binding.matchAll(/^\tR[a-z][a-z0-9_]*(?=: \{ args: )/gm), (match) => match[0].slice(1));
}

/**
 * The functions a library does not have, from the bytes of the file: its table of exports
 * holds them by name on Linux, macOS and Windows. A name in the file can be something else,
 * so an empty answer proves nothing and the system still has the last word, but a name that is
 * nowhere in the file is really missing. With most of them missing this is no such file.
 */
export function missingFunctions(functions: readonly string[], library: Buffer): string[] {
	const found = new Set(library.toString("latin1").match(/R[a-z][a-z0-9_]*/g));
	const missing = functions.filter((name) => !found.has(name));
	return missing.length > functions.length / 2 ? [] : missing;
}

/** A commit as it is shown. */
export function shortCommit(commit: string): string {
	return /^[0-9a-f]{40}$/.test(commit) ? commit.slice(0, 7) : commit;
}

/**
 * Says what is wrong with a library before the binding opens it, as all the system would say is
 * that one symbol was not found. Nothing happens in an executable, which holds what it was
 * built with, or when the stamp says the library was packaged for this pin and checked:
 * `--allow-mismatch` writes the pin too, without having checked anything.
 */
export function checkLibrary(library: string): void {
	const binding = `${import.meta.dir}/../vendor/raven.ts`;
	if (!existsSync(binding) || !existsSync(library)) {
		return;
	}
	const pinFile = resolve(import.meta.dir, "../../RAVEN_VERSION");
	const pin = existsSync(pinFile) ? readFileSync(pinFile, "utf8").trim() : "";
	const stamp = readStamp(dirname(library));
	if (stamp?.verified && stamp.pin === pin) {
		return;
	}
	const built = stamp?.commit ? `built from Raven ${shortCommit(stamp.commit)}` : "built from a commit it cannot say";
	const missing = missingFunctions(functionsOfBinding(readFileSync(binding, "utf8")), readFileSync(library));
	if (missing.length > 0) {
		const named = `${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}`;
		throw new Error(
			`raven-tsx: the library ${library} is older than the binding: it has no ${named}.\n` +
				`The binding is pinned to Raven ${shortCommit(pin)}, and the library was ${built}.\n` +
				`In packages/raven-tsx, bun run raven:status says what differs, and bun run native:local packages a library of the pin.`,
		);
	}
	if (stamp) {
		console.warn(`raven-tsx: the library was ${built}, and RAVEN_VERSION says ${shortCommit(pin)}: bun run raven:status says what differs`);
	}
}
