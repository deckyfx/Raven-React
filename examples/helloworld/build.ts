/**
 * Compiles the program into one executable holding Bun, the code, React and Raven's library.
 *
 *     bun run build            for this machine
 *     bun run build:windows    a Windows x64 .exe, from any machine. It needs the Windows
 *                              package of the workspace: see the message below.
 */

const windows = process.argv.includes("--windows");
const outfile = windows ? "./binaries/helloworld-windows-x64.exe" : `./binaries/helloworld-${process.platform}-${process.arch}`;

if (windows && !(await Bun.file("../../node_modules/@deckyfx/raven-react-win32-x64/raven.dll").exists())) {
	// the executable would still compile, and only fail when it starts on Windows
	console.error("raven.dll is not in the workspace. First: cd ../../packages/raven-react && bun run native:windows && bun install");
	process.exit(1);
}

console.log(`Building ${outfile}`);
await Bun.$`mkdir -p ./binaries && rm -f ${outfile}`;

const result = await Bun.build({
	entrypoints: ["./src/index.tsx"],
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
