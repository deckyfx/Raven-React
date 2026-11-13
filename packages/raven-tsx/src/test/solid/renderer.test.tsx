/** @jsxImportSource solid-js */
/** Solid on real Raven widgets, without a window system or a GPU, clicked and typed into for real. */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createRoot, createSignal, ErrorBoundary, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import * as r from "../../core/raven";
import { eventStats } from "../../core/events";
import { resolveProps, type RavenProps } from "../../core/props";
import { SolidNode } from "../../solid/node";
import {
	Border, Button, Checkbox, createAction, createFrame, createShortcut, createWindow, HBox, Island, Label, Menu, MenuBar, MenuItem, Portal, RavenRoot, Separator, TextInput, VBox, Window,
	type WidgetInstance, type WindowInstance,
} from "../../solid/index";

const WINDOW = { Title: "Test", Width: 480, Height: 480 } as const;
let window: r.Rid = r.R_INVALID_ID;
let root: RavenRoot | null = null;
const errors: string[] = [];

beforeAll(() => {
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_NULL;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
	r.Rset_animations_enabled(0);
	r.Rerror_set_callback((_code, _severity, detail) => void errors.push(detail ?? ""));
});

afterEach(() => {
	root?.unmount();
	root = null;
	if (window !== r.R_INVALID_ID) {
		r.Rwindow_destroy(window);
		window = r.R_INVALID_ID;
	}
	r.Rdraw_frame();
	// (emptied first: a failure here must not fail every test after)
	const reported = errors.splice(0);
	expect(reported).toEqual([]);
});

afterAll(() => {
	r.Rquit(0);
	r.Rshutdown();
});

/** Lets the event loop run, with frames between. */
async function settle(ms = 20): Promise<void> {
	const end = performance.now() + ms;
	// (and some turns of the event loop at least: on a slow machine, a runner of CI, a few frames
	// take all the time, and React's scheduler, which runs at those turns, would get none)
	let turns = 0;
	do {
		r.Rdraw_frame();
		await new Promise<void>((resolve) => setImmediate(resolve));
		turns++;
	} while (performance.now() < end || turns < 10);
}

/** Renders a tree in a new window. */
async function mount(code: () => JSX.Element): Promise<void> {
	const made = createWindow(WINDOW);
	window = made.window;
	root = made.root;
	root.render(code);
	await settle();
}

const find = (name: string): r.Rid => r.Rwidget_find(window, name);
const text = (name: string): string | null => r.Rlabel_get_text(find(name));

/** Clicks a widget where it is now. */
function click(name: string): void {
	const widget = find(name);
	expect(widget).not.toBe(r.R_INVALID_ID);
	const [x, y, width, height] = r.Rwidget_get_rect(widget);
	expect(width).toBeGreaterThan(0);
	r.Rwindow_inject_mouse_move(window, x + width / 2, y + height / 2);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 1);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 0);
}

/** The names of the widgets under a widget, in order. */
function namesUnder(name: string): string[] {
	const parent = find(name);
	expect(parent).not.toBe(r.R_INVALID_ID);
	return Array.from({ length: r.Rwidget_get_child_count(parent) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(parent, index)) ?? "");
}

test("props and text children reach the widgets", async () => {
	await mount(() => (
		<VBox Name="box" Spacing={8} Slot={{ Padding: 12 }}>
			<Label Name="a" Text="from a prop" />
			<Label Name="b">from a child</Label>
			<Label Name="c">{"count: "}{3}</Label>
			<Button Name="d">press</Button>
		</VBox>
	));
	expect(text("a")).toBe("from a prop");
	expect(text("b")).toBe("from a child");
	expect(text("c")).toBe("count: 3");
	expect(namesUnder("box")).toEqual(["a", "b", "c", "d"]);
});

function Counter(): JSX.Element {
	const [count, setCount] = createSignal(0);
	return (
		<VBox Name="box">
			<Label Name="count">{count()}</Label>
			<Button Name="add" OnClicked={() => setCount(count() + 1)}>{count() % 2 ? "odd" : "even"}</Button>
			<Show when={count() >= 2}>
				<Label Name="extra">two or more</Label>
			</Show>
			<Label Name="last">last</Label>
		</VBox>
	);
}

test("a signal changes the same widget", async () => {
	await mount(() => <Counter />);
	const button = find("add");
	const label = find("count");
	click("add");
	expect(text("count")).toBe("1");
	expect(find("add")).toBe(button);
	expect(find("count")).toBe(label);
});

test("clicks change the widgets at once: no click is lost, even with nothing in between", async () => {
	await mount(() => <Counter />);
	for (let index = 0; index < 300; index++) {
		click("add");
	}
	expect(text("count")).toBe("300");
});

test("conditional widgets come and go, in their place", async () => {
	await mount(() => <Counter />);
	expect(find("extra")).toBe(r.R_INVALID_ID);
	click("add");
	click("add");
	expect(text("extra")).toBe("two or more");
	expect(namesUnder("box")).toEqual(["count", "add", "extra", "last"]);
});

test("a branch that goes takes its widgets and their handlers with it", async () => {
	const [shown, setShown] = createSignal(true);
	await mount(() => (
		<VBox Name="box">
			<Show when={shown()}>
				<Button Name="inside" OnClicked={() => {}}>inside</Button>
			</Show>
		</VBox>
	));
	const inside = find("inside");
	const handlers = eventStats().handlers;
	setShown(false);
	expect(r.Rwidget_is_valid(inside)).toBe(0);
	expect(eventStats().handlers).toBe(handlers - 1);
	setShown(true);
	expect(find("inside")).not.toBe(r.R_INVALID_ID);
});

test("an element kept in a variable keeps its widget when it is shown again", async () => {
	const [shown, setShown] = createSignal(true);
	let clicks = 0;
	function Kept(): JSX.Element {
		const kept = <Button Name="kept" OnClicked={() => clicks++}>kept</Button>;
		return (
			<VBox Name="box">
				<Show when={shown()}>{kept}</Show>
			</VBox>
		);
	}
	await mount(() => <Kept />);
	const widget = find("kept");
	setShown(false);
	expect(find("kept")).toBe(r.R_INVALID_ID);
	expect(r.Rwidget_is_valid(widget)).toBe(1);
	setShown(true);
	expect(find("kept")).toBe(widget);
	click("kept");
	expect(clicks).toBe(1);
});

function List(): JSX.Element {
	const [items, setItems] = createSignal(["a", "b", "c"]);
	return (
		<VBox Name="list">
			<Button Name="reverse" OnClicked={() => setItems([...items()].reverse())}>reverse</Button>
			<Button Name="add" OnClicked={() => setItems(["new", ...items()])}>add</Button>
			<For each={items()}>
				{(item) => (
					<HBox Name={`row-${item}`}>
						<Button Name={`remove-${item}`} OnClicked={() => setItems(items().filter((other) => other !== item))}>x</Button>
					</HBox>
				)}
			</For>
		</VBox>
	);
}

test("rows of a For move and keep their widgets", async () => {
	await mount(() => <List />);
	const row = find("row-c");
	click("reverse");
	expect(namesUnder("list").slice(2)).toEqual(["row-c", "row-b", "row-a"]);
	expect(find("row-c")).toBe(row);
	click("add");
	expect(namesUnder("list").slice(2)).toEqual(["row-new", "row-c", "row-b", "row-a"]);
	await settle();
	click("remove-c");
	expect(namesUnder("list").slice(2)).toEqual(["row-new", "row-b", "row-a"]);
	expect(r.Rwidget_is_valid(row)).toBe(0);
});

test("a row is removed by its own button, during its own click", async () => {
	await mount(() => <List />);
	click("remove-b");
	await settle();
	expect(namesUnder("list").slice(2)).toEqual(["row-a", "row-c"]);
	expect(find("row-b")).toBe(r.R_INVALID_ID);
});

function Form(props: { readonly filter?: (value: string) => string }): JSX.Element {
	const [value, setValue] = createSignal("");
	const [committed, setCommitted] = createSignal("");
	return (
		<VBox>
			<TextInput Name="input" Text={value()} OnChanged={(next) => setValue(props.filter ? props.filter(next) : next)} OnCommitted={setCommitted} />
			<Label Name="value">{value() || "empty"}</Label>
			<Label Name="committed">{committed() || "none"}</Label>
		</VBox>
	);
}

test("a TextInput gives its text at each change, and on Enter", async () => {
	await mount(() => <Form />);
	click("input");
	r.Rwindow_inject_text(window, "h");
	expect(text("value")).toBe("h");
	r.Rwindow_inject_text(window, "é");
	expect(text("value")).toBe("hé");
	expect(text("committed")).toBe("none");
	r.Rwindow_inject_key(window, r.R_KEY_ENTER, 1, 0);
	r.Rwindow_inject_key(window, r.R_KEY_ENTER, 0, 0);
	expect(text("committed")).toBe("hé");
});

test("a controlled TextInput shows what the signal says: a change can be refused or changed", async () => {
	await mount(() => <Form filter={(value) => value.replace(/[0-9]/g, "").toUpperCase()} />);
	click("input");
	r.Rwindow_inject_text(window, "a");
	expect(r.Rtext_input_get_text(find("input"))).toBe("A");
	r.Rwindow_inject_text(window, "7");
	expect(r.Rtext_input_get_text(find("input"))).toBe("A");
	r.Rwindow_inject_text(window, "b");
	expect(r.Rtext_input_get_text(find("input"))).toBe("AB");
});

test("the signal of a TextInput does not move the caret", async () => {
	await mount(() => <Form />);
	click("input");
	r.Rwindow_inject_text(window, "ac");
	r.Rwindow_inject_key(window, r.R_KEY_LEFT, 1, 0);
	r.Rwindow_inject_key(window, r.R_KEY_LEFT, 0, 0);
	r.Rwindow_inject_text(window, "b");
	expect(r.Rtext_input_get_text(find("input"))).toBe("abc");
});

test("a Checkbox gives its state, and a controlled one can refuse it", async () => {
	const [checked, setChecked] = createSignal(false);
	let locked = false;
	await mount(() => (
		<VBox>
			<Checkbox Name="box" Checked={checked()} OnChanged={(next) => setChecked(locked ? checked() : next)}>check</Checkbox>
		</VBox>
	));
	click("box");
	expect(checked()).toBe(true);
	expect(r.Rcheckbox_is_checked(find("box"))).toBe(1);
	locked = true;
	click("box");
	expect(checked()).toBe(true);
	expect(r.Rcheckbox_is_checked(find("box"))).toBe(1);
});

test("a prop that goes away remakes the widget, in its place, with its children working", async () => {
	const [faded, setFaded] = createSignal(true);
	let clicks = 0;
	await mount(() => (
		<VBox Name="outer">
			<Label Name="before">before</Label>
			<Border Name="panel" Opacity={faded() ? 0.5 : undefined}>
				<Button Name="inner" OnClicked={() => clicks++}>inner</Button>
			</Border>
			<Label Name="after">after</Label>
		</VBox>
	));
	const panel = find("panel");
	const inner = find("inner");
	setFaded(false);
	expect(find("panel")).not.toBe(panel);
	expect(r.Rwidget_is_valid(panel)).toBe(0);
	expect(find("inner")).toBe(inner);
	expect(namesUnder("outer")).toEqual(["before", "panel", "after"]);
	await settle();
	click("inner");
	expect(clicks).toBe(1);
});

test("a ref gives the widget, and stays right when the widget is made again", async () => {
	let input: WidgetInstance | undefined;
	let panel: WidgetInstance | undefined;
	const [faded, setFaded] = createSignal(true);
	await mount(() => (
		<VBox>
			<TextInput ref={input} Name="input" />
			<Border ref={panel} Name="panel" Opacity={faded() ? 0.5 : undefined} />
		</VBox>
	));
	expect(input?.widget).toBe(find("input"));
	input?.focus();
	expect(r.Rwidget_is_focused(find("input"))).toBe(1);
	const before = panel?.widget;
	setFaded(false);
	expect(panel?.widget).not.toBe(before);
	expect(panel?.widget).toBe(find("panel"));
});

test("onMount and onCleanup run, the cleanups when the tree goes", async () => {
	const log: string[] = [];
	function Timer(): JSX.Element {
		const [ticks, setTicks] = createSignal(0);
		onMount(() => {
			log.push(`mount ${r.Rwidget_is_valid(find("ticks"))}`);
			const timer = setInterval(() => setTicks((value) => value + 1), 2);
			onCleanup(() => {
				clearInterval(timer);
				log.push("cleanup");
			});
		});
		return <Label Name="ticks">{ticks()}</Label>;
	}
	await mount(() => <VBox><Timer /></VBox>);
	await settle(40);
	expect(Number(text("ticks"))).toBeGreaterThan(0);
	// (by onMount, the widgets are in their window)
	expect(log).toEqual(["mount 1"]);
	root?.unmount();
	root = null;
	expect(log).toEqual(["mount 1", "cleanup"]);
});

test("nothing grows: handlers go with their widgets, and native callbacks are shared", async () => {
	await mount(() => <List />);
	click("reverse");
	root?.unmount();
	root = null;
	expect(eventStats().handlers).toBe(0);
	const callbacks = eventStats().nativeCallbacks;
	for (let index = 0; index < 40; index++) {
		const made = createWindow(WINDOW);
		made.root.render(() => <List />);
		made.root.unmount();
		r.Rwindow_destroy(made.window);
	}
	expect(eventStats()).toEqual({ handlers: 0, nativeCallbacks: callbacks });
});

test("an exception in a handler does not cross C", async () => {
	const report = console.error;
	const reported: string[] = [];
	console.error = (...values: unknown[]): void => void reported.push(values.map(String).join(" "));
	let after = 0;
	try {
		await mount(() => (
			<VBox>
				<Button Name="throws" OnClicked={() => { throw new Error("from a handler"); }}>throws</Button>
				<Button Name="works" OnClicked={() => after++}>works</Button>
			</VBox>
		));
		click("throws");
		click("works");
	} finally {
		console.error = report;
	}
	expect(reported.join()).toContain("from a handler");
	expect(after).toBe(1);
});

test("text beside widgets goes to the nearest ErrorBoundary", async () => {
	const [loud, setLoud] = createSignal(false);
	await mount(() => (
		<VBox Name="box">
			<ErrorBoundary fallback={(error: Error) => <Label Name="error">{error.message}</Label>}>
				<HBox>
					<Label>fine</Label>
					{loud() ? "shouting" : ""}
				</HBox>
			</ErrorBoundary>
		</VBox>
	));
	expect(find("error")).toBe(r.R_INVALID_ID);
	setLoud(true);
	expect(text("error")).toContain('text must be alone in a widget: "shouting"');
});

test("windows come and go with their elements, and follow their props", async () => {
	let first: WindowInstance | undefined;
	let second: WindowInstance | undefined;
	let closing = 0;
	const [title, setTitle] = createSignal("First");
	const [both, setBoth] = createSignal(true);
	const windows = new RavenRoot();
	windows.render(() => (
		<>
			<Window ref={first} Title={title()} Width={300} Height={200}>
				<Label Name="in-first">one</Label>
			</Window>
			<Show when={both()}>
				<Window ref={second} Title="Second" Width={200} Height={100} OnClose={() => closing++}>
					<Label Name="in-second">two</Label>
				</Window>
			</Show>
		</>
	));
	const a = first?.window ?? r.R_INVALID_ID;
	const b = second?.window ?? r.R_INVALID_ID;
	expect(r.Rwindow_get_title(a)).toBe("First");
	expect(r.Rwindow_get_title(b)).toBe("Second");
	expect(r.Rlabel_get_text(r.Rwidget_find(b, "in-second"))).toBe("two");

	setTitle("Renamed");
	expect(first?.window).toBe(a);
	expect(r.Rwindow_get_title(a)).toBe("Renamed");

	// with OnClose, closing is a request: the window stays until the element goes
	r.Rwindow_close(b);
	expect(closing).toBe(1);
	expect(r.Rwindow_is_valid(b)).toBe(1);
	setBoth(false);
	expect(r.Rwindow_is_valid(b)).toBe(0);
	expect(r.Rwindow_is_valid(a)).toBe(1);

	// without it, the user can close it at any time, and updates do no harm
	r.Rwindow_close(a);
	expect(first?.isOpen).toBe(false);
	setTitle("Again");
	windows.unmount();
	expect(eventStats().handlers).toBe(0);
});

test("a widget outside a window is said clearly", () => {
	const windows = new RavenRoot();
	expect(() => windows.render(() => <Label>lost</Label>)).toThrow("must be inside a <Window>");
	windows.unmount();
});

test("a Separator in a Menu is a line of the menu, and elsewhere a widget", async () => {
	const [name, setName] = createSignal("line");
	await mount(() => (
		<VBox Name="box">
			<Separator Name="plain" />
			<MenuBar>
				<Menu Name="m" Title="File">
					<MenuItem Text="Open" />
					<Separator Name={name()} />
					<MenuItem Text="Quit" />
				</Menu>
			</MenuBar>
		</VBox>
	));
	expect(r.Rwidget_get_child_count(find("m"))).toBe(3);
	const line = find("line");
	expect(r.Rwidget_get_type(line)).toBe(r.R_WIDGET_MENU_ITEM);
	expect(r.Rwidget_get_type(find("plain"))).toBe(r.R_WIDGET_SEPARATOR);
	setName("renamed");
	expect(find("renamed")).toBe(line);
});

test("a Portal renders into a widget made by hand, and takes its children back when it goes", async () => {
	const [shown, setShown] = createSignal(true);
	const box = r.Rwidget_create_from_xml('<VBox Name="by-hand"/>');
	let clicks = 0;
	await mount(() => (
		<VBox Name="outer">
			<Show when={shown()}>
				<Portal widget={box}>
					<Button Name="ported" OnClicked={() => clicks++}>ported</Button>
				</Portal>
			</Show>
		</VBox>
	));
	r.Rwidget_add_child(find("outer"), box);
	await settle();
	expect(namesUnder("by-hand")).toEqual(["ported"]);
	click("ported");
	expect(clicks).toBe(1);
	setShown(false);
	expect(namesUnder("by-hand")).toEqual([]);
	expect(r.Rwidget_is_valid(box)).toBe(1);
});

test("shortcuts fire on their window, and go away with their component", async () => {
	let fired = 0;
	let owner: WindowInstance | undefined;
	const [count, setCount] = createSignal(1);
	function Keys(props: { readonly count: number }): JSX.Element {
		createShortcut(() => owner, "Ctrl+K", () => {
			fired += props.count;
		});
		return <Label>x</Label>;
	}
	const [shown, setShown] = createSignal(true);
	const windows = new RavenRoot();
	windows.render(() => (
		<Window ref={owner}>
			<VBox>
				<Show when={shown()}>
					<Keys count={count()} />
				</Show>
			</VBox>
		</Window>
	));
	await settle();
	const id = owner?.window ?? r.R_INVALID_ID;
	const press = (): void => {
		r.Rwindow_inject_key(id, r.R_KEY_K, 1, r.R_MOD_CTRL);
		r.Rwindow_inject_key(id, r.R_KEY_K, 0, r.R_MOD_CTRL);
	};
	press();
	expect(fired).toBe(1);
	setCount(10);
	press();
	expect(fired).toBe(11);
	setShown(false);
	press();
	expect(fired).toBe(11);
	windows.unmount();
	expect(eventStats().handlers).toBe(0);
});

test("createAction names a function, and an On prop takes a name", async () => {
	let fired = 0;
	function Named(): JSX.Element {
		createAction("test.solid.named", () => fired++);
		return <VBox><Button Name="go" OnClicked="test.solid.named">go</Button></VBox>;
	}
	await mount(() => <Named />);
	click("go");
	expect(fired).toBe(1);
	r.Raction_fire("test.solid.named", r.R_INVALID_ID);
	expect(fired).toBe(2);
	root?.unmount();
	root = null;
	r.Raction_fire("test.solid.named", r.R_INVALID_ID);
	expect(fired).toBe(2);
});

test("createFrame runs at each frame while its component lives", async () => {
	let frames = 0;
	const [shown, setShown] = createSignal(true);
	function Ticking(): JSX.Element {
		createFrame(() => frames++);
		return <Label>ticking</Label>;
	}
	await mount(() => <VBox><Show when={shown()}><Ticking /></Show></VBox>);
	await settle(30);
	expect(frames).toBeGreaterThan(0);
	setShown(false);
	const stopped = frames;
	await settle(30);
	expect(frames).toBe(stopped);
});

test("a widget after text goes to the nearest ErrorBoundary too, the text being first", async () => {
	const [more, setMore] = createSignal(false);
	await mount(() => (
		<VBox Name="box">
			<ErrorBoundary fallback={(error: Error) => <Label Name="error">{error.message}</Label>}>
				<HBox>
					{"words"}
					<Show when={more()}>
						<Label>a widget</Label>
					</Show>
				</HBox>
			</ErrorBoundary>
		</VBox>
	));
	expect(find("error")).toBe(r.R_INVALID_ID);
	setMore(true);
	expect(text("error")).toContain('text must be alone in a widget: "words"');
});

test("the ref of a Separator in a Menu gives its line of the menu", async () => {
	let line: WidgetInstance | undefined;
	await mount(() => (
		<VBox>
			<MenuBar>
				<Menu Name="m" Title="File">
					<MenuItem Text="Open" />
					<Separator ref={line} Name="line" />
				</Menu>
			</MenuBar>
		</VBox>
	));
	expect(line?.widget).toBe(find("line"));
	expect(r.Rwidget_get_type(find("line"))).toBe(r.R_WIDGET_MENU_ITEM);
});

test("a Separator whose node, made when placed, disposes the root of its Menu leaves nothing in the tree", async () => {
	await mount(() => <VBox />);
	// (what waits for the node of a Separator runs as it is made, when placed: a ref waits longer, see below)
	createRoot((dispose) => {
		const menu = SolidNode.element("Menu");
		const line = SolidNode.element("Separator");
		line.withInstance(() => dispose());
		// (the Menu went with its root, before it was placed: the line is not added to it)
		expect(() => menu.insert(line, null)).not.toThrow();
		expect(menu.children).toEqual([]);
	});
});

test("a window that moves to another parent stays open, the same window", async () => {
	const [where, setWhere] = createSignal<"a" | "b">("a");
	let kept: WindowInstance | undefined;
	function Moving(): JSX.Element {
		const own = (
			<Window ref={kept} Title="kept" Width={120} Height={80}>
				<Label Name="in-kept">in</Label>
			</Window>
		);
		// (b comes first: its effect places the window while a still has it, which is a move)
		return (
			<VBox>
				<VBox Name="b">{where() === "b" && own}</VBox>
				<VBox Name="a">{where() === "a" && own}</VBox>
			</VBox>
		);
	}
	await mount(() => <Moving />);
	const opened = kept?.window;
	expect(kept?.isOpen).toBe(true);
	setWhere("b");
	expect(kept?.isOpen).toBe(true);
	expect(kept?.window).toBe(opened);
	// (back: b lets it go first, which closes it, as a window shown no more; a then opens it again)
	setWhere("a");
	expect(kept?.isOpen).toBe(true);
	expect(r.Rwidget_find(kept?.window ?? r.R_INVALID_ID, "in-kept")).not.toBe(r.R_INVALID_ID);
});

test("a Separator whose ref adds a sibling after it goes before that sibling", async () => {
	await mount(() => <VBox Name="list" />);
	createRoot((dispose) => {
		const list = SolidNode.container(find("list"));
		const label = (name: string): SolidNode => {
			const node = SolidNode.element("Label");
			node.setProp("Name", name);
			return node;
		};
		const [first, middle, last] = [label("first"), label("middle"), label("last")];
		list.insert(first, null);
		list.insert(last, null);
		const line = SolidNode.element("Separator");
		line.setProp("Name", "line");
		line.withInstance(() => list.insert(middle, last));
		list.insert(line, last);
		expect(list.children).toEqual([first, line, middle, last]);
		expect(namesUnder("list")).toEqual(["first", "line", "middle", "last"]);
		list.clear();
		dispose();
	});
});

test("a window whose closing cleanup places it elsewhere is not deleted there", async () => {
	await mount(() => <VBox />);
	const before = SolidNode.container(r.R_INVALID_ID);
	const after = SolidNode.container(r.R_INVALID_ID);
	// (made with no owner: as soon as it is out of a tree, it would go)
	const node = SolidNode.element("Window");
	let host: WindowInstance | undefined;
	node.withInstance((instance) => {
		host = instance as WindowInstance;
	});
	before.insert(node, null);
	expect(host?.isOpen).toBe(true);
	let moved = false;
	host?.whenOpen(() => () => {
		if (!moved) {
			moved = true;
			after.insert(node, null);
		}
	});
	before.release(node);
	expect(after.children).toEqual([node]);
	expect(host?.isOpen).toBe(true);
	after.clear();
	expect(host?.isOpen).toBe(false);
});

test("a Portal whose children fail takes away those it placed", async () => {
	const box = r.Rwidget_create_from_xml('<VBox Name="by-hand"/>');
	const made = createWindow(WINDOW);
	window = made.window;
	root = made.root;
	// (no ErrorBoundary: the failure leaves the render, which deletes the tree)
	expect(() =>
		made.root.render(() => (
			<Portal widget={box}>
				<Button Name="placed" OnClicked={() => {}} />
				{"words"}
			</Portal>
		)),
	).toThrow('text must be in a widget: "words"');
	expect(r.Rwidget_get_child_count(box)).toBe(0);
	r.Rwidget_destroy(box);
});

test("the Text of a widget comes back when the text in it goes", async () => {
	const [shown, setShown] = createSignal(false);
	const [value, setValue] = createSignal("abc");
	await mount(() => (
		<VBox>
			<Label Name="fallback" Text="fallback">
				{shown() ? "shown" : null}
				{shown() ? "!" : null}
			</Label>
			<Label Name="plain">{value()}</Label>
		</VBox>
	));
	expect(text("fallback")).toBe("fallback");
	setShown(true);
	expect(text("fallback")).toBe("shown!");
	setShown(false);
	expect(text("fallback")).toBe("fallback");
	// (with no Text of its own, an empty text is its Text: the same widget, with nothing in it)
	const plain = find("plain");
	setValue("");
	expect(text("plain")).toBe("");
	expect(find("plain")).toBe(plain);
});

test("a tree rendered by a cleanup of the one that goes stays", async () => {
	let again = true;
	function First(): JSX.Element {
		onCleanup(() => {
			if (again) {
				again = false;
				root?.render(() => <Label Name="next">next</Label>);
			}
		});
		return <Label Name="first">first</Label>;
	}
	await mount(() => <First />);
	root?.unmount();
	expect(find("first")).toBe(r.R_INVALID_ID);
	expect(text("next")).toBe("next");
});

test("a tree rendered by a cleanup of the one a render replaces is replaced too", async () => {
	let again = true;
	let nextCleanups = 0;
	function Next(): JSX.Element {
		onCleanup(() => void nextCleanups++);
		return <Label Name="next">next</Label>;
	}
	function First(): JSX.Element {
		onCleanup(() => {
			if (again) {
				again = false;
				root?.render(() => <Next />);
			}
		});
		return <Label Name="first">first</Label>;
	}
	await mount(() => <First />);
	root?.render(() => <Label Name="final">final</Label>);
	expect([find("first"), find("next")]).toEqual([r.R_INVALID_ID, r.R_INVALID_ID]);
	expect(text("final")).toBe("final");
	expect(nextCleanups).toBe(1);
});

test("a child the core refuses is not kept in the tree", () => {
	const windows = SolidNode.container(r.R_INVALID_ID);
	const label = SolidNode.element("Label");
	// (a root of windows holds windows: a widget has nowhere to go)
	expect(() => windows.insert(label, null)).toThrow("must be inside a <Window>");
	expect(windows.children).toEqual([]);
	expect(label.parent).toBe(null);
});

test("a child that a closing window moved elsewhere while its parent is cleared keeps its owner", () => {
	createRoot((dispose) => {
		const cleared = SolidNode.container(r.R_INVALID_ID);
		const elsewhere = SolidNode.container(r.R_INVALID_ID);
		const closing = SolidNode.element("Window");
		const moved = SolidNode.element("Window");
		let movedHost: WindowInstance | undefined;
		moved.withInstance((instance) => {
			movedHost = instance as WindowInstance;
		});
		cleared.insert(closing, null);
		cleared.insert(moved, null);
		let once = true;
		closing.withInstance((instance) =>
			(instance as WindowInstance).whenOpen(() => () => {
				if (once) {
					once = false;
					elsewhere.insert(moved, null);
				}
			}),
		);
		cleared.clear();
		expect(elsewhere.children).toEqual([moved]);
		// (its owner is still there: taken out, it stays alive, and opens again when placed)
		elsewhere.release(moved);
		elsewhere.insert(moved, null);
		expect(movedHost?.isOpen).toBe(true);
		elsewhere.clear();
		dispose();
	});
});

test("a window that opens with a failure leaves both trees, and closes when it has no owner", () => {
	const windows = SolidNode.container(r.R_INVALID_ID);
	// (made with no owner: out of a tree, nothing keeps it)
	const node = SolidNode.element("Window");
	let host: WindowInstance | undefined;
	node.withInstance((instance) => {
		host = instance as WindowInstance;
		host.whenOpen(() => {
			throw new Error("from whenOpen");
		});
	});
	expect(() => windows.insert(node, null)).toThrow("from whenOpen");
	expect(windows.children).toEqual([]);
	expect(host?.isOpen).toBe(false);
	// (the core has nothing of it left either: clearing it touches nothing)
	expect(() => windows.clear()).not.toThrow();
});

test("a render that a render inside its code replaced shows nothing of its own", async () => {
	let again = true;
	await mount(() => <Label Name="before">before</Label>);
	root?.render(() => {
		if (again) {
			again = false;
			root?.render(() => <Label Name="inner">inner</Label>);
		}
		return <Label Name="outer">outer</Label>;
	});
	expect(find("outer")).toBe(r.R_INVALID_ID);
	expect(text("inner")).toBe("inner");
	root?.unmount();
	expect(find("inner")).toBe(r.R_INVALID_ID);
});

test("a window added in a tree that is not shown opens only once the tree is shown", async () => {
	const [shown, setShown] = createSignal(true);
	const [late, setLate] = createSignal(false);
	let added: WindowInstance | undefined;
	function Kept(): JSX.Element {
		const kept = <VBox Name="kept">{late() && <Window ref={added} Title="late" Width={120} Height={80} />}</VBox>;
		return (
			<VBox Name="outer">
				<Show when={shown()}>{kept}</Show>
			</VBox>
		);
	}
	await mount(() => <Kept />);
	setShown(false);
	setLate(true);
	expect(added?.isOpen).toBe(false);
	setShown(true);
	expect(added?.isOpen).toBe(true);
});

test("a window moved elsewhere by its own function, which then throws, stays where it went", () => {
	const first = SolidNode.container(r.R_INVALID_ID);
	const second = SolidNode.container(r.R_INVALID_ID);
	// (made with no owner: a cleanup that took it for its own would delete it)
	const node = SolidNode.element("Window");
	let host: WindowInstance | undefined;
	let once = true;
	node.withInstance((instance) => {
		host = instance as WindowInstance;
		host.whenOpen(() => {
			if (once) {
				once = false;
				second.insert(node, null);
				throw new Error("after the move");
			}
		});
	});
	expect(() => first.insert(node, null)).toThrow("after the move");
	expect([first.children, second.children]).toEqual([[], [node]]);
	expect(host?.isOpen).toBe(true);
	second.clear();
	expect(host?.isOpen).toBe(false);
});

test("a window that fails to open and then to close is still deleted when nothing owns it", () => {
	const windows = SolidNode.container(r.R_INVALID_ID);
	const node = SolidNode.element("Window");
	const label = SolidNode.element("Label");
	label.setProp("Name", "held");
	let held: WidgetInstance | undefined;
	label.withInstance((instance) => {
		held = instance as WidgetInstance;
	});
	node.insert(label, null);
	node.withInstance((instance) => {
		const window = instance as WindowInstance;
		window.whenOpen(() => () => {
			throw new Error("from the cleanup");
		});
		window.whenOpen(() => {
			throw new Error("from the opening");
		});
	});
	const errorLog = console.error;
	console.error = () => {};
	try {
		expect(() => windows.insert(node, null)).toThrow("from the opening");
	} finally {
		console.error = errorLog;
	}
	expect(windows.children).toEqual([]);
	expect(r.Rwidget_is_valid(held?.widget ?? r.R_INVALID_ID)).toBe(0);
});

test("a tree a render in the code made stays when that code then throws", async () => {
	await mount(() => <Label Name="before">before</Label>);
	expect(() =>
		root?.render(() => {
			root?.render(() => <Label Name="inner">inner</Label>);
			throw new Error("after the render");
		}),
	).toThrow("after the render");
	expect(text("inner")).toBe("inner");
});

test("a Separator whose ref throws is not kept in the tree, and the next ones go in", async () => {
	await mount(() => <VBox Name="list" />);
	const list = SolidNode.container(find("list"));
	const line = SolidNode.element("Separator");
	line.withInstance(() => {
		throw new Error("from the ref");
	});
	expect(() => list.insert(line, null)).toThrow("from the ref");
	expect(list.children).toEqual([]);
	const after = SolidNode.element("Label");
	after.setProp("Name", "after");
	list.insert(after, null);
	expect(namesUnder("list")).toEqual(["after"]);
	list.clear();
});

test("an empty text beside a widget that goes is the Text again", async () => {
	const [shown, setShown] = createSignal(true);
	// (what the node gives the core as Text, each time: a Button holds widgets, but says no Text back)
	const given: (string | undefined)[] = [];
	const watch = (instance: WidgetInstance): void => {
		const update = instance.update.bind(instance);
		instance.update = <Child,>(props: RavenProps<Child>): void => {
			// (as the core reads it: text in the children is the Text)
			given.push(resolveProps(props).attributes.get("Text"));
			update(props);
		};
	};
	await mount(() => (
		<Button Name="b" Text="prop" ref={watch}>
			{""}
			{shown() && <Label Name="inner" />}
		</Button>
	));
	setShown(false);
	// (alone, the empty text is the Text the code wrote)
	expect(given.at(-1)).toBe("");
	setShown(true);
	// (beside a widget, it is no Text: the prop is)
	expect(given.at(-1)).toBe("prop");
});

test("the ref of a widget comes once Raven has it, placed, as React's does", async () => {
	let given = r.R_INVALID_ID;
	let parent = r.R_INVALID_ID;
	await mount(() => (
		<VBox Name="box">
			<Button
				Name="focused"
				ref={(instance: WidgetInstance) => {
					given = instance.widget;
					parent = r.Rwidget_get_parent(instance.widget);
					instance.focus();
				}}
			/>
		</VBox>
	));
	expect(given).toBe(find("focused"));
	expect(parent).toBe(find("box"));
});

test("a widget can take the place of the text in a widget, and the text its place again", async () => {
	const [busy, setBusy] = createSignal(false);
	// (the widgets the tree put in it: a Button shows its Text in one of its own, with no name)
	const placed = (): string[] => namesUnder("b").filter((name) => name !== "");
	await mount(() => <Button Name="b">{busy() ? <Label Name="spinning">...</Label> : "Save"}</Button>);
	expect(placed()).toEqual([]);
	setBusy(true);
	expect(placed()).toEqual(["spinning"]);
	setBusy(false);
	expect(placed()).toEqual([]);
	setBusy(true);
	expect(placed()).toEqual(["spinning"]);
});

test("a widget put before the text of a widget, the text staying, is refused at the end of the task", async () => {
	const button = SolidNode.element("Button");
	const text = SolidNode.text("Save");
	const label = SolidNode.element("Label");
	button.insert(text, null);
	const said: string[] = [];
	const errorLog = console.error;
	console.error = (...parts: unknown[]) => void said.push(parts.map(String).join(" "));
	try {
		// (as Solid replaces: the old one would go right after. It does not here)
		button.insert(label, text);
		await Promise.resolve();
	} finally {
		console.error = errorLog;
	}
	expect(said.join("\n")).toContain('text must be alone in a widget: "Save"');
	expect(button.children).toEqual([text]);
});

test("a component whose cleanup throws still stops its actions", async () => {
	let fired = 0;
	function Stale(): JSX.Element {
		createAction("test.stale", () => void fired++);
		onCleanup(() => {
			throw new Error("from a cleanup");
		});
		return <Label>stale</Label>;
	}
	await mount(() => <Stale />);
	r.Raction_fire("test.stale", r.R_INVALID_ID);
	expect(fired).toBe(1);
	expect(() => root?.unmount()).toThrow("from a cleanup");
	r.Raction_fire("test.stale", r.R_INVALID_ID);
	expect(fired).toBe(1);
});

test("an element kept in a variable, shown in a Portal, keeps its widget when the Portal comes back", async () => {
	const [shown, setShown] = createSignal(true);
	const box = r.Rwidget_create_from_xml('<VBox Name="by-hand"/>');
	function Kept(): JSX.Element {
		const kept = <Label Name="kept">kept</Label>;
		return (
			<VBox Name="outer">
				<Show when={shown()}>
					<Portal widget={box}>{kept}</Portal>
				</Show>
			</VBox>
		);
	}
	await mount(() => <Kept />);
	r.Rwidget_add_child(find("outer"), box);
	const widget = find("kept");
	setShown(false);
	expect(namesUnder("by-hand")).toEqual([]);
	expect(r.Rwidget_is_valid(widget)).toBe(1);
	setShown(true);
	expect(find("kept")).toBe(widget);
});

test("an island kept in a variable leaves its window alive, and comes back", async () => {
	const [shown, setShown] = createSignal(true);
	let owner: WindowInstance | undefined;
	function Islands(): JSX.Element {
		const kept = <Island Name="island"><Label>island</Label></Island>;
		return (
			<Window ref={owner} Width={300} Height={200}>
				<VBox Name="content" />
				<Show when={shown()}>{kept}</Show>
			</Window>
		);
	}
	const windows = new RavenRoot();
	windows.render(() => <Islands />);
	const id = owner?.window ?? r.R_INVALID_ID;
	const island = r.Rwindow_get_island(id);
	expect(island).not.toBe(r.R_INVALID_ID);
	setShown(false);
	expect(r.Rwindow_get_island(id)).toBe(r.R_INVALID_ID);
	expect(r.Rwidget_is_valid(island)).toBe(1);
	setShown(true);
	expect(r.Rwindow_get_island(id)).toBe(island);
	windows.unmount();
	expect(r.Rwidget_is_valid(island)).toBe(0);
	expect(eventStats().handlers).toBe(0);
});

test("unmount takes the widgets away even when a cleanup throws", async () => {
	function Throws(): JSX.Element {
		onCleanup(() => {
			throw new Error("from a cleanup");
		});
		return <Label Name="throws">throws</Label>;
	}
	await mount(() => <VBox Name="box"><Throws /></VBox>);
	const box = find("box");
	expect(() => root?.unmount()).toThrow("from a cleanup");
	root = null;
	expect(r.Rwidget_is_valid(box)).toBe(0);
});

test("a child kept by an outer owner leaves alive when the widget that held it goes", async () => {
	const [shown, setShown] = createSignal(true);
	function Outer(): JSX.Element {
		const kept = <Label Name="kept">kept</Label>;
		return (
			<VBox Name="outer">
				<Show when={shown()}>
					<VBox Name="inner">{kept}</VBox>
				</Show>
			</VBox>
		);
	}
	await mount(() => <Outer />);
	const widget = find("kept");
	const inner = find("inner");
	setShown(false);
	expect(r.Rwidget_is_valid(inner)).toBe(0);
	expect(r.Rwidget_is_valid(widget)).toBe(1);
	setShown(true);
	expect(find("kept")).toBe(widget);
	expect(r.Rwidget_get_parent(widget)).toBe(find("inner"));
});

test("a shortcut waits for its window to open: one made before it is shown", async () => {
	let fired = 0;
	const [open, setOpen] = createSignal(false);
	let owner: WindowInstance | undefined;
	function Keys(): JSX.Element {
		// (the element is made now, and its ref set, but the window opens when it is shown)
		const later = (
			<Window ref={owner} Width={200} Height={100}>
				<Label>later</Label>
			</Window>
		);
		createShortcut(() => owner, "Ctrl+J", () => fired++);
		return <Show when={open()}>{later}</Show>;
	}
	const windows = new RavenRoot();
	windows.render(() => <Keys />);
	await settle();
	expect(owner?.isOpen).toBe(false);
	setOpen(true);
	await settle();
	const id = owner?.window ?? r.R_INVALID_ID;
	expect(r.Rwindow_is_valid(id)).toBe(1);
	r.Rwindow_inject_key(id, r.R_KEY_J, 1, r.R_MOD_CTRL);
	r.Rwindow_inject_key(id, r.R_KEY_J, 0, r.R_MOD_CTRL);
	expect(fired).toBe(1);
	windows.unmount();
	expect(eventStats().handlers).toBe(0);
});

test("a tree that throws while it renders leaves nothing: its actions and its widgets go", () => {
	let fired = 0;
	function Failing(): JSX.Element {
		createAction("test.solid.failing", () => fired++);
		throw new Error("from a render");
	}
	const made = createWindow(WINDOW);
	window = made.window;
	root = made.root;
	expect(() => made.root.render(() => <VBox Name="box"><Failing /></VBox>)).toThrow("from a render");
	r.Raction_fire("test.solid.failing", r.R_INVALID_ID);
	expect(fired).toBe(0);
	expect(find("box")).toBe(r.R_INVALID_ID);
	expect(eventStats().handlers).toBe(0);
});

test("text refused beside widgets leaves the text node as it was", () => {
	const box = SolidNode.element("HBox");
	const empty = SolidNode.text("");
	box.insert(empty, null);
	box.insert(SolidNode.element("Label"), null);
	expect(() => empty.setText("x")).toThrow('text must be alone in a widget: "x"');
	expect(empty.text).toBe("");
});

test("a window kept in a variable closes when hidden, and opens again with the same ref, children and shortcut", async () => {
	let fired = 0;
	const [shown, setShown] = createSignal(true);
	let owner: WindowInstance | undefined;
	function Kept(): JSX.Element {
		const kept = (
			<Window ref={owner} Title="kept" Width={200} Height={100}>
				<Label Name="inside">inside</Label>
			</Window>
		);
		createShortcut(() => owner, "Ctrl+L", () => fired++);
		return <Show when={shown()}>{kept}</Show>;
	}
	const windows = new RavenRoot();
	windows.render(() => <Kept />);
	await settle();
	const instance = owner;
	const first = owner?.window ?? r.R_INVALID_ID;
	const label = r.Rwidget_find(first, "inside");
	expect(label).not.toBe(r.R_INVALID_ID);
	setShown(false);
	expect(r.Rwindow_is_valid(first)).toBe(0);
	expect(r.Rwidget_is_valid(label)).toBe(1);
	setShown(true);
	await settle();
	expect(owner).toBe(instance);
	const second = owner?.window ?? r.R_INVALID_ID;
	expect(r.Rwindow_is_valid(second)).toBe(1);
	expect(r.Rwindow_get_title(second)).toBe("kept");
	expect(r.Rwidget_find(second, "inside")).toBe(label);
	r.Rwindow_inject_key(second, r.R_KEY_L, 1, r.R_MOD_CTRL);
	r.Rwindow_inject_key(second, r.R_KEY_L, 0, r.R_MOD_CTRL);
	expect(fired).toBe(1);
	windows.unmount();
	expect(r.Rwidget_is_valid(label)).toBe(0);
	expect(eventStats().handlers).toBe(0);
});

test("a node placed before itself stays where it is", () => {
	const box = SolidNode.element("VBox");
	const [a, b, c, d] = ["a", "b", "c", "d"].map(() => SolidNode.element("Label"));
	for (const node of [a, b, c, d]) {
		box.insert(node!, null);
	}
	box.insert(c!, c!);
	// (by identity: the four are alike)
	expect(box.children.map((node) => [a, b, c, d].indexOf(node))).toEqual([0, 1, 2, 3]);
});

test("a window inside a box a condition hides closes with it, and opens again when shown", async () => {
	const [shown, setShown] = createSignal(true);
	let inner: WindowInstance | undefined;
	function Nested(): JSX.Element {
		const box = (
			<VBox Name="holder">
				<Window ref={inner} Title="inner" Width={120} Height={80}>
					<Label>inner</Label>
				</Window>
			</VBox>
		);
		return <VBox Name="outer"><Show when={shown()}>{box}</Show></VBox>;
	}
	await mount(() => <Nested />);
	expect(inner?.isOpen).toBe(true);
	setShown(false);
	expect(inner?.isOpen).toBe(false);
	setShown(true);
	expect(inner?.isOpen).toBe(true);
	expect(r.Rwindow_get_title(inner?.window ?? r.R_INVALID_ID)).toBe("inner");
});

test("a window taken out of the tree goes, when its owner is gone, even if a cleanup of it throws", () => {
	const top = SolidNode.container(r.R_INVALID_ID);
	const node = SolidNode.element("Window");
	top.insert(node, null);
	let instance: WindowInstance | undefined;
	node.withInstance((host) => {
		instance = host as WindowInstance;
	});
	instance?.whenOpen(() => () => {
		throw new Error("from a cleanup");
	});
	expect(instance?.isOpen).toBe(true);
	expect(() => top.release(node)).toThrow("from a cleanup");
	expect(top.children).toEqual([]);
	expect(instance?.isOpen).toBe(false);
	expect(r.Rwindow_is_valid(instance?.window ?? r.R_INVALID_ID)).toBe(0);
	// (gone, not only closed: it does not open again)
	instance?.materialize();
	expect(instance?.isOpen).toBe(false);
});

test("text at the top of a tree, in a root or a portal, has no widget and is refused", async () => {
	const box = r.Rwidget_create_from_xml('<Label Name="by-hand" Text="mine"/>');
	const [said, setSaid] = createSignal("");
	await mount(() => (
		<VBox Name="outer">
			<ErrorBoundary fallback={(error: Error) => <Label Name="error">{error.message}</Label>}>
				<Portal widget={box}>{said()}</Portal>
			</ErrorBoundary>
		</VBox>
	));
	r.Rwidget_add_child(find("outer"), box);
	setSaid("hello");
	expect(text("error")).toContain('text must be in a widget: "hello"');
	expect(r.Rwidget_is_valid(box)).toBe(1);
	expect(r.Rlabel_get_text(box)).toBe("mine");
	const windows = new RavenRoot();
	expect(() => windows.render(() => "loose")).toThrow('text must be in a widget: "loose"');
	windows.unmount();
});
