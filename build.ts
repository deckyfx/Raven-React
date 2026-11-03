/**
 * Compiles the program into one executable holding Bun, the code, libraven.so
 * and main.xml. For this machine only: the embedded libraven.so is built for
 * one platform, so another target needs the library built there.
 */

export {};

const outfile = `./binaries/helloworld-${process.platform}-${process.arch}`;

console.log("Building helloworld");
await Bun.$`rm -rf ./binaries && mkdir -p ./binaries`;

const result = await Bun.build({
	entrypoints: ["./src/index.ts"],
	compile: {
		outfile,
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