/**
 * Finds Raven's native library and says where it is, before the binding opens it.
 *
 * It comes in a package per platform, listed in `optionalDependencies`: the package manager
 * installs the one that fits, without an install script (Bun does not run those by default).
 * `RAVEN_LIBRARY` set by hand has priority, to try another build.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { checkLibrary } from "./library-check";

/** What a package of a platform exports: the path of its library. */
interface PlatformPackage {
	readonly default: string;
}

/**
 * The library of this platform, or nothing when its package is not installed.
 *
 * These `require` calls are literal, and inside `try`, on purpose: `bun build --compile` embeds
 * what it can resolve, and takes an unresolved `require` in a `try` as optional. An `import()`
 * of a package of another platform would stop the build.
 */
function findPackagedLibrary(): string | undefined {
	let found: PlatformPackage | undefined;
	try {
		switch (`${process.platform}-${process.arch}`) {
			case "linux-x64":
				found = require("@decky.fx/raven-tsx-linux-x64");
				break;
			case "linux-arm64":
				found = require("@decky.fx/raven-tsx-linux-arm64");
				break;
			case "darwin-arm64":
				found = require("@decky.fx/raven-tsx-darwin-arm64");
				break;
			case "darwin-x64":
				found = require("@decky.fx/raven-tsx-darwin-x64");
				break;
			case "win32-x64":
				found = require("@decky.fx/raven-tsx-win32-x64");
				break;
		}
	} catch {
		// not installed: said below, with what to do about it
	}
	return found?.default;
}

/**
 * A path the system can load. In a Windows executable the library is inside the file, at
 * `B:/~BUN/...`, which `dlopen` cannot open: it is written to the temporary folder first,
 * under a name made from its content. Bun does this by itself on Linux.
 *
 * Synchronous on purpose: a top-level `await` here would not hold back the binding, which
 * is imported beside this module and does not depend on it.
 */
function loadablePath(path: string): string {
	if (!path.startsWith("B:/~BUN/")) {
		return path;
	}
	const bytes = readFileSync(path);
	const extracted = `${tmpdir()}\\raven-tsx-${Bun.hash(bytes).toString(16)}.dll`;
	if (Bun.file(extracted).size !== bytes.length) {
		writeFileSync(extracted, bytes);
	}
	return extracted;
}

if (!process.env["RAVEN_LIBRARY"]) {
	const packaged = findPackagedLibrary();
	if (!packaged) {
		throw new Error(
			`raven-tsx: no native library for ${process.platform}-${process.arch}. ` +
				`Install @decky.fx/raven-tsx-${process.platform}-${process.arch}, or set RAVEN_LIBRARY to the path of a library you built.`,
		);
	}
	process.env["RAVEN_LIBRARY"] = loadablePath(packaged);
}

checkLibrary(process.env["RAVEN_LIBRARY"] ?? "");
