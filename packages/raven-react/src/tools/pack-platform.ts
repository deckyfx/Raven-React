/**
 * Makes the npm package of a platform from a built library. Run by the release workflow.
 *
 *     bun run pack:platform --target linux-x64 --lib path/to/libraven.so --raven path/to/raven --out dist/npm
 */

import { argument, packageName, writePlatformPackage } from "./targets";
import manifest from "../../package.json";

const target = argument("target");
await writePlatformPackage({
	mainName: manifest.name,
	version: manifest.version,
	target,
	libraryPath: argument("lib"),
	directory: `${argument("out")}/${target}`,
	licensesFrom: argument("raven"),
});
console.log(`${packageName(manifest.name, target)}@${manifest.version}`);
