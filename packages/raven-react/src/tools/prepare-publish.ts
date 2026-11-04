/**
 * Makes the main npm package: the sources without tests or tools, and the packages of the
 * platforms as optional dependencies, at the same version. Run by the release workflow.
 *
 *     bun run prepare:publish --out dist/npm
 */

import { argument, packageName, TARGETS } from "./targets";
import manifest from "../../package.json";

const root = `${import.meta.dir}/../..`;
const directory = `${argument("out")}/main`;

await Bun.$`rm -rf ${directory} && mkdir -p ${directory}`;
await Bun.$`cp -r ${root}/src ${directory}/src`;
await Bun.$`rm -rf ${directory}/src/test ${directory}/src/tools`;
for (const name of ["README.md", "LICENSE", "NOTICE", "RAVEN_VERSION"]) {
	await Bun.write(`${directory}/${name}`, Bun.file(`${root}/${name}`));
}

const { scripts: _scripts, devDependencies: _devDependencies, ...published } = manifest;
const optionalDependencies = Object.fromEntries(Object.keys(TARGETS).map((target) => [packageName(manifest.name, target), manifest.version]));
await Bun.write(`${directory}/package.json`, `${JSON.stringify({ ...published, files: ["src", "RAVEN_VERSION", "NOTICE"], optionalDependencies }, null, 2)}\n`);
console.log(`${manifest.name}@${manifest.version}, with ${Object.keys(optionalDependencies).length} platforms`);
