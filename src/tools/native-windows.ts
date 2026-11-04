/**
 * Cross-builds raven.dll on Linux with MinGW-w64, and makes the Windows package of the workspace
 * from it. An application can then compile a Windows executable here:
 *
 *     bun run native:windows
 *     bun install
 *
 * `-static` keeps libwinpthread and libgcc inside the DLL: most Windows machines do not have them.
 */

import { writePlatformPackage } from "./targets";
import manifest from "../../package.json";

const root = `${import.meta.dir}/../..`;
const raven = `${root}/../../raven`;
const build = `${raven}/build-windows`;

if (!Bun.which("x86_64-w64-mingw32-gcc")) {
	console.error("x86_64-w64-mingw32-gcc not found: install MinGW-w64 (Debian, Ubuntu: sudo apt install mingw-w64)");
	process.exit(1);
}

await Bun.$`cmake -S ${raven} -B ${build} --toolchain ${root}/cmake/mingw-w64.cmake -DCMAKE_BUILD_TYPE=Release -DRAVEN_BUILD_SHARED=ON -DRAVEN_BUILD_TESTS=OFF -DRAVEN_BUILD_EXAMPLES=OFF -DRAVEN_BUILD_TOOLS=OFF -DCMAKE_SHARED_LINKER_FLAGS=${"-static-libgcc -static"}`.quiet();
await Bun.$`cmake --build ${build} --parallel`.quiet();

await writePlatformPackage({
	mainName: manifest.name,
	version: manifest.version,
	target: "win32-x64",
	libraryPath: `${build}/bin/raven.dll`,
	directory: `${root}/native/win32-x64`,
});
console.log(`native/win32-x64 from ${build}/bin/raven.dll. Run bun install to link it.`);
