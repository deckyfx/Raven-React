/**
 * Compiles the program into one executable holding Bun, the code, Solid and Raven's library.
 *
 *     bun run build            for this machine
 *     bun run build:windows    a Windows x64 .exe, from any machine. It needs the Windows
 *                              package of the workspace: see the message below.
 */

import { mkdirSync, rmSync } from "node:fs";
import { solidPlugin } from "@decky.fx/raven-tsx/solid/plugin";

const windows = process.argv.includes("--windows");
// (on Windows Bun adds .exe to the name by itself, so the name must already have it)
const outfile = windows ? "./binaries/solid-helloworld-windows-x64.exe" : `./binaries/solid-helloworld-${process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`;

if (windows && !(await Bun.file("../../node_modules/@decky.fx/raven-tsx-win32-x64/raven.dll").exists())) {
	// the executable would still compile, and only fail when it starts on Windows
	console.error("raven.dll is not in the workspace. First: cd ../../packages/raven-tsx && bun run native:windows && bun install");
	process.exit(1);
}

console.log(`Building ${outfile}`);
mkdirSync("./binaries", { recursive: true });
rmSync(outfile, { force: true });

const result = await Bun.build({
	entrypoints: ["./src/index.tsx"],
	// (the TSX is Solid's, and Solid's build for clients goes in: as bunfig.toml's preload does for bun run)
	plugins: [solidPlugin()],
	compile: {
		outfile,
		...(windows ? { target: "bun-windows-x64" as const, windows: { hideConsole: true } } : {}),
		// The binary must behave the same wherever it runs, whatever .env is there.
		autoloadDotenv: false,
		autoloadBunfig: false,
	},
	minify: true,
});

if (!result.success) {
	for (const log of result.logs) {
		console.error(log.message);
	}
	process.exit(1);
}

console.log(`${outfile} (${(Bun.file(outfile).size / 1024 / 1024).toFixed(1)} MB)`);

// export blank to surpress vscode complain about top level await
export {}
