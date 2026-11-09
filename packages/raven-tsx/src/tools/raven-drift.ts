/**
 * Says which files of Raven changed since raven-tsx was last checked against them. The API
 * diff of `raven:status` sees headers and the XML schema; this sees what they cannot: a widget
 * that behaves differently, an example that does more.
 *
 *     bun run raven:drift [ref]             what differs from drift.txt at the pin, or at ref
 *     bun run raven:drift --check           the same, and fails if anything differs
 *     bun run raven:drift --accept <path>   records files as checked, at the pin: one file or folder
 *     bun run raven:drift --accept-all      records everything as checked, at the pin
 *
 * `drift.txt` holds one line per file: its git blob, the commit it was accepted at, its path.
 * Hashes come from a commit and not from the working tree, so uncommitted changes in the checkout
 * do not count, line endings do not matter, and a shallow clone is enough. A changed line shows
 * `old..new`, which `git diff old new` opens as long as the checkout has both.
 */

import { shortCommit } from "../core/library-check";
import { checkoutPath, commitOf, fail, flag, git, PACKAGE_ROOT, readPin, type Finding } from "./raven-pin";

const DRIFT_FILE = `${PACKAGE_ROOT}/drift.txt`;
/** What raven-tsx copies or mirrors. Headers are not here: `raven:status` compares them by meaning. */
const FOLLOWED_PATHS = ["examples", "src/widgets", "src/widget", "src/xml"];
/** Examples with no port on purpose, and the build files beside the examples. A new example is followed by itself. */
const IGNORED = [/^examples\/(bevy_editor|languages)\//, /^examples\/[^/]+$/];

const HEADER = `# The files of Raven that raven-tsx was last checked against: blob, commit accepted at, path.
# Written by bun run raven:drift --accept. See src/tools/raven-drift.ts.
`;

/** One file as it was checked. */
export interface DriftEntry {
	readonly blob: string;
	readonly commit: string;
}

/** What differs between drift.txt and a commit. */
export interface Drift {
	readonly added: readonly string[];
	readonly changed: readonly string[];
	readonly removed: readonly string[];
}

/** Reads the text of drift.txt. Stops at a line that is not an entry, such as a merge conflict. */
export function parseDrift(text: string): Map<string, DriftEntry> {
	const entries = new Map<string, DriftEntry>();
	for (const [index, line] of text.split(/\r?\n/).entries()) {
		if (!line || line.startsWith("#")) {
			continue;
		}
		const match = line.match(/^([0-9a-f]{40}) ([0-9a-f]+) (.+)$/);
		if (!match) {
			fail(`drift.txt line ${index + 1} is not "blob commit path": ${line}`);
		}
		const [, blob = "", commit = "", path = ""] = match;
		entries.set(path, { blob, commit });
	}
	return entries;
}

/** The text of drift.txt, sorted the same on every machine so that a diff shows only what changed. */
export function formatDrift(entries: ReadonlyMap<string, DriftEntry>): string {
	const lines = [...entries]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([path, { blob, commit }]) => `${blob} ${commit} ${path}`);
	return `${HEADER}${lines.join("\n")}\n`;
}

/** Compares what was checked with the blobs of a commit. */
export function compareDrift(recorded: ReadonlyMap<string, DriftEntry>, current: ReadonlyMap<string, string>): Drift {
	const added: string[] = [];
	const changed: string[] = [];
	for (const [path, blob] of current) {
		const entry = recorded.get(path);
		if (!entry) {
			added.push(path);
		} else if (entry.blob !== blob) {
			changed.push(path);
		}
	}
	const removed = [...recorded.keys()].filter((path) => !current.has(path));
	return { added: added.sort(), changed: changed.sort(), removed: removed.sort() };
}

/** Whether a path is a followed file. */
export const isFollowed = (path: string): boolean => !IGNORED.some((pattern) => pattern.test(path));

/** Whether a path is what `--accept` names: that file, or a file in that folder. */
export const isUnder = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** What in raven-tsx a file of Raven concerns. */
export function concernOf(path: string): string {
	const example = path.match(/^examples\/([^/]+)\//)?.[1];
	return example ? `examples/${example}` : "renderer";
}

/** The number of files that differ. */
const countOf = ({ added, changed, removed }: Drift): number => added.length + changed.length + removed.length;

/** The followed files of a commit, each with its blob. */
function filesAt(checkout: string, commit: string): Map<string, string> {
	const listing = git(checkout, "ls-tree", "-r", "-z", commit, "--", ...FOLLOWED_PATHS);
	if (listing === null) {
		fail(`git cannot list ${commit} in ${checkout}`);
	}
	const files = new Map<string, string>();
	for (const record of listing.split("\0")) {
		const match = record.match(/^\d+ blob ([0-9a-f]{40})\t(.+)$/s);
		if (match?.[1] && match[2] && isFollowed(match[2])) {
			files.set(match[2], match[1]);
		}
	}
	return files;
}

/** The entries of drift.txt, or null when there is no such file yet. */
async function readDrift(): Promise<Map<string, DriftEntry> | null> {
	const file = Bun.file(DRIFT_FILE);
	return (await file.exists()) ? parseDrift(await file.text()) : null;
}

/** The check of drift.txt against the pin, for `raven:status` and `raven:check`. */
export async function checkDrift(checkout: string, pinCommit: string): Promise<Finding> {
	const name = "drift";
	const recorded = await readDrift();
	if (!recorded) {
		return { name, ok: false, detail: "no drift.txt: bun run raven:drift --accept-all" };
	}
	const count = countOf(compareDrift(recorded, filesAt(checkout, pinCommit)));
	return count === 0
		? { name, ok: true, detail: `all ${recorded.size} followed files were checked as they are at the pin` }
		: { name, ok: false, detail: `${count} followed files differ from drift.txt at the pin: bun run raven:drift` };
}

/** How many followed files of a commit differ from drift.txt, for the preview of `raven:status`. */
export async function driftCountAt(checkout: string, commit: string): Promise<number> {
	return countOf(compareDrift((await readDrift()) ?? new Map<string, DriftEntry>(), filesAt(checkout, commit)));
}

/** Prints what differs, by what it concerns. */
function report(drift: Drift, recorded: ReadonlyMap<string, DriftEntry>, current: ReadonlyMap<string, string>): void {
	const rows: readonly (readonly [string, string])[] = [
		...drift.changed.map((path): [string, string] => [path, `changed ${recorded.get(path)?.blob.slice(0, 10)}..${current.get(path)?.slice(0, 10)} ${path}`]),
		...drift.added.map((path): [string, string] => [path, `added   ${path}`]),
		...drift.removed.map((path): [string, string] => [path, `removed ${path}`]),
	];
	const groups = new Map<string, string[]>();
	for (const [path, row] of rows) {
		const concern = concernOf(path);
		groups.set(concern, [...(groups.get(concern) ?? []), row]);
	}
	for (const concern of [...groups.keys()].sort()) {
		console.log(`\n${concern}`);
		for (const row of (groups.get(concern) ?? []).sort()) {
			console.log(`  ${row}`);
		}
	}
}

/** Records as checked what `--accept` names, at the pin. Lines of other files stay as they are. */
async function accept(recorded: Map<string, DriftEntry>, current: ReadonlyMap<string, string>, drift: Drift, pinCommit: string, prefixes: readonly string[] | null): Promise<void> {
	for (const prefix of prefixes ?? []) {
		if (![...current.keys(), ...recorded.keys()].some((path) => isUnder(path, prefix))) {
			fail(`${prefix} is not a followed file or folder of Raven`);
		}
	}
	const wanted = (path: string): boolean => prefixes === null || prefixes.some((prefix) => isUnder(path, prefix));
	const updated = [...drift.added, ...drift.changed].filter(wanted);
	for (const path of updated) {
		recorded.set(path, { blob: current.get(path) ?? "", commit: shortCommit(pinCommit) });
	}
	const gone = drift.removed.filter(wanted);
	for (const path of gone) {
		recorded.delete(path);
	}
	await Bun.write(DRIFT_FILE, formatDrift(recorded));
	const accepted = updated.length + gone.length;
	console.log(`drift.txt: accepted ${accepted} at ${shortCommit(pinCommit)}, ${countOf(drift) - accepted} still differ.`);
}

/** The command. */
async function main(): Promise<void> {
	const checkout = checkoutPath();
	const pin = await readPin();
	const positional = process.argv.slice(2).filter((argument, index, all) => !argument.startsWith("--") && all[index - 1] !== "--raven");
	const accepting = flag("accept") || flag("accept-all");
	if (flag("accept") && positional.length === 0) {
		fail("--accept needs a file or folder of Raven. --accept-all records everything.");
	}
	if (flag("accept-all") && positional.length > 0) {
		fail("--accept-all takes no path, since it records everything at the pin.");
	}
	const ref = accepting ? pin : (positional[0] ?? pin);
	const commit = commitOf(checkout, ref);
	if (!commit) {
		fail(`${ref} is not known in ${checkout}: git -C ${checkout} fetch upstream`);
	}
	const current = filesAt(checkout, commit);
	const recorded = (await readDrift()) ?? new Map<string, DriftEntry>();
	const drift = compareDrift(recorded, current);
	if (accepting) {
		await accept(recorded, current, drift, commit, flag("accept-all") ? null : positional.map((path) => path.replace(/\/+$/, "")));
		return;
	}
	const count = countOf(drift);
	const label = ref === pin ? `the pin ${shortCommit(commit)}` : `${ref} ${shortCommit(commit)}`;
	if (count === 0) {
		console.log(`drift.txt agrees with ${label}: all ${current.size} followed files.`);
		return;
	}
	console.log(`${count} of ${current.size} followed files differ from drift.txt at ${label}.`);
	report(drift, recorded, current);
	console.log(`\nAfter checking them: bun run raven:drift --accept <path>, or --accept-all.${ref === pin ? "" : " That records them at the pin, so move the pin first: bun run raven:update."}`);
	if (flag("check")) {
		process.exit(1);
	}
}

if (import.meta.main) {
	await main();
}
