/** The plain subscriptions of the core, and a node placed by hand: no framework is involved. */

import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import * as r from "../../core/raven";
import { eventStats } from "../../core/events";
import { onAction, onFrame, onShortcut } from "../../core/subscriptions";
import { finishPlacing, WidgetInstance } from "../../core/widget-instance";

let window: r.Rid = r.R_INVALID_ID;

beforeAll(() => {
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_NULL;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
	window = r.Rwindow_create_from_xml('<Window Title="Core" Width="200" Height="200"/>');
	expect(window).not.toBe(r.R_INVALID_ID);
});

afterAll(() => {
	r.Rwindow_destroy(window);
	r.Rshutdown();
});

test("onAction names a function until it is stopped", () => {
	const senders: r.Rid[] = [];
	const stop = onAction("core.named", (sender) => senders.push(sender));
	r.Raction_fire("core.named", r.R_INVALID_ID);
	expect(senders).toEqual([r.R_INVALID_ID]);
	stop();
	r.Raction_fire("core.named", r.R_INVALID_ID);
	expect(senders.length).toBe(1);
	expect(eventStats().handlers).toBe(0);
});

test("onShortcut fires on its keys until it is stopped", () => {
	let fired = 0;
	const stop = onShortcut(window, "Ctrl+K", () => fired++);
	r.Rwindow_inject_key(window, r.R_KEY_K, 1, r.R_MOD_CTRL);
	r.Rwindow_inject_key(window, r.R_KEY_K, 0, r.R_MOD_CTRL);
	expect(fired).toBe(1);
	stop();
	r.Rwindow_inject_key(window, r.R_KEY_K, 1, r.R_MOD_CTRL);
	r.Rwindow_inject_key(window, r.R_KEY_K, 0, r.R_MOD_CTRL);
	expect(fired).toBe(1);
	expect(eventStats().handlers).toBe(0);
});

test("onFrame runs at each frame, side by side, until it is stopped", () => {
	let a = 0;
	let b = 0;
	const stopA = onFrame((delta) => {
		expect(typeof delta).toBe("number");
		a++;
	});
	const stopB = onFrame(() => b++);
	r.Rdraw_frame();
	expect(a).toBeGreaterThan(0);
	expect(b).toBe(a);
	stopA();
	const seen = a;
	r.Rdraw_frame();
	expect(a).toBe(seen);
	expect(b).toBeGreaterThan(seen);
	stopB();
});

test("finishPlacing gives the nodes of the batch what needs a parent, once", () => {
	const child = WidgetInstance.create("Label", { Slot: { Padding: 4 }, children: "x" });
	const parent = WidgetInstance.create("VBox", {});
	parent.appendInitial(child);
	const applied = spyOn(child, "applyParentAttributes");
	parent.materialize();
	expect(applied).toHaveBeenCalledTimes(0);
	expect(r.Rlabel_get_text(child.widget)).toBe("x");
	finishPlacing();
	expect(applied).toHaveBeenCalledTimes(1);
	finishPlacing();
	expect(applied).toHaveBeenCalledTimes(1);
	parent.forgetTree();
	parent.dispose();
});
