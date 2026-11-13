/**
 * Copies the bindings of Raven to `src/vendor`, for Bun and for Node.js: they are not on npm, so
 * this package carries those of the Raven it is pinned to (`RAVEN_VERSION`). It is taken from that commit, whatever the
 * checkout holds, and refused while the packaged library lacks what it needs: the binding opens
 * every function when it loads, so that would stop every application from starting.
 *
 *     bun run sync-binding [--raven ../../../../raven]          copies it
 *     bun run sync-binding [--raven ../../../../raven] --check  fails if the copy differs
 */

import { functionsOfBinding, missingFunctions } from "../core/library-check";
import { relative } from "node:path";
import { checkoutPath, commitOf, fail, fileAt, flag, hostTarget, PACKAGE_ROOT, readPin, sameLines, VENDORED_BINDINGS } from "./raven-pin";
import { targetOf } from "./targets";

const checkout = checkoutPath();
const pin = await readPin();
const commit = commitOf(checkout, pin) ?? fail(`${checkout} does not have ${pin}, which RAVEN_VERSION says: git -C ${checkout} fetch upstream`);
const copies = VENDORED_BINDINGS.map(({ inRaven, copy }) => ({ copy, wanted: fileAt(checkout, commit, inRaven) ?? fail(`${pin} has no ${inRaven}`) }));
const wanted = copies[0]?.wanted ?? "";

if (flag("check")) {
	for (const { copy, wanted: text } of copies) {
		const file = Bun.file(copy);
		if (!(await file.exists()) || sameLines(await file.text()) !== sameLines(text)) {
			fail(`${relative(PACKAGE_ROOT, copy)} is not the one of ${pin}: run bun run sync-binding`);
		}
	}
	console.log(`the bindings in src/vendor are those of ${pin}`);
} else {
	const library = Bun.file(`${PACKAGE_ROOT}/native/${hostTarget()}/${targetOf(hostTarget()).library}`);
	if ((await library.exists()) && !flag("force")) {
		const missing = missingFunctions(functionsOfBinding(wanted), Buffer.from(await library.arrayBuffer()));
		if (missing.length > 0) {
			fail(`the packaged library has no ${missing.slice(0, 3).join(", ")}: rebuild Raven and run bun run native:local first, or every application stops at startup. bun run raven:update does all of it in order.`);
		}
	}
	for (const { copy, wanted: text } of copies) {
		await Bun.write(copy, text);
	}
	console.log(`the bindings in src/vendor from ${pin}`);
}
