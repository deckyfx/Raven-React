import { afterAll, beforeAll, expect, test } from "bun:test";
import * as r from "../../core/raven";
import { eventStats } from "../../core/events";
import { finishPlacing, WidgetInstance } from "../../core/widget-instance";
import { CONTENT_NAME, WindowInstance } from "../../core/window-instance";

beforeAll(() => {
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_NULL;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
});

afterAll(() => {
	r.Rshutdown();
});

const WINDOW = { Title: "window", Width: 100, Height: 100 } as const;

test("whenOpen runs what waits once the window opens, skips what was cancelled, and goes on past a failure", () => {
	const window = WindowInstance.create(WINDOW);
	const ran: string[] = [];
	let cancelB = (): void => {};
	window.whenOpen(() => {
		ran.push("a");
		cancelB();
	});
	cancelB = window.whenOpen(() => {
		ran.push("b");
	});
	window.whenOpen(() => {
		throw new Error("from c");
	});
	window.whenOpen(() => {
		ran.push("d");
	});
	expect(() => window.materialize()).toThrow("from c");
	expect(ran).toEqual(["a", "d"]);
	expect(window.isOpen).toBe(true);
	window.whenOpen(() => {
		ran.push("now");
	});
	expect(ran).toEqual(["a", "d", "now"]);
	window.dispose();
	expect(window.isOpen).toBe(false);
});

test("nothing runs once a callback has closed the window", () => {
	const window = WindowInstance.create(WINDOW);
	const ran: string[] = [];
	window.whenOpen(() => window.dispose());
	window.whenOpen(() => {
		ran.push("after");
	});
	window.materialize();
	expect(ran).toEqual([]);
});

test("a window destroyed in Raven runs nothing more, queued or asked later", () => {
	const window = WindowInstance.create(WINDOW);
	const ran: string[] = [];
	window.whenOpen(() => {
		r.Rwindow_destroy(window.window);
	});
	window.whenOpen(() => {
		ran.push("queued");
	});
	window.materialize();
	window.whenOpen(() => {
		ran.push("later");
	});
	expect(ran).toEqual([]);
	window.dispose();
});

test("a live widget taken out of a window not open yet leaves no handler", () => {
	const window = WindowInstance.create(WINDOW);
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

test("a window closed opens again with what it held, alive, and runs whenOpen at each opening", () => {
	const window = WindowInstance.create(WINDOW);
	const log: string[] = [];
	let clicks = 0;
	const button = WidgetInstance.create("Button", { Name: "kept", OnClicked: () => clicks++ });
	window.append(button);
	window.whenOpen(() => {
		log.push(`open ${window.window}`);
		return () => log.push("closed");
	});
	window.materialize();
	const first = window.window;
	const widget = r.Rwidget_find(first, "kept");
	expect(widget).toBe(button.widget);
	window.close();
	expect(r.Rwindow_is_valid(first)).toBe(0);
	expect(window.isOpen).toBe(false);
	expect(r.Rwidget_is_valid(widget)).toBe(1);
	window.materialize();
	const second = window.window;
	expect(second).not.toBe(first);
	expect(r.Rwidget_find(second, "kept")).toBe(widget);
	expect(log).toEqual([`open ${first}`, "closed", `open ${second}`]);
	r.Raction_fire(r.Rwidget_get_action(widget) ?? "", widget);
	expect(clicks).toBe(1);
	window.forgetTree();
	window.dispose();
	expect(log).toEqual([`open ${first}`, "closed", `open ${second}`, "closed"]);
	expect(r.Rwidget_is_valid(widget)).toBe(0);
});

test("a window closed and never opened again deletes what it kept", () => {
	const window = WindowInstance.create(WINDOW);
	const handlers = eventStats().handlers;
	const button = WidgetInstance.create("Button", { OnClicked: () => {} });
	window.append(button);
	window.materialize();
	const widget = button.widget;
	window.close();
	window.dispose();
	expect(r.Rwidget_is_valid(widget)).toBe(0);
	expect(eventStats().handlers).toBe(handlers);
});

test("a cleanup returned by a function that closed its window runs at once", () => {
	const window = WindowInstance.create(WINDOW);
	const log: string[] = [];
	window.whenOpen(() => {
		window.close();
		return () => log.push("cleanup");
	});
	window.materialize();
	expect(log).toEqual(["cleanup"]);
	expect(window.isOpen).toBe(false);
	window.dispose();
});

test("a cleanup that throws: the others run, the window closes, and the failure is said", () => {
	const window = WindowInstance.create(WINDOW);
	const log: string[] = [];
	window.whenOpen(() => () => {
		throw new Error("from a cleanup");
	});
	window.whenOpen(() => () => log.push("second"));
	window.materialize();
	const first = window.window;
	expect(() => window.close()).toThrow("from a cleanup");
	expect(log).toEqual(["second"]);
	expect(r.Rwindow_is_valid(first)).toBe(0);
	window.materialize();
	expect(window.isOpen).toBe(true);
	expect(() => window.dispose()).toThrow("from a cleanup");
	expect(window.isOpen).toBe(false);
});

test("a cleanup that disposes the window while it closes leaves it gone", () => {
	const window = WindowInstance.create(WINDOW);
	const button = WidgetInstance.create("Button", { OnClicked: () => {} });
	const handlers = eventStats().handlers;
	window.append(button);
	window.whenOpen(() => () => window.dispose());
	window.materialize();
	const widget = button.widget;
	window.close();
	window.materialize();
	expect(window.isOpen).toBe(false);
	expect(window.window).toBe(r.R_INVALID_ID);
	expect(r.Rwidget_is_valid(widget)).toBe(0);
	expect(eventStats().handlers).toBe(handlers);
});

test("a window destroyed in Raven, then closed, does not open again with dead widgets", () => {
	const window = WindowInstance.create(WINDOW);
	const handlers = eventStats().handlers;
	const button = WidgetInstance.create("Button", { OnClicked: () => {} });
	window.append(button);
	window.materialize();
	r.Rwindow_destroy(window.window);
	window.close();
	window.materialize();
	expect(window.isOpen).toBe(false);
	expect(r.Rwindow_is_valid(window.window)).toBe(0);
	expect(eventStats().handlers).toBe(handlers);
});

test("the windows in a window close with it, and open again with it, directly or deeper", () => {
	const outer = WindowInstance.create(WINDOW);
	const direct = WindowInstance.create(WINDOW);
	const box = WidgetInstance.create("VBox", {});
	const deeper = WindowInstance.create(WINDOW);
	outer.append(direct);
	box.append(deeper);
	outer.append(box);
	outer.materialize();
	expect([outer.isOpen, direct.isOpen, deeper.isOpen]).toEqual([true, true, true]);
	outer.close();
	expect([outer.isOpen, direct.isOpen, deeper.isOpen]).toEqual([false, false, false]);
	outer.materialize();
	expect([outer.isOpen, direct.isOpen, deeper.isOpen]).toEqual([true, true, true]);
	outer.forgetTree();
	outer.dispose();
	expect([outer.isOpen, direct.isOpen, deeper.isOpen]).toEqual([false, false, false]);
});

test("a widget the application put in the content itself is kept while the window is closed", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const own = r.Rwidget_create_from_xml('<Label Name="own" Text="own"/>');
	r.Rwidget_add_child(r.Rwidget_find(window.window, CONTENT_NAME), own);
	window.close();
	expect(r.Rwidget_is_valid(own)).toBe(1);
	window.materialize();
	expect(r.Rwidget_find(window.window, "own")).toBe(own);
	window.dispose();
});

test("what the application put in the content comes back at its place among the widgets of the window", () => {
	const window = WindowInstance.create(WINDOW);
	const first = WidgetInstance.create("Label", { Name: "first", Text: "first" });
	const last = WidgetInstance.create("Label", { Name: "last", Text: "last" });
	window.appendInitial(first);
	window.materialize();
	const content = (): r.Rid => r.Rwidget_find(window.window, CONTENT_NAME);
	const own = r.Rwidget_create_from_xml('<Label Name="own" Text="own"/>');
	r.Rwidget_add_child(content(), own);
	window.append(last);
	const names = (): string[] => Array.from({ length: r.Rwidget_get_child_count(content()) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(content(), index)) ?? "");
	expect(names()).toEqual(["first", "own", "last"]);
	window.close();
	window.materialize();
	expect(names()).toEqual(["first", "own", "last"]);
	window.dispose();
});

test("a window inside that closes the outer one as it opens stops the opening, which comes at the next placing", () => {
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	let closed = false;
	inner.whenOpen(() => {
		if (!closed) {
			closed = true;
			outer.close();
		}
	});
	let opened = 0;
	outer.whenOpen(() => void opened++);
	outer.appendInitial(inner);
	outer.materialize();
	// (closed while it opened: it is not an opening, and what waits for one did not run)
	expect([outer.isOpen, inner.isOpen, opened]).toEqual([false, false, 0]);
	outer.materialize();
	expect([outer.isOpen, inner.isOpen, opened]).toEqual([true, true, 1]);
	outer.forgetTree();
	outer.dispose();
});

test("a window inside that closes and opens the outer one again as it opens leaves one opening", () => {
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	let reopened = false;
	inner.whenOpen(() => {
		if (!reopened) {
			reopened = true;
			outer.close();
			outer.materialize();
		}
	});
	let runs = 0;
	let cleanups = 0;
	outer.whenOpen(() => {
		runs++;
		return () => void cleanups++;
	});
	outer.appendInitial(inner);
	outer.materialize();
	expect([outer.isOpen, inner.isOpen, runs]).toEqual([true, true, 1]);
	outer.close();
	expect(cleanups).toBe(1);
	outer.forgetTree();
	outer.dispose();
});

test("what the application put in the content goes, when the window fails to open again", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const own = r.Rwidget_create_from_xml('<Label Name="own" Text="own"/>');
	r.Rwidget_add_child(r.Rwidget_find(window.window, CONTENT_NAME), own);
	window.close();
	const inner = WindowInstance.create(WINDOW);
	inner.whenOpen(() => {
		throw new Error("from inner");
	});
	window.appendInitial(inner);
	expect(() => window.materialize()).toThrow("from inner");
	expect([window.isOpen, r.Rwidget_is_valid(own)]).toEqual([false, 0]);
});

test("a widget is destroyed when a window under it fails to close", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const box = WidgetInstance.create("VBox", { Name: "box" });
	window.append(box);
	const inner = WindowInstance.create(WINDOW);
	inner.whenOpen(() => () => {
		throw new Error("from cleanup");
	});
	box.append(inner);
	expect(inner.isOpen).toBe(true);
	const widget = box.widget;
	expect(() => box.dispose()).toThrow("from cleanup");
	expect([r.Rwidget_is_valid(widget), inner.isOpen]).toEqual([0, false]);
	window.forgetTree();
	window.dispose();
});

test("what a window inside asks of the outer one as it opens runs once, with the opening", () => {
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	let runs = 0;
	let cleanups = 0;
	let asked = false;
	inner.whenOpen(() => {
		if (!asked) {
			asked = true;
			outer.whenOpen(() => {
				runs++;
				return () => void cleanups++;
			});
		}
	});
	outer.appendInitial(inner);
	outer.materialize();
	expect(runs).toBe(1);
	outer.close();
	expect(cleanups).toBe(1);
	outer.forgetTree();
	outer.dispose();
});

test("a window disposed by a child as it opens deletes the children still waiting", () => {
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	const box = WidgetInstance.create("VBox", { Name: "waiting" });
	let opened = 0;
	inner.whenOpen(() => {
		opened++;
		if (opened === 2) {
			outer.dispose();
		}
	});
	outer.appendInitial(inner);
	outer.appendInitial(box);
	outer.materialize();
	const widget = box.widget;
	expect(r.Rwidget_is_valid(widget)).toBe(1);
	// (closed, it keeps both, alive; opened again, the first disposes it)
	outer.close();
	outer.materialize();
	expect(r.Rwidget_is_valid(widget)).toBe(0);
});

test("a widget released by a cleanup while its parent is disposed is not deleted with it", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const box = WidgetInstance.create("VBox", { Name: "box" });
	const sibling = WidgetInstance.create("Label", { Name: "sibling", Text: "sibling" });
	window.append(box);
	box.append(sibling);
	const inner = WindowInstance.create(WINDOW);
	inner.whenOpen(() => () => box.release(sibling));
	box.append(inner);
	const widget = sibling.widget;
	box.dispose();
	expect(r.Rwidget_is_valid(widget)).toBe(1);
	r.Rwidget_destroy(widget);
	window.forgetTree();
	window.dispose();
});

test("a sibling added as a child opens its windows goes after it, as in the tree", () => {
	const window = WindowInstance.create(WINDOW);
	const parent = WidgetInstance.create("VBox", { Name: "parent" });
	const child = WidgetInstance.create("VBox", { Name: "child" });
	const sibling = WidgetInstance.create("Label", { Name: "sibling", Text: "sibling" });
	const inner = WindowInstance.create(WINDOW);
	let added = false;
	inner.whenOpen(() => {
		if (!added) {
			added = true;
			parent.append(sibling);
		}
	});
	child.append(inner);
	parent.append(child);
	window.appendInitial(parent);
	window.materialize();
	const box = r.Rwidget_find(window.window, "parent");
	expect(Array.from({ length: r.Rwidget_get_child_count(box) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(box, index)))).toEqual(["child", "sibling"]);
	window.forgetTree();
	window.dispose();
});

test("a widget not placed deletes what it holds that is", () => {
	const button = WidgetInstance.create("Button", { Name: "made", OnClicked: () => {} });
	button.materialize();
	const before = eventStats().handlers;
	const box = WidgetInstance.create("VBox", {});
	box.append(button);
	box.forgetTree();
	box.dispose();
	expect(r.Rwidget_is_valid(button.widget)).toBe(0);
	expect(eventStats().handlers).toBeLessThan(before);
});

test("a widget removed by a child as it is made makes none of the children after", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const parent = WidgetInstance.create("VBox", { Name: "parent" });
	const first = WidgetInstance.create("VBox", { Name: "first" });
	const after = WidgetInstance.create("Button", { Name: "after", OnClicked: () => {} });
	const inner = WindowInstance.create(WINDOW);
	inner.whenOpen(() => window.remove(parent));
	first.append(inner);
	parent.append(first);
	parent.append(after);
	const handlers = eventStats().handlers;
	window.append(parent);
	expect([parent.placed, after.placed]).toEqual([false, false]);
	expect(eventStats().handlers).toBe(handlers);
	window.forgetTree();
	window.dispose();
});

test("a child removed while it waits to go in does not go in", () => {
	const errors: string[] = [];
	r.Rerror_set_callback((_code, _severity, detail) => void errors.push(detail ?? ""));
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	const waiting = WidgetInstance.create("Label", { Name: "waiting", Text: "waiting" });
	inner.whenOpen(() => outer.remove(waiting));
	outer.appendInitial(inner);
	outer.appendInitial(waiting);
	outer.materialize();
	expect(r.Rwidget_find(outer.window, "waiting")).toBe(r.R_INVALID_ID);
	expect(waiting.placed).toBe(false);
	outer.forgetTree();
	outer.dispose();
	r.Rerror_set_callback(null);
	expect(errors).toEqual([]);
});

test("children placed before the window closed as it opened keep their place before the others", () => {
	const outer = WindowInstance.create(WINDOW);
	const first = WidgetInstance.create("Label", { Name: "first", Text: "first" });
	const middle = WidgetInstance.create("VBox", { Name: "middle" });
	const last = WidgetInstance.create("Label", { Name: "last", Text: "last" });
	const inner = WindowInstance.create(WINDOW);
	let closed = false;
	inner.whenOpen(() => {
		if (!closed) {
			closed = true;
			outer.close();
		}
	});
	middle.append(inner);
	outer.appendInitial(first);
	outer.appendInitial(middle);
	outer.appendInitial(last);
	outer.materialize();
	expect(outer.isOpen).toBe(false);
	outer.materialize();
	const content = r.Rwidget_find(outer.window, CONTENT_NAME);
	expect(Array.from({ length: r.Rwidget_get_child_count(content) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(content, index)))).toEqual(["first", "middle", "last"]);
	outer.forgetTree();
	outer.dispose();
});

test("a child a cleanup moved elsewhere while its parent, not placed, is disposed stays where it went", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const elsewhere = WidgetInstance.create("VBox", { Name: "elsewhere" });
	window.append(elsewhere);
	const parent = WidgetInstance.create("VBox", {});
	const open = WindowInstance.create(WINDOW);
	open.materialize();
	const moved = WidgetInstance.create("Label", { Name: "moved", Text: "moved" });
	parent.append(open);
	parent.append(moved);
	open.whenOpen(() => () => {
		parent.release(moved);
		elsewhere.append(moved);
	});
	parent.dispose();
	expect(r.Rwidget_find(window.window, "moved")).not.toBe(r.R_INVALID_ID);
	window.forgetTree();
	window.dispose();
});

test("a sibling put in while a child is made goes at its place among those Raven holds", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const parent = WidgetInstance.create("VBox", { Name: "parent" });
	window.append(parent);
	parent.append(WidgetInstance.create("Label", { Name: "a", Text: "a" }));
	const last = WidgetInstance.create("Label", { Name: "c", Text: "c" });
	parent.append(last);
	const made = WidgetInstance.create("VBox", { Name: "b" });
	const sibling = WidgetInstance.create("Label", { Name: "s", Text: "s" });
	const inner = WindowInstance.create(WINDOW);
	let once = true;
	// (while b is made, before c: s goes after b, which Raven does not hold yet, and before c)
	inner.whenOpen(() => {
		if (once) {
			once = false;
			parent.insertBefore(sibling, last);
		}
	});
	made.append(inner);
	parent.insertBefore(made, last);
	const box = r.Rwidget_find(window.window, "parent");
	expect(Array.from({ length: r.Rwidget_get_child_count(box) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(box, index)))).toEqual(["a", "b", "s", "c"]);
	window.forgetTree();
	window.dispose();
});

test("a child made while its parent is disposed goes with it", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const parent = WidgetInstance.create("VBox", { Name: "parent" });
	window.append(parent);
	const child = WidgetInstance.create("VBox", { Name: "child" });
	const inner = WindowInstance.create(WINDOW);
	inner.whenOpen(() => window.remove(parent));
	child.append(inner);
	parent.append(child);
	expect([r.Rwidget_is_valid(child.widget), inner.isOpen]).toEqual([0, false]);
	window.forgetTree();
	window.dispose();
});

test("a window a cleanup adds while the window that holds it closes opens with it, not before", () => {
	const outer = WindowInstance.create(WINDOW);
	outer.materialize();
	const box = WidgetInstance.create("VBox", { Name: "box" });
	outer.append(box);
	const inner = WindowInstance.create(WINDOW);
	const added = WindowInstance.create(WINDOW);
	let once = true;
	inner.whenOpen(() => () => {
		if (once) {
			once = false;
			box.append(added);
		}
	});
	box.append(inner);
	outer.close();
	expect([inner.isOpen, added.isOpen]).toEqual([false, false]);
	outer.materialize();
	expect([inner.isOpen, added.isOpen]).toEqual([true, true]);
	outer.forgetTree();
	outer.dispose();
});

test("what waits for a widget to be placed stops once one of it deleted the widget", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const widget = WidgetInstance.create("Label", { Name: "placed", Text: "placed" });
	let after = false;
	widget.whenPlaced(() => window.remove(widget));
	widget.whenPlaced(() => {
		after = true;
	});
	window.append(widget);
	finishPlacing();
	expect([widget.placed, after]).toEqual([false, false]);
	window.forgetTree();
	window.dispose();
});

test("a child moved elsewhere while it is made, its parent then deleted, stays where it went", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const elsewhere = WidgetInstance.create("VBox", { Name: "elsewhere" });
	const parent = WidgetInstance.create("VBox", { Name: "parent" });
	window.append(elsewhere);
	window.append(parent);
	const child = WidgetInstance.create("VBox", { Name: "child" });
	const inner = WindowInstance.create(WINDOW);
	let once = true;
	inner.whenOpen(() => {
		if (once) {
			once = false;
			parent.release(child);
			elsewhere.append(child);
			window.remove(parent);
		}
	});
	child.append(inner);
	parent.append(child);
	expect(r.Rwidget_get_parent(child.widget)).toBe(elsewhere.widget);
	expect(inner.isOpen).toBe(true);
	window.forgetTree();
	window.dispose();
});

test("a child waiting in a window that is disposed can be taken elsewhere by a cleanup, and stays there", () => {
	const host = WindowInstance.create(WINDOW);
	host.materialize();
	const elsewhere = WidgetInstance.create("VBox", { Name: "elsewhere" });
	host.append(elsewhere);
	const outer = WindowInstance.create(WINDOW);
	const open = WindowInstance.create(WINDOW);
	open.materialize();
	const waiting = WidgetInstance.create("Label", { Name: "waiting", Text: "waiting" });
	waiting.materialize();
	outer.appendInitial(open);
	outer.appendInitial(waiting);
	open.whenOpen(() => () => {
		outer.release(waiting);
		elsewhere.append(waiting);
	});
	outer.dispose();
	expect(r.Rwidget_find(host.window, "waiting")).toBe(waiting.widget);
	host.forgetTree();
	host.dispose();
});

test("a widget a cleanup takes out of a tree being deleted keeps its handlers where it goes", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const elsewhere = WidgetInstance.create("VBox", { Name: "elsewhere" });
	const box = WidgetInstance.create("VBox", { Name: "box" });
	window.append(elsewhere);
	window.append(box);
	let clicks = 0;
	const button = WidgetInstance.create("Button", { Name: "button", OnClicked: () => void clicks++ });
	const inner = WindowInstance.create(WINDOW);
	box.append(inner);
	box.append(button);
	inner.whenOpen(() => () => {
		box.release(button);
		elsewhere.append(button);
	});
	window.remove(box);
	expect(r.Rwidget_get_parent(button.widget)).toBe(elsewhere.widget);
	r.Raction_fire(r.Rwidget_get_action(button.widget) ?? "", button.widget);
	expect(clicks).toBe(1);
	window.forgetTree();
	window.dispose();
});

test("a window a child releases and closes as it opens stays closed", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const parent = WidgetInstance.create("VBox", { Name: "parent" });
	const child = WindowInstance.create(WINDOW);
	let once = true;
	child.whenOpen(() => {
		if (once) {
			once = false;
			parent.release(child);
			child.closeWindows();
		}
	});
	parent.append(child);
	window.append(parent);
	expect(child.isOpen).toBe(false);
	child.forgetTree();
	child.dispose();
	window.forgetTree();
	window.dispose();
});

test("what waits for a widget asked while it is made runs once it is placed", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const parent = WidgetInstance.create("VBox", { Name: "parent" });
	const child = WindowInstance.create(WINDOW);
	let parentAtCall = r.R_INVALID_ID;
	child.whenOpen(() => parent.whenPlaced((placed) => {
		parentAtCall = r.Rwidget_get_parent(placed.widget);
	}));
	parent.append(child);
	window.append(parent);
	finishPlacing();
	expect(parentAtCall).toBe(r.Rwidget_find(window.window, CONTENT_NAME));
	window.forgetTree();
	window.dispose();
});

test("a window a child closed, opened again and then failed in stays open, as opened again", () => {
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	let once = true;
	inner.whenOpen(() => {
		if (once) {
			once = false;
			outer.close();
			outer.materialize();
			throw new Error("after opening it again");
		}
	});
	outer.appendInitial(inner);
	expect(() => outer.materialize()).toThrow("after opening it again");
	expect([outer.isOpen, inner.isOpen]).toEqual([true, true]);
	outer.forgetTree();
	outer.dispose();
});

test("a function that opens its window again and then throws has what it gave then run", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	let calls = 0;
	let cleanups = 0;
	expect(() =>
		window.whenOpen(() => {
			calls++;
			if (calls === 1) {
				window.close();
				window.materialize();
				throw new Error("first run");
			}
			return () => void cleanups++;
		}),
	).toThrow("first run");
	expect(cleanups).toBe(1);
	window.close();
	expect(cleanups).toBe(1);
	window.dispose();
});

test("windows that a cleanup shows again while they close stay open", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const other = WidgetInstance.create("VBox", { Name: "other" });
	const box = WidgetInstance.create("VBox", { Name: "box" });
	window.append(other);
	window.append(box);
	const first = WindowInstance.create(WINDOW);
	const second = WindowInstance.create(WINDOW);
	box.append(first);
	box.append(second);
	let once = true;
	first.whenOpen(() => () => {
		if (once) {
			once = false;
			other.append(box);
		}
	});
	window.release(box);
	box.closeWindows();
	expect([first.isOpen, second.isOpen]).toEqual([true, true]);
	window.forgetTree();
	window.dispose();
});

test("an island whose handlers were forgotten gets them back in the window that takes it", () => {
	const first = WindowInstance.create(WINDOW);
	const second = WindowInstance.create(WINDOW);
	first.materialize();
	second.materialize();
	const island = WidgetInstance.create("Island", {});
	let clicks = 0;
	const button = WidgetInstance.create("Button", { Name: "button", OnClicked: () => void clicks++ });
	island.append(button);
	first.append(island);
	expect(island.placed).toBe(true);
	// (as a tree being deleted does, before a cleanup takes the island elsewhere)
	first.release(island);
	island.forgetTree();
	second.append(island);
	r.Raction_fire(r.Rwidget_get_action(button.widget) ?? "", button.widget);
	expect(clicks).toBe(1);
	first.dispose();
	second.forgetTree();
	second.dispose();
});

test("what waits for a widget stops once one of it deleted a parent, and the widget with it", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const parent = WidgetInstance.create("VBox", { Name: "parent" });
	const child = WidgetInstance.create("Label", { Name: "child", Text: "child" });
	parent.append(child);
	let after = false;
	child.whenPlaced(() => window.remove(parent));
	child.whenPlaced(() => {
		after = true;
	});
	window.append(parent);
	finishPlacing();
	expect(after).toBe(false);
	window.forgetTree();
	window.dispose();
});

test("a tree a cleanup moves elsewhere while it is deleted keeps the windows not deleted yet", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	const outer = WidgetInstance.create("VBox", { Name: "outer" });
	const moved = WidgetInstance.create("VBox", { Name: "moved" });
	const elsewhere = WidgetInstance.create("VBox", { Name: "elsewhere" });
	window.append(elsewhere);
	window.append(outer);
	outer.append(moved);
	const first = WindowInstance.create(WINDOW);
	const second = WindowInstance.create(WINDOW);
	moved.append(first);
	moved.append(second);
	first.whenOpen(() => () => {
		outer.release(moved);
		elsewhere.append(moved);
	});
	window.remove(outer);
	expect(r.Rwidget_get_parent(moved.widget)).toBe(elsewhere.widget);
	expect(second.isOpen).toBe(true);
	window.forgetTree();
	window.dispose();
});

test("a widget the application moved from a closed window to another is not taken back, nor deleted", () => {
	const first = WindowInstance.create(WINDOW);
	const second = WindowInstance.create(WINDOW);
	first.materialize();
	second.materialize();
	const own = r.Rwidget_create_from_xml('<Label Name="own" Text="own"/>');
	r.Rwidget_add_child(r.Rwidget_find(first.window, CONTENT_NAME), own);
	first.close();
	r.Rwidget_add_child(r.Rwidget_find(second.window, CONTENT_NAME), own);
	first.materialize();
	expect(r.Rwidget_find(second.window, "own")).toBe(own);
	first.close();
	first.dispose();
	expect(r.Rwidget_is_valid(own)).toBe(1);
	second.dispose();
});

test("a function that throws as soon as whenOpen runs it is not kept", () => {
	const window = WindowInstance.create(WINDOW);
	window.materialize();
	expect(() => window.whenOpen(() => {
		throw new Error("at once");
	})).toThrow("at once");
	window.close();
	expect(() => window.materialize()).not.toThrow();
	window.dispose();
});

test("a function that closes and opens the window again stops the pass it was in", () => {
	const window = WindowInstance.create(WINDOW);
	let reopened = false;
	let runs = 0;
	let cleanups = 0;
	window.whenOpen(() => {
		if (!reopened) {
			reopened = true;
			window.close();
			window.materialize();
		}
	});
	window.whenOpen(() => {
		runs++;
		return () => void cleanups++;
	});
	window.materialize();
	expect(runs).toBe(1);
	window.dispose();
	expect(cleanups).toBe(1);
});

/** An outer window holding an inner one, open. */
function nested(): { readonly outer: WindowInstance; readonly inner: WindowInstance } {
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	outer.append(inner);
	outer.materialize();
	return { outer, inner };
}

test("an inner cleanup that disposes the outer window while it closes leaves it gone", () => {
	const { outer, inner } = nested();
	inner.whenOpen(() => () => outer.dispose());
	outer.close();
	outer.materialize();
	expect(outer.isOpen).toBe(false);
	expect(inner.isOpen).toBe(false);
	expect(r.Rwindow_is_valid(outer.window)).toBe(0);
});

test("an inner cleanup that throws: the outer window still closes, its cleanups run, and the failure is said", () => {
	const { outer, inner } = nested();
	const log: string[] = [];
	inner.whenOpen(() => () => {
		throw new Error("from an inner cleanup");
	});
	outer.whenOpen(() => () => log.push("outer"));
	const first = outer.window;
	expect(() => outer.close()).toThrow("from an inner cleanup");
	expect(r.Rwindow_is_valid(first)).toBe(0);
	expect(inner.isOpen).toBe(false);
	expect(log).toEqual(["outer"]);
	outer.materialize();
	expect(outer.isOpen).toBe(true);
	expect(inner.isOpen).toBe(true);
	outer.forgetTree();
	expect(() => outer.dispose()).toThrow("from an inner cleanup");
});

test("an inner cleanup that asks the outer window to run something waits for its next opening", () => {
	const { outer, inner } = nested();
	const log: string[] = [];
	inner.whenOpen(() => () => {
		outer.whenOpen(() => {
			log.push("ran");
			return () => log.push("cleaned");
		});
	});
	outer.close();
	expect(log).toEqual([]);
	outer.materialize();
	expect(log).toEqual(["ran"]);
	outer.forgetTree();
	outer.dispose();
	expect(log).toEqual(["ran", "cleaned"]);
});

test("a window its own function closes as it is placed stays closed", () => {
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	let closed = false;
	inner.whenOpen(() => {
		// (once: opened again, it would stay open)
		if (!closed) {
			closed = true;
			inner.close();
		}
	});
	outer.append(inner);
	outer.materialize();
	expect(inner.isOpen).toBe(false);
	outer.forgetTree();
	outer.dispose();
});

test("windows side by side all close, also past one whose cleanup throws", () => {
	const outer = WindowInstance.create(WINDOW);
	const box = WidgetInstance.create("VBox", {});
	const first = WindowInstance.create(WINDOW);
	const second = WindowInstance.create(WINDOW);
	box.append(first);
	box.append(second);
	outer.append(box);
	outer.materialize();
	first.whenOpen(() => () => {
		throw new Error("from the first");
	});
	expect(() => outer.close()).toThrow("from the first");
	expect([outer.isOpen, first.isOpen, second.isOpen]).toEqual([false, false, false]);
	outer.materialize();
	expect([outer.isOpen, first.isOpen, second.isOpen]).toEqual([true, true, true]);
	outer.forgetTree();
	expect(() => outer.dispose()).toThrow("from the first");
	expect([outer.isOpen, first.isOpen, second.isOpen]).toEqual([false, false, false]);
});

test("an inner window whose function throws as the outer one opens goes with it", () => {
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	const after = WindowInstance.create(WINDOW);
	inner.whenOpen(() => {
		throw new Error("from the inner");
	});
	outer.append(inner);
	outer.append(after);
	expect(() => outer.materialize()).toThrow("from the inner");
	expect([outer.isOpen, inner.isOpen, after.isOpen]).toEqual([false, false, false]);
});

test("a child that a function took away while it was made is not placed after all", () => {
	const outer = WindowInstance.create(WINDOW);
	outer.materialize();
	const box = WidgetInstance.create("VBox", {});
	const inner = WindowInstance.create(WINDOW);
	box.append(inner);
	inner.whenOpen(() => outer.release(box));
	outer.append(box);
	expect(box.placed).toBe(true);
	expect(r.Rwidget_get_parent(box.widget)).toBe(r.R_INVALID_ID);
	box.forgetTree();
	box.dispose();
	outer.dispose();
});

test("a child is placed at its place, also when user code added another after it while it was made", () => {
	const outer = WindowInstance.create(WINDOW);
	const parent = WidgetInstance.create("VBox", {});
	outer.append(parent);
	outer.materialize();
	const box = WidgetInstance.create("VBox", { Name: "box" });
	const inner = WindowInstance.create(WINDOW);
	const sibling = WidgetInstance.create("Label", { Name: "sibling" });
	box.append(inner);
	inner.whenOpen(() => parent.append(sibling));
	parent.append(box);
	const order = Array.from({ length: r.Rwidget_get_child_count(parent.widget) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(parent.widget, index)));
	expect(order).toEqual(["box", "sibling"]);
	outer.forgetTree();
	outer.dispose();
});

test("a window its function destroyed in Raven, then threw, is not kept as placed", () => {
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	inner.whenOpen(() => {
		r.Rwindow_destroy(inner.window);
		throw new Error("after destroying");
	});
	const handlers = eventStats().handlers;
	outer.append(inner);
	expect(() => outer.materialize()).toThrow("after destroying");
	expect(inner.placed).toBe(false);
	expect(eventStats().handlers).toBe(handlers);
});

test("windows side by side all go when the outer one does, also when a cleanup released one and threw", () => {
	const outer = WindowInstance.create(WINDOW);
	const box = WidgetInstance.create("VBox", {});
	const first = WindowInstance.create(WINDOW);
	const second = WindowInstance.create(WINDOW);
	box.append(first);
	box.append(second);
	outer.append(box);
	outer.materialize();
	first.whenOpen(() => () => {
		box.release(first);
		throw new Error("from the first");
	});
	outer.forgetTree();
	expect(() => outer.dispose()).toThrow("from the first");
	expect(second.isOpen).toBe(false);
});

test("the windows in an island kept while its window was closed open again with it", () => {
	const outer = WindowInstance.create(WINDOW);
	const island = WidgetInstance.create("Island", {});
	const inner = WindowInstance.create(WINDOW);
	island.append(inner);
	outer.append(island);
	outer.materialize();
	expect(inner.isOpen).toBe(true);
	outer.close();
	expect(inner.isOpen).toBe(false);
	outer.materialize();
	expect(inner.isOpen).toBe(true);
	outer.forgetTree();
	outer.dispose();
});

test("a child released by a cleanup while its window closes does not come back when it opens", () => {
	const outer = WindowInstance.create(WINDOW);
	const inner = WindowInstance.create(WINDOW);
	const sibling = WidgetInstance.create("Label", { Name: "sibling" });
	outer.append(inner);
	outer.append(sibling);
	outer.materialize();
	inner.whenOpen(() => () => outer.release(sibling));
	outer.close();
	outer.materialize();
	expect(r.Rwidget_find(outer.window, "sibling")).toBe(r.R_INVALID_ID);
	sibling.forgetTree();
	sibling.dispose();
	outer.forgetTree();
	outer.dispose();
});

test("a child taken away by a window it holds as its parent is made is not placed in that parent", () => {
	const outer = WindowInstance.create(WINDOW);
	const parent = WidgetInstance.create("VBox", {});
	const child = WidgetInstance.create("VBox", {});
	const inner = WindowInstance.create(WINDOW);
	child.append(inner);
	child.materialize();
	child.closeWindows();
	inner.whenOpen(() => parent.release(child));
	parent.append(child);
	outer.append(parent);
	outer.materialize();
	expect(r.Rwidget_get_parent(child.widget)).toBe(r.R_INVALID_ID);
	child.forgetTree();
	child.dispose();
	outer.forgetTree();
	outer.dispose();
});

test("a later child taken away by an earlier one's window as their parent is made is not made there", () => {
	const outer = WindowInstance.create(WINDOW);
	const parent = WidgetInstance.create("VBox", {});
	const first = WindowInstance.create(WINDOW);
	const later = WindowInstance.create(WINDOW);
	parent.append(first);
	parent.append(later);
	first.whenOpen(() => parent.release(later));
	outer.append(parent);
	outer.materialize();
	expect(first.isOpen).toBe(true);
	expect(later.isOpen).toBe(false);
	outer.forgetTree();
	outer.dispose();
	later.dispose();
});
