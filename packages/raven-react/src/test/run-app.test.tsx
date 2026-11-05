/** How `runApp` ends. It asks for Vulkan, so here the start is sent to a Raven without a window system or a GPU. */

import { afterAll, beforeAll, expect, spyOn, test, type Mock } from "bun:test";
import * as r from "../raven";
import { runApp } from "../index";

const init = r.Rinit_ex;
let starts: Mock<typeof r.Rinit_ex>;

beforeAll(() => {
	starts = spyOn(r, "Rinit_ex").mockImplementation((desc) => {
		if (desc) {
			desc.backend = r.R_BACKEND_NULL;
			desc.headless = 1;
		}
		return init(desc);
	});
});

afterAll(() => {
	starts.mockRestore();
});

test("Raven stops when the setup of runApp throws, so that it can start again", async () => {
	const failing = (): void => {
		throw new Error("no such look");
	};
	await expect(runApp(null, undefined, { setup: failing })).rejects.toThrow("no such look");
	let ran = false;
	await runApp(null, undefined, {
		setup: () => {
			ran = true;
			// (a tree that never had a window would run for ever)
			r.Rquit(0);
		},
	});
	expect(ran).toBe(true);
});
