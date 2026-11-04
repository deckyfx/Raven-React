/**
 * Makes the npm package of a platform from a built library. Run by the release workflow.
 *
 *     bun run pack:platform --target linux-x64 --lib path/to/libraven.so --raven path/to/raven --out dist/npm
 */

import { hostTarget, makeStamp, mismatchOf, readPin } from "./raven-pin";
import { argument, packageName, writePlatformPackage } from "./targets";
import manifest from "../../package.json";

const target = argument("target");
const raven = argument("raven");
const pin = await readPin();
const mismatch = mismatchOf(raven, pin);
if (mismatch) {
	console.error(mismatch);
	process.exit(1);
}
await writePlatformPackage({
	mainName: manifest.name,
	version: manifest.version,
	target,
	libraryPath: argument("lib"),
	directory: `${argument("out")}/${target}`,
	licensesFrom: raven,
	stamp: await makeStamp({ library: argument("lib"), checkout: raven, pin, verified: true, canOpen: target === hostTarget() }),
});
console.log(`${packageName(manifest.name, target)}@${manifest.version}`);
