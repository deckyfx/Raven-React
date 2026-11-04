/**
 * Copies the Bun binding of a Raven checkout to `src/vendor`: it is not on npm, so this package
 * carries the one of the Raven it is pinned to (`RAVEN_VERSION`).
 *
 *     bun run sync-binding --raven ../../raven           copies it
 *     bun run sync-binding --raven ../../raven --check   fails if the copy differs
 */

import { argument } from "./targets";

const source = `${argument("raven")}/bindings/bun/src/raven.ts`;
const copy = `${import.meta.dir}/../vendor/raven.ts`;
const wanted = await Bun.file(source).text();

if (process.argv.includes("--check")) {
	if ((await Bun.file(copy).text()) !== wanted) {
		console.error(`src/vendor/raven.ts differs from ${source}: run bun run sync-binding`);
		process.exit(1);
	}
	console.log("src/vendor/raven.ts matches");
} else {
	await Bun.write(copy, wanted);
	console.log(`src/vendor/raven.ts from ${source}`);
}
