/**
 * Says where raven-react stands against Raven, and what it would take to move:
 *
 *     bun run raven:status [ref]     the pin, the checkout, upstream, and the API between the pin and ref
 *     bun run raven:check            fails if anything does not agree with the pin (CI runs this)
 *
 * ref is `upstream/main` by default. `--raven <folder>` says where the checkout is, `--no-fetch`
 * stays offline, `--full` lists everything, `--no-library` skips what needs a library that this
 * machine can open, `--no-drift` skips the comparison with drift.txt.
 */

import { functionsOfBinding, shortCommit } from "../library-check";
import { countOf, diffApi, formatDiff, newCallbackSetters } from "./raven-api";
import { checkDrift, driftCountAt } from "./raven-drift";
import { apiAt, checkBinding, checkComponents, checkoutPath, checkPackagedLibrary, commitOf, dirtyPaths, fail, fileAt, flag, git, hostTarget, nameOf, otherPackages, readPin, type Finding } from "./raven-pin";

const checking = flag("check");
const checkout = checkoutPath();
const pin = await readPin();
if (git(checkout, "rev-parse", "--git-dir") === null) {
	fail(`no Raven checkout in ${checkout}: --raven <folder> says where it is`);
}
const pinCommit = commitOf(checkout, pin);
if (!pinCommit) {
	fail(`RAVEN_VERSION says ${pin}, which ${checkout} does not have: git -C ${checkout} fetch upstream`);
}

const row = (name: string, text: string): void => console.log(`${name.padEnd(11)} ${text}`);

/** How far a commit is from the pin. */
function distance(commit: string): string {
	if (commit === pinCommit) {
		return "= pin";
	}
	const [behind = "?", ahead = "?"] = (git(checkout, "rev-list", "--left-right", "--count", `${pinCommit}...${commit}`) ?? "").split(/\s+/);
	return `${ahead} ahead of the pin, ${behind} behind`;
}

const findings: Finding[] = [];
const head = git(checkout, "rev-parse", "HEAD") ?? "";
const dirty = dirtyPaths(checkout);
findings.push({
	name: "checkout",
	ok: head === pinCommit && dirty.length === 0,
	detail: `${shortCommit(head)} ${distance(head)}, ${dirty.length === 0 ? "clean" : `${dirty.length} changed: ${dirty.slice(0, 2).join(", ")}`} (${checkout})`,
});
findings.push(await checkBinding(checkout, pinCommit));
// (raven:update moves the pin before anyone can have looked at what changed, and lists it at its end)
if (!flag("no-drift")) {
	findings.push(await checkDrift(checkout, pinCommit));
}
if (!flag("no-library")) {
	findings.push(await checkPackagedLibrary(hostTarget(), pin, pinCommit));
	findings.push(checkComponents());
}

row("pin", `${shortCommit(pin)} ${pin === pinCommit ? "" : `(${shortCommit(pinCommit)}) `}${nameOf(checkout, pinCommit)}, ${git(checkout, "log", "-1", "--format=%cs", pinCommit)}`);
for (const { name, ok, detail } of findings) {
	row(name, `${ok ? "ok " : "NO "} ${detail}`);
}
for (const other of otherPackages(pinCommit)) {
	row("", `    ${other}`);
}

if (checking) {
	const wrong = findings.filter(({ ok }) => !ok);
	if (wrong.length > 0) {
		fail(`\nraven:check: ${wrong.length} ${wrong.length === 1 ? "thing does" : "things do"} not agree with RAVEN_VERSION: ${wrong.map(({ name }) => name).join(", ")}`);
	}
	console.log("\nraven:check: everything agrees with RAVEN_VERSION");
	process.exit(0);
}

const positional = process.argv.slice(2).filter((argument, index, all) => !argument.startsWith("--") && all[index - 1] !== "--raven");
const asked = positional[0];
const remote = git(checkout, "remote", "get-url", "upstream") ? "upstream" : "origin";
let fetched = true;
if (!flag("no-fetch")) {
	fetched = Bun.spawnSync(["git", "-C", checkout, "fetch", "-q", "--tags", remote], { stdout: "ignore", stderr: "ignore" }).success;
}
const ref = asked ?? `${remote}/main`;
const target = commitOf(checkout, ref);
if (!target) {
	fail(`${ref} is not known in ${checkout}`);
}
row(asked ? ref : remote, `${shortCommit(target)} ${distance(target)}, ${nameOf(checkout, target)}${fetched ? "" : " (not fetched: offline?)"}`);

console.log("");
if (target === pinCommit) {
	console.log(`API: ${ref} is the pin. raven-react needs no update.`);
	process.exit(0);
}
const diff = diffApi(apiAt(checkout, pinCommit), apiAt(checkout, target));
const count = countOf(diff);
if (count === 0) {
	console.log(`API: no change between the pin and ${ref}, in ${git(checkout, "rev-list", "--count", `${pinCommit}..${target}`)} commits. raven-react needs no code; bun run raven:update ${ref} takes the fixes.`);
} else {
	console.log(`API: ${count} changes from the pin to ${ref}:`);
	console.log(formatDiff(diff, flag("full")).join("\n"));
	const setters = newCallbackSetters(diff);
	const breaking = diff.functions.removed.length + diff.functions.changed.length + diff.callbacks.removed.length + diff.callbacks.changed.length + diff.tags.removed.length + diff.attributes.removed.length;
	const ahead = git(checkout, "merge-base", "--is-ancestor", target, pinCommit) !== null;
	console.log(ahead ? `\n${ref} is older than the pin: raven-react needs nothing from it.` : `\nraven-react needs an update: bun run raven:update ${ref}, which regenerates the components.${setters.length > 0 ? `\nWire or classify in src/test/coverage.test.ts: ${setters.join(" ")}` : ""}${breaking > 0 ? `\n${breaking} of these remove or change something: check what uses them.` : ""}`);
}
// (the API says nothing of a widget that behaves differently, or of an example that does more)
const drifted = await driftCountAt(checkout, target);
if (drifted > 0) {
	console.log(`\n${drifted} files that raven-react follows differ at ${ref}, whatever the API says: bun run raven:drift ${ref}`);
}
// (upstream regenerates its bindings in a commit of their own: between the two, the binding is behind)
const binding = fileAt(checkout, target, "bindings/bun/src/raven.ts") ?? "";
const stale = diff.functions.added.filter((name) => !functionsOfBinding(binding).includes(name));
if (stale.length > 0) {
	console.log(`\nThe Bun binding of ${ref} does not have ${stale.length} of the new functions yet: ${stale.slice(0, 5).join(" ")}`);
}
