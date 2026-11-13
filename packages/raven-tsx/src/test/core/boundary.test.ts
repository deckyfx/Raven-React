/**
 * The core knows only Raven: it may not reach a framework, or an adapter of this package. Imported
 * for a type counts too, so the source is what is read here, not what Bun would keep of it.
 */

import { expect, test } from "bun:test";

const CORE = `${import.meta.dir}/../../core`;

/** What the core may not import: a framework, or a folder of an adapter. */
const FORBIDDEN = /^(?:react|react-reconciler|solid-js)(?:\/|$)|^(?:\.\.\/)+(?:react|solid)(?:\/|$)|^\.\/(?:react|solid)(?:\/|$)/;

/** Every kind of import in a source: `from "x"`, `import "x"`, `import("x")`, `require("x")`. */
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

/** The modules a source imports that the core may not. */
function forbiddenImports(source: string): string[] {
	return Array.from(source.matchAll(IMPORT), (match) => match[1] ?? "").filter((name) => FORBIDDEN.test(name));
}

test("the check sees every way of importing a framework", () => {
	for (const line of [
		'import { useState } from "react";',
		'import type { ReactNode } from "react";',
		'export type { ReactNode } from "react";',
		'import ReactReconciler from "react-reconciler";',
		'import { DefaultEventPriority } from "react-reconciler/constants.js";',
		'import { createSignal } from "solid-js";',
		'import "react";',
		'const dynamic = await import("solid-js/universal");',
		'const required = require("react");',
		'import { WidgetInstance } from "../react/root";',
	]) {
		expect(`${line}: ${forbiddenImports(line).length}`).toBe(`${line}: 1`);
	}
	expect(forbiddenImports('import * as r from "./raven";\nimport { dlopen } from "bun:ffi";\nimport "../vendor/raven";')).toEqual([]);
});

test("nothing in the core imports a framework or an adapter", async () => {
	const files = await Array.fromAsync(new Bun.Glob("**/*.ts").scan({ cwd: CORE }));
	expect(files.length).toBeGreaterThan(10);
	const found: string[] = [];
	for (const file of files) {
		found.push(...forbiddenImports(await Bun.file(`${CORE}/${file}`).text()).map((name) => `${file}: ${name}`));
	}
	expect(found).toEqual([]);
});

test("importing the core loads no framework", () => {
	const script = `await import(${JSON.stringify(`${CORE}/index.ts`)}); const loaded = Object.keys(require.cache); console.log(loaded.some((path) => /core[\\\\/]index\\.ts$/.test(path))); console.log(loaded.filter((path) => /node_modules[\\\\/](react|react-reconciler|solid-js)[\\\\/]/.test(path)).join(","));`;
	const run = Bun.spawnSync(["bun", "-e", script], { stdout: "pipe", stderr: "pipe" });
	expect(run.stderr.toString()).toBe("");
	expect(run.success).toBe(true);
	const [seesTheCore, frameworks] = run.stdout.toString().split(/\r?\n/);
	// (the list of what was loaded has the core in it: an empty answer below means something)
	expect(seesTheCore).toBe("true");
	expect(frameworks).toBe("");
});
