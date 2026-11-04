/**
 * Makes the package of this platform from a Raven you built, for the workspace: applications
 * then find it the same way they find a published one, and `bun build --compile` embeds it.
 *
 *     cmake -S raven -B raven/build-shared -DCMAKE_BUILD_TYPE=Release -DRAVEN_BUILD_SHARED=ON
 *     cmake --build raven/build-shared --parallel
 *     bun run native:local
 *
 * `--raven-build <folder>` says where the library is built, if not in the raven folder beside this repo.
 */

import { TARGETS, targetOf, writePlatformPackage } from "./targets";
import manifest from "../../package.json";

const root = `${import.meta.dir}/../..`;
const raven = `${root}/../../../../raven`;
const target = `${process.platform}-${process.arch}`;
const { library } = targetOf(target);

const index = process.argv.indexOf("--raven-build");
const build = (index >= 0 ? process.argv[index + 1] : undefined) ?? `${raven}/build-shared`;
const found = [`${build}/${library}`, `${build}/bin/${library}`, `${build}/Release/${library}`, `${build}/bin/Release/${library}`];
let libraryPath: string | undefined;
for (const path of found) {
	if (await Bun.file(path).exists()) {
		libraryPath = path;
		break;
	}
}
if (!libraryPath) {
	console.error(`no ${library} in ${build}: build Raven with -DRAVEN_BUILD_SHARED=ON. Known targets: ${Object.keys(TARGETS).join(", ")}`);
	process.exit(1);
}

await writePlatformPackage({ mainName: manifest.name, version: manifest.version, target, libraryPath, directory: `${root}/native/${target}` });
console.log(`native/${target} from ${libraryPath}. Run bun install to link it.`);
