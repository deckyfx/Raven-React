/** @jsxImportSource solid-js */
/** How `runApp` ends. It asks for Vulkan, so here the start is sent to a Raven without a window system or a GPU. */

import { afterAll, beforeAll, expect, spyOn, test, type Mock } from "bun:test";
import { onCleanup, onMount, type JSX } from "solid-js";
import * as r from "../../core/raven";
import { Label, runApp } from "../../solid/index";

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
	await expect(runApp(() => null, undefined, { setup: failing })).rejects.toThrow("no such look");
	let ran = false;
	await runApp(() => null, undefined, {
		setup: () => {
			ran = true;
			// (a tree that never had a window would run for ever)
			r.Rquit(0);
		},
	});
	expect(ran).toBe(true);
});

test("the tree is cleaned up before Raven stops when the run of runApp ends with an error", async () => {
	const mounted = Promise.withResolvers<void>();
	const loop = spyOn(r, "runLoop").mockImplementation(async () => {
		await mounted.promise;
		throw new Error("in the loop");
	});
	let runningAtCleanup = false;
	function App(): JSX.Element {
		onMount(() => mounted.resolve());
		onCleanup(() => void (runningAtCleanup = r.Ris_running() === r.R_TRUE));
		return <Label>app</Label>;
	}
	await expect(runApp(() => <App />, { Title: "app", Width: 200, Height: 100 })).rejects.toThrow("in the loop");
	loop.mockRestore();
	expect(runningAtCleanup).toBe(true);
	expect(r.Ris_running()).toBe(r.R_FALSE);
});
