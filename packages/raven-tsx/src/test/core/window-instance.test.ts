import { afterAll, beforeAll, expect, test } from "bun:test";
import * as r from "../../core/raven";
import { eventStats } from "../../core/events";
import { WidgetInstance } from "../../core/widget-instance";
import { WindowInstance } from "../../core/window-instance";

beforeAll(() => {
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_NULL;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
});

afterAll(() => {
	r.Rshutdown();
});

test("whenOpen runs what waits once the window opens, skips what was cancelled, and goes on past a failure", () => {
	const window = WindowInstance.create({ Title: "open", Width: 100, Height: 100 });
	const ran: string[] = [];
	let cancelB = (): void => {};
	window.whenOpen(() => {
		ran.push("a");
		cancelB();
	});
	cancelB = window.whenOpen(() => ran.push("b"));
	window.whenOpen(() => {
		throw new Error("from c");
	});
	window.whenOpen(() => ran.push("d"));
	expect(() => window.materialize()).toThrow("from c");
	expect(ran).toEqual(["a", "d"]);
	expect(window.isOpen).toBe(true);
	window.whenOpen(() => ran.push("now"));
	expect(ran).toEqual(["a", "d", "now"]);
	window.dispose();
	expect(window.isOpen).toBe(false);
});

test("nothing runs once a callback has closed the window", () => {
	const window = WindowInstance.create({ Title: "open", Width: 100, Height: 100 });
	const ran: string[] = [];
	window.whenOpen(() => window.dispose());
	window.whenOpen(() => ran.push("after"));
	window.materialize();
	expect(ran).toEqual([]);
});

test("a window destroyed in Raven runs nothing more, queued or asked later", () => {
	const window = WindowInstance.create({ Title: "open", Width: 100, Height: 100 });
	const ran: string[] = [];
	window.whenOpen(() => r.Rwindow_destroy(window.window));
	window.whenOpen(() => ran.push("queued"));
	window.materialize();
	window.whenOpen(() => ran.push("later"));
	expect(ran).toEqual([]);
	window.dispose();
});

test("a live widget taken out of a window not open yet leaves no handler", () => {
	const window = WindowInstance.create({ Title: "pending", Width: 100, Height: 100 });
	const handlers = eventStats().handlers;
	const button = WidgetInstance.create("Button", { OnClicked: () => {} });
	button.materialize();
	expect(eventStats().handlers).toBe(handlers + 1);
	window.append(button);
	window.remove(button);
	expect(eventStats().handlers).toBe(handlers);
	expect(r.Rwidget_is_valid(button.widget)).toBe(0);
	window.dispose();
});
