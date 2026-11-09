/**
 * Copies the Bun binding of Raven to `src/vendor`: it is not on npm, so this package carries the
 * one of the Raven it is pinned to (`RAVEN_VERSION`). It is taken from that commit, whatever the
 * checkout holds, and refused while the packaged library lacks what it needs: the binding opens
 * every function when it loads, so that would stop every application from starting.
 *
 *     bun run sync-binding [--raven ../../../../raven]          copies it
 *     bun run sync-binding [--raven ../../../../raven] --check  fails if the copy differs
 */

import { functionsOfBinding, missingFunctions } from "../core/library-check";
import { checkoutPath, commitOf, fail, fileAt, flag, hostTarget, PACKAGE_ROOT, readPin, sameLines } from "./raven-pin";
import { targetOf } from "./targets";

const checkout = checkoutPath();
const pin = await readPin();
const commit = commitOf(checkout, pin) ?? fail(`${checkout} does not have ${pin}, which RAVEN_VERSION says: git -C ${checkout} fetch upstream`);
const wanted = fileAt(checkout, commit, "bindings/bun/src/raven.ts") ?? fail(`${pin} has no bindings/bun/src/raven.ts`);
const copy = `${PACKAGE_ROOT}/src/vendor/raven.ts`;

if (flag("check")) {
	if (sameLines(await Bun.file(copy).text()) !== sameLines(wanted)) {
		fail(`src/vendor/raven.ts is not the one of ${pin}: run bun run sync-binding`);
	}
	console.log(`src/vendor/raven.ts is the one of ${pin}`);
} else {
	const library = Bun.file(`${PACKAGE_ROOT}/native/${hostTarget()}/${targetOf(hostTarget()).library}`);
	if ((await library.exists()) && !flag("force")) {
		const missing = missingFunctions(functionsOfBinding(wanted), Buffer.from(await library.arrayBuffer()));
		if (missing.length > 0) {
			fail(`the packaged library has no ${missing.slice(0, 3).join(", ")}: rebuild Raven and run bun run native:local first, or every application stops at startup. bun run raven:update does all of it in order.`);
		}
	}
	await Bun.write(copy, wanted);
	console.log(`src/vendor/raven.ts from ${pin}`);
}
