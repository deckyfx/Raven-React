/**
 * Makes the main npm package: the sources without tests or tools, and the packages of the
 * platforms as optional dependencies, at the same version. Run by the release workflow.
 *
 *     bun run prepare:publish --out dist/npm
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { argument, packageName, TARGETS } from "./targets";
import manifest from "../../package.json";

// (absolute: removing a path that holds ".." fails on Windows, in Bun.$ and in rmSync)
const root = resolve(`${import.meta.dir}/../..`);
const directory = resolve(`${argument("out")}/main`);

// (npm's provenance refuses a package that names another repository than the one publishing it: said here, before any package goes out)
const publishing = Bun.env["GITHUB_REPOSITORY"];
if (publishing && manifest.repository.url !== `git+https://github.com/${publishing}.git`) {
	console.error(`prepare:publish: package.json names ${manifest.repository.url}, but ${publishing} is publishing it`);
	process.exit(1);
}

// (node:fs and not Bun's shell, whose cp takes no -r on Windows)
rmSync(directory, { recursive: true, force: true });
mkdirSync(directory, { recursive: true });
cpSync(`${root}/src`, `${directory}/src`, { recursive: true });
rmSync(`${directory}/src/test`, { recursive: true, force: true });
rmSync(`${directory}/src/tools`, { recursive: true, force: true });
for (const name of ["README.md", "LICENSE", "NOTICE", "RAVEN_VERSION"]) {
	await Bun.write(`${directory}/${name}`, Bun.file(`${root}/${name}`));
}

const { scripts: _scripts, devDependencies: _devDependencies, ...published } = manifest;
const optionalDependencies = Object.fromEntries(Object.keys(TARGETS).map((target) => [packageName(manifest.name, target), manifest.version]));
await Bun.write(`${directory}/package.json`, `${JSON.stringify({ ...published, files: ["src", "RAVEN_VERSION", "NOTICE"], optionalDependencies }, null, 2)}\n`);
console.log(`${manifest.name}@${manifest.version}, with ${Object.keys(optionalDependencies).length} platforms`);
