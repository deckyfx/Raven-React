/**
 * Makes the npm package of a platform from a built library. Run by the release workflow.
 *
 *     bun run pack:platform --target linux-x64 --lib path/to/libraven.so --raven path/to/raven --out dist/npm [--addon path/to/raven_napi.node]
 *
 * `--addon` is the addon of Raven's Node.js binding, built from the same checkout: without it, the
 * package works on Bun only.
 */

import { git, hostTarget, makeStamp, mismatchOf, provenanceProblem, readPin } from "./raven-pin";
import { argument, optionalArgument, packageName, writePlatformPackage } from "./targets";
import manifest from "../../package.json";

const target = argument("target");
const raven = argument("raven");
const library = argument("lib");
const pin = await readPin();
const commitSeconds = Number(git(raven, "log", "-1", "--format=%ct", "HEAD") ?? Number.NaN);
// (the stamp says this library is the pin, and then nothing checks it again: it must hold)
const problem = mismatchOf(raven, pin) ?? provenanceProblem(library, raven, Bun.file(library).lastModified, commitSeconds * 1000);
if (problem) {
	console.error(problem);
	process.exit(1);
}
await writePlatformPackage({
	mainName: manifest.name,
	version: manifest.version,
	target,
	libraryPath: library,
	addonPath: optionalArgument("addon"),
	directory: `${argument("out")}/${target}`,
	licensesFrom: raven,
	stamp: await makeStamp({ library, checkout: raven, pin, verified: true, canOpen: target === hostTarget() }),
});
console.log(`${packageName(manifest.name, target)}@${manifest.version}`);
