import { describe, expect, test } from "bun:test";
import { compareDrift, concernOf, formatDrift, isFollowed, isUnder, parseDrift, type DriftEntry } from "../../tools/raven-drift";

const blob = (digit: string): string => digit.repeat(40);
const entry = (digit: string): DriftEntry => ({ blob: blob(digit), commit: "1092a82365da" });

describe("drift.txt", () => {
	test("reads back what it writes, sorted, including a path with a space", () => {
		const entries = new Map([
			["src/widgets/label.c", entry("b")],
			["examples/my example/main.c", entry("a")],
		]);
		const text = formatDrift(entries);
		expect(text.split("\n").filter((line) => !line.startsWith("#") && line).map((line) => line.split(" ")[2])).toEqual(["examples/my", "src/widgets/label.c"]);
		expect([...parseDrift(text)]).toEqual([...entries].reverse());
	});

	test("reads files written with Windows line endings", () => {
		expect(parseDrift(`# note\r\n${blob("a")} abc src/widget/a.c\r\n`).get("src/widget/a.c")?.blob).toBe(blob("a"));
	});

	test("says what was added, changed and removed, and nothing else", () => {
		const recorded = new Map([
			["same.c", entry("a")],
			["edited.c", entry("b")],
			["gone.c", entry("c")],
		]);
		const current = new Map([
			["same.c", blob("a")],
			["edited.c", blob("d")],
			["new.c", blob("e")],
		]);
		expect(compareDrift(recorded, current)).toEqual({ added: ["new.c"], changed: ["edited.c"], removed: ["gone.c"] });
	});

	test("the commit of a line does not count as a change", () => {
		const recorded = new Map([["a.c", { blob: blob("a"), commit: "aaaaaaaaaaaa" }]]);
		expect(compareDrift(recorded, new Map([["a.c", blob("a")]]))).toEqual({ added: [], changed: [], removed: [] });
	});
});

describe("what is followed", () => {
	test("examples with no port and the build files are not, and a new example is", () => {
		expect(isFollowed("examples/bevy_editor/src/main.rs")).toBe(false);
		expect(isFollowed("examples/languages/python/main.py")).toBe(false);
		expect(isFollowed("examples/CMakeLists.txt")).toBe(false);
		expect(isFollowed("examples/music/main.c")).toBe(true);
		expect(isFollowed("examples/brand_new/main.c")).toBe(true);
		expect(isFollowed("src/widgets/button.c")).toBe(true);
	});

	test("--accept names a file or a whole folder, not a name that starts the same", () => {
		expect(isUnder("examples/music/main.c", "examples/music")).toBe(true);
		expect(isUnder("examples/music/main.c", "examples/music/main.c")).toBe(true);
		expect(isUnder("examples/music_two/main.c", "examples/music")).toBe(false);
	});

	test("a file concerns its port, or else the renderer", () => {
		expect(concernOf("examples/music/assets/a.xml")).toBe("examples/music");
		expect(concernOf("src/widgets/button.c")).toBe("renderer");
		expect(concernOf("src/xml/xml_schema.c")).toBe("renderer");
	});
});
