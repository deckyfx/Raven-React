/**
 * The pin of Raven, and the checks of everything that must agree with it. `RAVEN_VERSION` is the
 * one place that says which Raven this is: a full commit, or a tag. The rest is shared by
 * `raven:status`, `raven:check`, `raven:update`, `native:local` and `sync-binding`.
 */

import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { functionsOfBinding, missingFunctions, readStamp, shortCommit, STAMP_FILE, type LibraryStamp } from "../core/library-check";
import { parseApi, type RavenApi } from "./raven-api";
import { TARGETS, targetOf, writePlatformPackage } from "./targets";

/** The folder of this package. */
export const PACKAGE_ROOT = resolve(import.meta.dir, "../..");
const PIN_FILE = `${PACKAGE_ROOT}/RAVEN_VERSION`;
const BINDING_FILE = `${PACKAGE_ROOT}/src/vendor/raven.ts`;
const BINDING_IN_RAVEN = "bindings/bun/src/raven.ts";
/** What decides what a library holds. A change anywhere else does not make it another library. */
const BUILD_PATHS = ["src", "include", "third_party", "cmake", "CMakeLists.txt", "bindings/bun"];

/** The value after `--name`. */
export function option(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Whether `--name` was given. */
export const flag = (name: string): boolean => process.argv.includes(`--${name}`);

/** Says what is wrong and stops. */
export function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

/** The Raven checkout: `--raven`, or the folder beside this repository. */
export const checkoutPath = (): string => resolve(option("raven") ?? `${PACKAGE_ROOT}/../../../../raven`);

/** The answer of git without what ends it, or null when it fails. */
export function git(checkout: string, ...args: readonly string[]): string | null {
	const result = Bun.spawnSync(["git", "-C", checkout, ...args], { stdout: "pipe", stderr: "ignore" });
	return result.success ? result.stdout.toString().trim() : null;
}

/** A file of a commit, as it is. */
export function fileAt(checkout: string, commit: string, path: string): string | null {
	const result = Bun.spawnSync(["git", "-C", checkout, "show", `${commit}:${path}`], { stdout: "pipe", stderr: "ignore" });
	return result.success ? result.stdout.toString() : null;
}

/** A text without what git may have done to its lines on Windows. */
export const sameLines = (text: string): string => text.replace(/\r\n/g, "\n");

/** What `RAVEN_VERSION` says: a full commit, or a tag. */
export async function readPin(): Promise<string> {
	const pin = (await Bun.file(PIN_FILE).text()).trim();
	// (a short commit would work here and fail in CI: actions/checkout takes a whole one or a name)
	if (/^[0-9a-f]+$/.test(pin) && pin.length !== 40) {
		fail(`RAVEN_VERSION says ${pin}: a commit there must be written in full, 40 digits`);
	}
	if (!pin || /\s/.test(pin)) {
		fail(`RAVEN_VERSION must hold one commit or tag, and holds "${pin}"`);
	}
	return pin;
}

/** Writes `RAVEN_VERSION`. */
export const writePin = (pin: string): Promise<number> => Bun.write(PIN_FILE, `${pin}\n`);

/** The commit of a ref, or null. */
export const commitOf = (checkout: string, ref: string): string | null => git(checkout, "rev-parse", "--verify", "-q", `${ref}^{commit}`);

/** What a commit is called: `v0.2.1+20`. */
export function nameOf(checkout: string, commit: string): string {
	const described = git(checkout, "describe", "--tags", commit);
	const match = described?.match(/^(.+)-(\d+)-g[0-9a-f]+$/);
	return (match ? `${match[1]}+${match[2]}` : described) ?? "no tag before it";
}

/** The uncommitted changes that would make a library of this checkout another library. */
export const dirtyPaths = (checkout: string): string[] => (git(checkout, "status", "--porcelain", "--", ...BUILD_PATHS) ?? fail(`git status failed in ${checkout}`)).split("\n").filter(Boolean);

/** The API of Raven at a commit. */
export function apiAt(checkout: string, commit: string): RavenApi {
	const names = [...(git(checkout, "ls-tree", "--name-only", commit, "include/raven/") ?? "").split("\n"), "include/Raven.h", "web/include/raven_web.h"].filter((name) => name.endsWith(".h"));
	const headers = names.flatMap((name) => fileAt(checkout, commit, name) ?? []);
	return parseApi(headers, fileAt(checkout, commit, "src/xml/xml_schema.c") ?? "");
}

/** The source folder of a CMake build folder, or null when it is not one. */
export async function sourceOfBuild(build: string): Promise<string | null> {
	const cache = Bun.file(`${build}/CMakeCache.txt`);
	if (!(await cache.exists())) {
		return null;
	}
	return (await cache.text()).match(/^CMAKE_HOME_DIRECTORY:INTERNAL=(.*?)\r?$/m)?.[1] ?? null;
}

/** The SHA-256 of a file. */
export async function sha256Of(path: string): Promise<string> {
	return new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex");
}

/** What the library says of its version, or null when this machine cannot open it. */
export function versionOfLibrary(path: string): string | null {
	try {
		const { dlopen, FFIType } = require("bun:ffi") as typeof import("bun:ffi");
		const opened = dlopen(path, { Rget_version: { args: [], returns: FFIType.cstring } });
		const version = String(opened.symbols.Rget_version());
		opened.close();
		return version;
	} catch {
		return null;
	}
}

/** The version in the CMakeLists of a commit. */
function versionInSource(checkout: string, commit: string): string {
	return fileAt(checkout, commit, "CMakeLists.txt")?.match(/project\(raven VERSION ([\d.]+)/)?.[1] ?? "";
}

/** What keeps a checkout from being the pin, as text to show, or nothing. */
export function mismatchOf(checkout: string, pin: string): string | null {
	const wanted = commitOf(checkout, pin);
	if (!wanted) {
		return `the Raven checkout ${checkout} does not have ${pin}: git -C ${checkout} fetch upstream`;
	}
	const head = git(checkout, "rev-parse", "HEAD");
	if (head !== wanted) {
		return `the Raven checkout ${checkout} is at ${shortCommit(head ?? "nothing")} and RAVEN_VERSION says ${shortCommit(pin)}.\nEither git -C ${checkout} checkout ${wanted}, or move the pin: bun run raven:update ${shortCommit(head ?? "")}`;
	}
	const dirty = dirtyPaths(checkout);
	if (dirty.length > 0) {
		return `the Raven checkout ${checkout} has changes that are not in ${shortCommit(pin)}:\n  ${dirty.slice(0, 5).join("\n  ")}\nCommit or put them aside, or say --allow-mismatch to package a library that is not the pin.`;
	}
	return null;
}

/**
 * Why a library cannot be the build of a checkout, as text to show, or nothing: it must be inside
 * the checkout, and not older than its commit. A library does not say its commit, so this rules
 * out the mistakes and is not a proof. Times are in milliseconds.
 */
export function provenanceProblem(library: string, checkout: string, libraryTime: number, commitTime: number): string | null {
	const inside = relative(resolve(checkout), resolve(library));
	if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
		return `${library} is not in ${checkout}, so nothing says it was built from it`;
	}
	return libraryTime < commitTime ? `${library} is older than the commit of ${checkout}, so it was built from something else` : null;
}

/** Makes sure a build folder is up to date with its sources: then the library is that commit, and not whatever was built last. */
export async function buildLibrary(build: string): Promise<void> {
	const result = Bun.spawn(["cmake", "--build", build, "--target", "raven", "--config", "Release", "--parallel"], { stdout: "pipe", stderr: "pipe" });
	const [output, errors, code] = await Promise.all([new Response(result.stdout).text(), new Response(result.stderr).text(), result.exited]);
	if (code !== 0) {
		fail(`building ${build} failed:\n${output}${errors}`);
	}
}

/** Says what is wrong with a library for a binding, or stops. */
export async function requireFunctions(library: string, binding: string, what: string): Promise<void> {
	const missing = missingFunctions(functionsOfBinding(binding), Buffer.from(await Bun.file(library).arrayBuffer()));
	if (missing.length > 0) {
		fail(`${library} has no ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}, which ${what} needs: it was built from an older Raven`);
	}
}

/** The stamp of a library built from a checkout. */
export async function makeStamp(options: { readonly library: string; readonly checkout: string | null; readonly pin: string; readonly verified: boolean; readonly canOpen: boolean }): Promise<LibraryStamp> {
	const { library, checkout, pin, verified, canOpen } = options;
	const commit = checkout ? (git(checkout, "rev-parse", "HEAD") ?? "") : "";
	const version = (canOpen ? versionOfLibrary(library) : null) ?? (checkout && commit ? versionInSource(checkout, commit) : "");
	return { commit, pin, version, sha256: await sha256Of(library), verified };
}

/** One thing that must agree with the pin. */
export interface Finding {
	readonly name: string;
	readonly ok: boolean;
	readonly detail: string;
}

/** The native package of this machine. */
export const hostTarget = (): string => `${process.platform}-${process.arch}`;

/** The checks of the binding against the pin. */
export async function checkBinding(checkout: string, pinCommit: string): Promise<Finding> {
	const wanted = fileAt(checkout, pinCommit, BINDING_IN_RAVEN);
	if (wanted === null) {
		return { name: "binding", ok: false, detail: `${shortCommit(pinCommit)} has no ${BINDING_IN_RAVEN}` };
	}
	const same = sameLines(await Bun.file(BINDING_FILE).text()) === sameLines(wanted);
	return same
		? { name: "binding", ok: true, detail: "src/vendor/raven.ts is the one of the pin" }
		: { name: "binding", ok: false, detail: "src/vendor/raven.ts is not the one of the pin: bun run sync-binding" };
}

/** The check of a packaged library against the pin. */
export async function checkPackagedLibrary(target: string, pin: string, pinCommit: string): Promise<Finding> {
	const directory = `${PACKAGE_ROOT}/native/${target}`;
	const name = "library";
	const library = `${directory}/${targetOf(target).library}`;
	if (!existsSync(library)) {
		return { name, ok: false, detail: `no native/${target}: bun run native:local` };
	}
	const stamp = readStamp(directory);
	if (!stamp) {
		return { name, ok: false, detail: `no ${STAMP_FILE}, so nothing says what it was built from: bun run native:local` };
	}
	if ((await sha256Of(library)) !== stamp.sha256) {
		return { name, ok: false, detail: `it is not the file that was packaged: bun run native:local` };
	}
	if (!stamp.verified) {
		return { name, ok: false, detail: `packaged with --allow-mismatch, from ${shortCommit(stamp.commit) || "an unknown commit"}` };
	}
	if (stamp.commit !== pinCommit) {
		return { name, ok: false, detail: `built from ${shortCommit(stamp.commit)}: bun run native:local` };
	}
	const binding = await Bun.file(BINDING_FILE).text();
	const missing = missingFunctions(functionsOfBinding(binding), Buffer.from(await Bun.file(library).arrayBuffer()));
	if (missing.length > 0) {
		return { name, ok: false, detail: `it has no ${missing.slice(0, 3).join(", ")}: rebuild Raven, then bun run native:local` };
	}
	return { name, ok: true, detail: `built from ${shortCommit(stamp.commit)}, Rget_version ${stamp.version}${stamp.pin === pin ? "" : `, packaged for ${shortCommit(stamp.pin)}`}` };
}

/** The packages of other platforms: they are made elsewhere, so what they are is only said. */
export function otherPackages(pinCommit: string): string[] {
	const folder = `${PACKAGE_ROOT}/native`;
	const others = existsSync(folder) ? readdirSync(folder).filter((name) => name !== hostTarget() && name in TARGETS) : [];
	return others.map((target) => {
		const stamp = readStamp(`${folder}/${target}`);
		const state = !stamp ? "no stamp" : stamp.commit === pinCommit ? "at the pin" : `built from ${shortCommit(stamp.commit)}`;
		return `${target}: ${state}`;
	});
}

/** The check of the generated components: whether generating them again changes them. */
export function checkComponents(): Finding {
	const run = Bun.spawnSync(["bun", "run", "src/tools/generate-components.ts", "--check"], { cwd: PACKAGE_ROOT, stdout: "pipe", stderr: "pipe" });
	return run.success
		? { name: "components", ok: true, detail: "the generated props and components are what the library and the event tables give" }
		: { name: "components", ok: false, detail: run.stderr.toString().trim() || run.stdout.toString().trim() };
}

/** Packages the library of a build folder for this machine, after checking that it is the pin. */
export async function packageHostLibrary(options: { readonly build: string; readonly pin: string; readonly allowMismatch: boolean }): Promise<void> {
	const { pin, allowMismatch } = options;
	const build = resolve(options.build);
	const target = hostTarget();
	const { library } = targetOf(target);
	const checkout = await sourceOfBuild(build);
	let verified = false;
	if (!allowMismatch) {
		if (!checkout) {
			fail(`${build} is not a CMake build of Raven, so nothing says which commit its library is: build it, or say --allow-mismatch`);
		}
		const mismatch = mismatchOf(checkout, pin);
		if (mismatch) {
			fail(mismatch);
		}
		await buildLibrary(build);
		verified = true;
	}
	const candidates = [`${build}/${library}`, `${build}/bin/${library}`, `${build}/Release/${library}`, `${build}/bin/Release/${library}`];
	const libraryPath = candidates.find((path) => existsSync(path));
	if (!libraryPath) {
		fail(`no ${library} in ${build}: build Raven with -DRAVEN_BUILD_SHARED=ON. Known targets: ${Object.keys(TARGETS).join(", ")}`);
	}
	const pinCommit = checkout ? commitOf(checkout, pin) : null;
	const binding = (checkout && pinCommit ? fileAt(checkout, pinCommit, BINDING_IN_RAVEN) : null) ?? (await Bun.file(BINDING_FILE).text());
	if (!allowMismatch) {
		await requireFunctions(libraryPath, binding, `the binding of ${shortCommit(pin)}`);
	}
	const stamp = await makeStamp({ library: libraryPath, checkout, pin, verified, canOpen: true });
	const manifest = (await Bun.file(`${PACKAGE_ROOT}/package.json`).json()) as { readonly name: string; readonly version: string };
	await writePlatformPackage({ mainName: manifest.name, version: manifest.version, target, libraryPath, directory: `${PACKAGE_ROOT}/native/${target}`, stamp });
	console.log(`native/${target} from ${libraryPath}: ${shortCommit(stamp.commit) || "unknown commit"}, Rget_version ${stamp.version}${verified ? "" : ", NOT checked against the pin"}. Run bun install if it is new.`);
}
