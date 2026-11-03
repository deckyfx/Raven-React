/**
 * Points the Raven binding at the shared library. `bun build --compile` embeds
 * the file in the executable, so the binary needs no libraven.so beside it.
 *
 * The binding opens the library as soon as it is imported: import this first.
 */

import library from "../../../raven/build-shared/libraven.so" with { type: "file" };

process.env.RAVEN_LIBRARY ??= library;
