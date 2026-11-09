/**
 * Makes the package of this platform from a Raven you built, for the workspace: applications
 * then find it the same way they find a published one, and `bun build --compile` embeds it.
 *
 *     cmake -S raven -B raven/build-shared -DCMAKE_BUILD_TYPE=Release -DRAVEN_BUILD_SHARED=ON
 *     bun run native:local
 *
 * The library must be the Raven of `RAVEN_VERSION`, and nothing in the file says which commit it
 * is: so this asks CMake which checkout the build folder belongs to, stops unless that checkout
 * is at the pin with no changes, and brings the build up to date before taking the library. What
 * it found goes in `raven.json`, beside the library.
 *
 * `--raven-build <folder>` says where the library is built, if not in the raven folder beside this repo.
 * `--allow-mismatch` packages whatever is there, to try a change: `raven:check` then says so.
 */

import { packageHostLibrary, flag, option, readPin, checkoutPath } from "./raven-pin";

const build = option("raven-build") ?? `${checkoutPath()}/build-shared`;
await packageHostLibrary({ build, pin: await readPin(), allowMismatch: flag("allow-mismatch") });
