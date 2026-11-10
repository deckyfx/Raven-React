/**
 * Optional props take `undefined`: an application with `exactOptionalPropertyTypes` compiles these
 * sources with that setting, and passes a value that may be `undefined`, as React's own types allow.
 */

import { expect, test } from "bun:test";
import { Glob } from "bun";
import { acceptUndefined, missingUndefined } from "../../tools/optional-undefined";

const SOURCES = `${import.meta.dir}/../..`;

test("an optional property gets | undefined, a function type in parentheses", () => {
	expect(acceptUndefined("interface A { readonly Name?: string; readonly OnClick?: () => void }")).toBe(
		"interface A { readonly Name?: string | undefined; readonly OnClick?: (() => void) | undefined }",
	);
});

test("nested and mapped types are each given it, and -? is left alone", () => {
	expect(acceptUndefined("type A = { readonly Pen?: { readonly Size?: number }; readonly Glass?: { readonly [K in Keys]?: number } };")).toBe(
		"type A = { readonly Pen?: { readonly Size?: number | undefined } | undefined; readonly Glass?: { readonly [K in Keys]?: number | undefined } | undefined };",
	);
	const required = "type B<P> = { [K in keyof P]-?: K };";
	expect(acceptUndefined(required)).toBe(required);
});

test("a type that already takes undefined, and a required property, are not changed", () => {
	const text = "interface A { readonly Name?: string | undefined; readonly Size: number }";
	expect(acceptUndefined(text)).toBe(text);
});

test("every optional prop of the published sources takes undefined", async () => {
	const missing: string[] = [];
	for (const path of new Glob("{core,react}/*.ts").scanSync(SOURCES)) {
		const text = await Bun.file(`${SOURCES}/${path}`).text();
		missing.push(...missingUndefined(text, path).map((one) => `${path}:${one.line} ${one.name}`));
	}
	expect(missing).toEqual([]);
});
