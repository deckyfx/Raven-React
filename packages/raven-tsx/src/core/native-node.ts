/**
 * Finds Raven's native library and its Node.js addon, and says where they are before Raven's
 * Node.js binding opens them: the counterpart of `native.ts` for Node.js.
 *
 * Both come in the package of the platform, as on Bun. It is found by resolving it, not imported:
 * synchronous, as a top-level `await` here would not hold back the binding, imported beside this.
 * `RAVEN_LIBRARY` and `RAVEN_ADDON` set by hand have priority, to try other builds.
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { checkLibrary } from "./library-check";

/** The file of the library in the package of a platform. */
const LIBRARY_FILE: Readonly<Record<string, string>> = { linux: "libraven.so", darwin: "libraven.dylib", win32: "raven.dll" };
/** The file of the addon in the package of a platform. */
const ADDON_FILE = "raven_napi.node";

/** The folder of the package of this platform, or nothing when it is not installed. */
function packagedFolder(): string | undefined {
	try {
		return dirname(createRequire(import.meta.url).resolve(`@decky.fx/raven-tsx-${process.platform}-${process.arch}`));
	} catch {
		return undefined;
	}
}

if (!process.env["RAVEN_LIBRARY"] || !process.env["RAVEN_ADDON"]) {
	const folder = packagedFolder();
	const library = LIBRARY_FILE[process.platform];
	if (!folder || !library) {
		throw new Error(
			`raven-tsx: no native library for ${process.platform}-${process.arch}. ` +
				`Install @decky.fx/raven-tsx-${process.platform}-${process.arch}, or set RAVEN_LIBRARY and RAVEN_ADDON to builds of your own.`,
		);
	}
	process.env["RAVEN_LIBRARY"] ??= join(folder, library);
	process.env["RAVEN_ADDON"] ??= join(folder, ADDON_FILE);
}

checkLibrary(process.env["RAVEN_LIBRARY"] ?? "");
