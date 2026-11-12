/** @jsxImportSource solid-js */
/** Solid on real Raven widgets, without a window system or a GPU, clicked and typed into for real. */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createSignal, ErrorBoundary, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import * as r from "../../core/raven";
import { eventStats } from "../../core/events";
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
	expect(errors).toEqual([]);
	errors.length = 0;
});

afterAll(() => {
	r.Rquit(0);
	r.Rshutdown();
});

/** Lets the event loop run, with frames between. */
async function settle(ms = 20): Promise<void> {
	const end = performance.now() + ms;
	do {
		r.Rdraw_frame();
		await new Promise<void>((resolve) => setImmediate(resolve));
	} while (performance.now() < end);
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
