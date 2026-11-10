/**
 * Installs the packages as npm would give them to an application, and compiles one with the strict
 * settings an application can choose: the sources are TypeScript, so they are compiled with its
 * settings, and skipLibCheck does not skip them. Then loads the library from the platform package.
 *
 *     bun run check:consumer --platform <folder of pack:platform for this machine>
 *
 * The main package is made here, by prepare:publish. The application is the Hello World example,
 * with a file that passes `undefined` to optional props (`exactOptionalPropertyTypes`).
 */

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import ts from "typescript";
import manifest from "../../package.json";
import { argument } from "./targets";

// (absolute: a path that holds ".." fails on Windows in some of what is done with it)
const root = resolve(`${import.meta.dir}/../..`);
const platform = resolve(argument("platform"));
const work = mkdtempSync(`${tmpdir()}/raven-tsx-consumer-`);

/** Runs a command in a folder, and stops with its output if it fails. Returns what it printed. */
async function run(command: readonly string[], cwd: string): Promise<string> {
	const child = Bun.spawn([...command], { cwd, stdout: "pipe", stderr: "pipe" });
	const [output, errors, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	if (code !== 0) {
		console.error(`check:consumer: ${command.join(" ")} failed in ${cwd}:\n${output}${errors}`);
		process.exit(1);
	}
	return output;
}

/** Packs a package folder as npm would, and returns the path of its tarball. */
async function pack(folder: string): Promise<string> {
	const name = (await run(["bun", "pm", "pack", "--quiet", "--destination", work], folder)).trim().split("\n").at(-1) ?? "";
	return name.startsWith("/") || /^[A-Za-z]:[\\/]/.test(name) ? name : `${work}/${name}`;
}

/** The compiler options of this package, which say what the sources must pass. */
function strictOptions(): Record<string, boolean> {
	const read = ts.readConfigFile(`${root}/tsconfig.json`, ts.sys.readFile);
	const options: Record<string, unknown> = read.config?.compilerOptions ?? {};
	return Object.fromEntries(Object.entries(options).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
}

try {
	await run(["bun", "run", "src/tools/prepare-publish.ts", "--out", `${work}/npm`], root);
	const main = await pack(`${work}/npm/main`);
	const native = await pack(platform);
	const nativeName = (await Bun.file(`${platform}/package.json`).json()).name as string;

	const app = `${work}/app`;
	await Bun.write(
		`${app}/package.json`,
		JSON.stringify(
			{
				name: "consumer",
				private: true,
				type: "module",
				dependencies: { [manifest.name]: `file:${main}`, react: manifest.devDependencies.react, "react-reconciler": manifest.devDependencies["react-reconciler"] },
				// (the platform package of this machine is the one just made, not one on npm)
				overrides: { [nativeName]: `file:${native}` },
				devDependencies: { "@types/bun": manifest.devDependencies["@types/bun"], typescript: manifest.devDependencies.typescript },
			},
			null,
			2,
		),
	);
	// (what bun init writes, and every setting this package holds its sources to)
	await Bun.write(
		`${app}/tsconfig.json`,
		JSON.stringify(
			{
				compilerOptions: {
					lib: ["ESNext"],
					target: "ESNext",
					module: "Preserve",
					moduleDetection: "force",
					jsx: "react-jsx",
					allowJs: true,
					types: ["bun"],
					moduleResolution: "bundler",
					allowImportingTsExtensions: true,
					verbatimModuleSyntax: true,
					noEmit: true,
					skipLibCheck: true,
					noUncheckedIndexedAccess: true,
					...strictOptions(),
				},
				include: ["src"],
			},
			null,
			2,
		),
	);
	cpSync(`${root}/../../examples/helloworld/src`, `${app}/src`, { recursive: true });
	await Bun.write(
		`${app}/src/optional.tsx`,
		[
			'import { defineTheme } from "@decky.fx/raven-tsx";',
			'import { Button, Label, VBox } from "@decky.fx/raven-tsx/react";',
			"",
			"/** Optional props given a value that may be undefined, as `exactOptionalPropertyTypes` checks them. */",
			"export function Optional(props: { readonly tip?: string | undefined; readonly onClick?: (() => void) | undefined }) {",
			"\treturn (",
			'\t\t<VBox Name="optional" Tooltip={props.tip}>',
			"\t\t\t<Button OnClicked={props.onClick}>ok</Button>",
			'\t\t\t<Label Slot={{ Title: props.tip }}>text</Label>',
			"\t\t</VBox>",
			"\t);",
			"}",
			"",
			'export const theme = defineTheme({ Name: "optional", Accent: undefined, Styles: [{ Widget: "Button", Class: undefined }] });',
			"",
		].join("\n"),
	);

	await run(["bun", "install"], app);
	console.log(`installed ${manifest.name} and ${nativeName} from their tarballs`);
	await run(["bun", "check", "--all"], app);
	console.log(`the application compiles with ${Object.keys(strictOptions()).join(", ")}`);
	const loaded = await run(["bun", "-e", `import { raven } from "${manifest.name}"; console.log(raven.Rget_version());`], app);
	console.log(`the library loads from ${nativeName}: Raven ${loaded.trim()}`);
} finally {
	rmSync(work, { recursive: true, force: true });
}
