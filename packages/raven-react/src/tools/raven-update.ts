/**
 * Moves raven-react to another Raven, in the one order that keeps everything starting:
 * the libraries, their package, the binding, the pin, the components. A newer library works with
 * an older binding and the opposite stops every application, so the binding waits for the library.
 * If a step fails, nothing after it happened: fix it and run this again.
 *
 *     bun run raven:update [ref]     upstream/main by default; a tag stays a tag in RAVEN_VERSION
 *
 * `--raven <folder>` says where the checkout is, `--no-fetch` stays offline, `--no-test` skips the
 * final check and tests, and `--dry-run` says what would happen and stops.
 */

import { shortCommit } from "../library-check";
import { existsSync } from "node:fs";
import { countOf, diffApi, formatDiff, newCallbackSetters } from "./raven-api";
import { driftCountAt } from "./raven-drift";
import { apiAt, checkoutPath, commitOf, fail, fileAt, flag, git, nameOf, packageHostLibrary, PACKAGE_ROOT, readPin, writePin } from "./raven-pin";

const checkout = checkoutPath();
const remote = git(checkout, "remote", "get-url", "upstream") ? "upstream" : "origin";
const dryRun = flag("dry-run");
const asked = process.argv.slice(2).find((argument, index, all) => !argument.startsWith("--") && all[index - 1] !== "--raven") ?? `${remote}/main`;

if (!flag("no-fetch") && !Bun.spawnSync(["git", "-C", checkout, "fetch", "-q", "--tags", remote], { stdout: "ignore", stderr: "ignore" }).success) {
	console.warn(`could not fetch ${remote}: going on with what ${checkout} has`);
}
const commit = commitOf(checkout, asked) ?? commitOf(checkout, `${remote}/${asked}`) ?? fail(`${asked} is not known in ${checkout}`);
const pin = git(checkout, "rev-parse", "--verify", "-q", `refs/tags/${asked}`) ? asked : commit;
const before = await readPin();
const beforeCommit = commitOf(checkout, before);

/** Runs a command, and stops with its output if it fails. */
async function run(what: string, command: readonly string[], cwd: string): Promise<void> {
	console.log(`- ${what}`);
	if (dryRun) {
		return;
	}
	const child = Bun.spawn([...command], { cwd, stdout: "pipe", stderr: "pipe" });
	const [output, errors, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	if (code !== 0) {
		fail(`${what} failed:\n${output}${errors}\nFix it and run bun run raven:update ${asked} again.`);
	}
}

console.log(`${shortCommit(before)} -> ${shortCommit(pin)} (${nameOf(checkout, commit)})${dryRun ? ", dry run" : ""}`);
if (beforeCommit) {
	const diff = diffApi(apiAt(checkout, beforeCommit), apiAt(checkout, commit));
	console.log(countOf(diff) === 0 ? "API: no change" : `API: ${countOf(diff)} changes\n${formatDiff(diff).join("\n")}`);
	const setters = newCallbackSetters(diff);
	if (setters.length > 0) {
		console.log(`Wire or classify in src/test/coverage.test.ts: ${setters.join(" ")}`);
	}
}

const head = git(checkout, "rev-parse", "HEAD");
if (head !== commit) {
	if ((git(checkout, "status", "--porcelain", "--untracked-files=no") ?? "x") !== "") {
		fail(`${checkout} has uncommitted changes: commit or put them aside, so that the checkout can move to ${shortCommit(commit)}`);
	}
	const canAdvance = git(checkout, "symbolic-ref", "-q", "HEAD") !== null && git(checkout, "merge-base", "--is-ancestor", "HEAD", commit) !== null;
	await run(
		canAdvance ? `advance the checkout to ${shortCommit(commit)}` : `put the checkout at ${shortCommit(commit)}, detached`,
		canAdvance ? ["git", "-C", checkout, "merge", "--ff-only", "-q", commit] : ["git", "-C", checkout, "checkout", "-q", "--detach", commit],
		checkout,
	);
}

const shared = `${checkout}/build-shared`;
if (!existsSync(`${shared}/CMakeCache.txt`)) {
	await run("configure build-shared", ["cmake", "-S", checkout, "-B", shared, "-DCMAKE_BUILD_TYPE=Release", "-DRAVEN_BUILD_SHARED=ON"], checkout);
}
await run("build the shared library", ["cmake", "--build", shared, "--target", "raven", "--config", "Release", "--parallel"], checkout);
if (existsSync(`${checkout}/build/CMakeCache.txt`)) {
	await run("build the static library and the examples", ["cmake", "--build", `${checkout}/build`, "--config", "Release", "--parallel"], checkout);
}

console.log("- package the library, for the new pin");
if (!dryRun) {
	await packageHostLibrary({ build: shared, pin, allowMismatch: false });
}
await run("link it", ["bun", "install"], `${PACKAGE_ROOT}/../..`);

console.log("- take the binding of the new pin");
if (!dryRun) {
	await Bun.write(`${PACKAGE_ROOT}/src/vendor/raven.ts`, fileAt(checkout, commit, "bindings/bun/src/raven.ts") ?? fail(`${shortCommit(commit)} has no binding`));
}
console.log("- write RAVEN_VERSION");
if (!dryRun) {
	await writePin(pin);
}
await run("generate the components", ["bun", "run", "src/tools/generate-components.ts", "src/components.generated.ts"], PACKAGE_ROOT);

if (!flag("no-test")) {
	await run("check that everything agrees", ["bun", "run", "src/tools/raven-status.ts", "--check", "--no-drift", "--raven", checkout], PACKAGE_ROOT);
	await run("type-check", ["bun", "check"], PACKAGE_ROOT);
	await run("test, with the classification of what Raven offers", ["bun", "test"], PACKAGE_ROOT);
}
console.log(dryRun ? "Nothing was changed." : `Now at ${shortCommit(pin)}. Other platforms are made elsewhere: native:windows here, and CI for the rest.`);
const drifted = await driftCountAt(checkout, commit);
if (drifted > 0) {
	console.log(`${drifted} files that raven-react follows differ at ${shortCommit(commit)}. Look at them with bun run raven:drift, then --accept them: raven:check fails until then.`);
}
