/** React on real Raven widgets, without a window system or a GPU, clicked and typed into for real. */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { Component, useEffect, useState, type ReactNode } from "react";
import * as r from "../raven";
import { eventStats } from "../events";
import { Border, Button, Checkbox, ComboBox, createWindow, HBox, Label, Slider, TextInput, VBox, type RavenRoot } from "../index";

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
	expect(errors.filter((detail) => !detail.includes("invalid widget handle 0xFFFFFFFF"))).toEqual([]);
	errors.length = 0;
});

afterAll(() => {
	r.Rquit(0);
	r.Rshutdown();
});

/** Lets React and the event loop finish, with frames between. */
async function settle(ms = 20): Promise<void> {
	const end = performance.now() + ms;
	do {
		r.Rdraw_frame();
		await new Promise<void>((resolve) => setImmediate(resolve));
	} while (performance.now() < end);
}

/** Renders an element in a new window. */
async function mount(element: ReactNode): Promise<void> {
	const made = createWindow(WINDOW);
	window = made.window;
	root = made.root;
	root.render(element);
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
	return Array.from({ length: r.Rwidget_get_child_count(parent) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(parent, index)) ?? "");
}

test("props and text children reach the widgets", async () => {
	await mount(
		<VBox Name="box" Spacing={8} Slot={{ Padding: 12 }}>
			<Label Name="a" Text="from a prop" />
			<Label Name="b">from a child</Label>
			<Label Name="c">{"count: "}{3}</Label>
			<Button Name="d">press</Button>
		</VBox>,
	);
	expect(text("a")).toBe("from a prop");
	expect(text("b")).toBe("from a child");
	expect(text("c")).toBe("count: 3");
	expect(namesUnder("box")).toEqual(["a", "b", "c", "d"]);
});

function Counter(): ReactNode {
	const [count, setCount] = useState(0);
	return (
		<VBox Name="box">
			<Label Name="count">{count}</Label>
			<Button Name="add" OnClicked={() => setCount(count + 1)}>{count % 2 ? "odd" : "even"}</Button>
			{count >= 2 && <Label Name="extra">two or more</Label>}
		</VBox>
	);
}

test("state changes the same widget", async () => {
	await mount(<Counter />);
	const button = find("add");
	const label = find("count");
	click("add");
	await settle();
	expect(text("count")).toBe("1");
	expect(find("add")).toBe(button);
	expect(find("count")).toBe(label);
});

test("clicks commit at once: no click is lost, even with nothing in between", async () => {
	await mount(<Counter />);
	for (let index = 0; index < 300; index++) {
		click("add");
	}
	expect(text("count")).toBe("300");
});

test("conditional widgets come and go", async () => {
	await mount(<Counter />);
	expect(find("extra")).toBe(r.R_INVALID_ID);
	click("add");
	click("add");
	expect(text("extra")).toBe("two or more");
});

function List(): ReactNode {
	const [items, setItems] = useState(["a", "b", "c"]);
	return (
		<VBox Name="list">
			<Button Name="reverse" OnClicked={() => setItems([...items].reverse())}>reverse</Button>
			<Button Name="add" OnClicked={() => setItems(["new", ...items])}>add</Button>
			{items.map((item) => (
				<HBox key={item} Name={`row-${item}`}>
					<Button Name={`remove-${item}`} OnClicked={() => setItems(items.filter((other) => other !== item))}>x</Button>
				</HBox>
			))}
		</VBox>
	);
}

test("keys: rows move and keep their widgets", async () => {
	await mount(<List />);
	const row = find("row-c");
	click("reverse");
	expect(namesUnder("list").slice(2)).toEqual(["row-c", "row-b", "row-a"]);
	expect(find("row-c")).toBe(row);
	click("add");
	expect(namesUnder("list").slice(2)).toEqual(["row-new", "row-c", "row-b", "row-a"]);
	await settle();
	click("remove-c");
	expect(namesUnder("list").slice(2)).toEqual(["row-new", "row-b", "row-a"]);
});

test("a row is removed by its own button, during its own click", async () => {
	await mount(<List />);
	click("remove-b");
	await settle();
	expect(namesUnder("list").slice(2)).toEqual(["row-a", "row-c"]);
	expect(find("row-b")).toBe(r.R_INVALID_ID);
});

function Form({ filter = (value) => value }: { filter?: (value: string) => string }): ReactNode {
	const [value, setValue] = useState("");
	const [committed, setCommitted] = useState("");
	return (
		<VBox>
			<TextInput Name="input" Text={value} OnChanged={(next) => setValue(filter(next))} OnCommitted={setCommitted} />
			<Label Name="value">{value || "empty"}</Label>
			<Label Name="committed">{committed || "none"}</Label>
		</VBox>
	);
}

test("a TextInput gives its text at each change, and on Enter", async () => {
	await mount(<Form />);
	click("input");
	r.Rwindow_inject_text(window, "h");
	expect(text("value")).toBe("h");
	r.Rwindow_inject_text(window, "é");
	expect(text("value")).toBe("hé");
	expect(text("committed")).toBe("none");
	r.Rwindow_inject_key(window, r.R_KEY_ENTER, 1, 0);
	r.Rwindow_inject_key(window, r.R_KEY_ENTER, 0, 0);
	expect(text("committed")).toBe("hé");
	expect(r.Rtext_input_get_text(find("input"))).toBe("hé");
});

test("a controlled TextInput shows what the state says: a change can be refused or changed", async () => {
	await mount(<Form filter={(value) => value.replace(/[0-9]/g, "").toUpperCase()} />);
	click("input");
	r.Rwindow_inject_text(window, "a");
	expect(r.Rtext_input_get_text(find("input"))).toBe("A");
	r.Rwindow_inject_text(window, "7");
	expect(r.Rtext_input_get_text(find("input"))).toBe("A");
	expect(text("value")).toBe("A");
	r.Rwindow_inject_text(window, "b");
	expect(r.Rtext_input_get_text(find("input"))).toBe("AB");
});

test("the state of a TextInput does not move the caret", async () => {
	await mount(<Form />);
	click("input");
	r.Rwindow_inject_text(window, "ac");
	r.Rwindow_inject_key(window, r.R_KEY_LEFT, 1, 0);
	r.Rwindow_inject_key(window, r.R_KEY_LEFT, 0, 0);
	r.Rwindow_inject_text(window, "b");
	expect(r.Rtext_input_get_text(find("input"))).toBe("abc");
});

test("a Checkbox gives its state, and a controlled one can refuse it", async () => {
	const seen: boolean[] = [];
	function Box({ locked }: { locked: boolean }): ReactNode {
		const [checked, setChecked] = useState(false);
		return (
			<VBox>
				<Checkbox
					Name="box"
					Checked={checked}
					OnChanged={(value) => {
						seen.push(value);
						if (!locked) {
							setChecked(value);
						}
					}}
				>
					check
				</Checkbox>
			</VBox>
		);
	}
	await mount(<Box locked={false} />);
	click("box");
	click("box");
	expect(seen).toEqual([true, false]);
	root?.render(<Box locked />);
	await settle();
	click("box");
	expect(seen).toEqual([true, false, true]);
	expect(r.Rcheckbox_is_checked(find("box"))).toBe(0);
});

test("a Slider gives its value as a number", async () => {
	const seen: number[] = [];
	await mount(
		<VBox>
			<Slider Name="slider" Width={200} OnChanged={(value) => seen.push(value)} />
		</VBox>,
	);
	click("slider");
	expect(seen.length).toBeGreaterThan(0);
	expect(typeof seen[0]).toBe("number");
	expect(seen.at(-1)).toBeCloseTo(r.Rslider_get_value(find("slider")), 4);
});

test("lists of items are written the way XML takes them", async () => {
	await mount(
		<VBox>
			<ComboBox Name="combo" Items={["one", "two", "three"]} />
		</VBox>,
	);
	expect(r.Rcombo_box_get_item_count(find("combo"))).toBe(3);
});

function Removable(): ReactNode {
	const [on, setOn] = useState(true);
	const [clicks, setClicks] = useState(0);
	return (
		<VBox Name="outer">
			<Label Name="before">before</Label>
			{on ? (
				<Border Name="panel" Opacity={0.5} Width={120}>
					<Button Name="inner" OnClicked={() => setClicks(clicks + 1)}>{`inner ${clicks}`}</Button>
				</Border>
			) : (
				<Border Name="panel" Width={120}>
					<Button Name="inner" OnClicked={() => setClicks(clicks + 1)}>{`inner ${clicks}`}</Button>
				</Border>
			)}
			<Label Name="after">after</Label>
			<Button Name="toggle" OnClicked={() => setOn(!on)}>toggle</Button>
		</VBox>
	);
}

test("a removed prop remakes the widget, in its place, with its children working", async () => {
	await mount(<Removable />);
	const panel = find("panel");
	const inner = find("inner");
	click("toggle");
	await settle();
	expect(find("panel")).not.toBe(panel);
	expect(r.Rwidget_is_valid(panel)).toBe(0);
	expect(find("inner")).toBe(inner);
	expect(namesUnder("outer")).toEqual(["before", "panel", "after", "toggle"]);
	click("inner");
	await settle();
	expect(r.Rwidget_get_parent(find("inner"))).toBe(find("panel"));
	click("toggle");
	await settle();
	expect(namesUnder("outer")).toEqual(["before", "panel", "after", "toggle"]);
});

test("effects run, and their cleanups run on unmount", async () => {
	const log: string[] = [];
	function Timer(): ReactNode {
		const [ticks, setTicks] = useState(0);
		useEffect(() => {
			log.push("mount");
			const timer = setInterval(() => setTicks((value) => value + 1), 2);
			return () => {
				clearInterval(timer);
				log.push("cleanup");
			};
		}, []);
		return <Label Name="ticks">{ticks}</Label>;
	}
	await mount(<VBox><Timer /></VBox>);
	await settle(40);
	expect(Number(text("ticks"))).toBeGreaterThan(0);
	expect(log).toEqual(["mount"]);
	root?.unmount();
	root = null;
	expect(log).toEqual(["mount", "cleanup"]);
});

test("nothing grows: handlers go with their widgets, and native callbacks are shared", async () => {
	await mount(<List />);
	click("reverse");
	await settle();
	root?.unmount();
	root = null;
	expect(eventStats().handlers).toBe(0);
	const callbacks = eventStats().nativeCallbacks;
	for (let index = 0; index < 40; index++) {
		const made = createWindow(WINDOW);
		made.root.render(<List />);
		await settle(0);
		made.root.unmount();
		r.Rwindow_destroy(made.window);
	}
	expect(eventStats()).toEqual({ handlers: 0, nativeCallbacks: callbacks });
});

test("an exception in a handler does not cross C", async () => {
	const report = console.error;
	const reported: string[] = [];
	console.error = (...values: string[]): void => void reported.push(values.join(" "));
	await mount(
		<VBox>
			<Button
				Name="boom"
				OnClicked={() => {
					throw new Error("from a handler");
				}}
			>
				boom
			</Button>
			<Label Name="alive">still here</Label>
		</VBox>,
	);
	click("boom");
	console.error = report;
	expect(reported.join()).toContain("from a handler");
	expect(text("alive")).toBe("still here");
});

test("an error boundary works", async () => {
	const report = console.error;
	console.error = (): void => {};
	class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
		override state = { failed: false };
		static getDerivedStateFromError(): { failed: boolean } {
			return { failed: true };
		}
		override render(): ReactNode {
			return this.state.failed ? <Label Name="fallback">failed</Label> : this.props.children;
		}
	}
	function Bad(): ReactNode {
		throw new Error("in a render");
	}
	await mount(<VBox><Boundary><Bad /></Boundary></VBox>);
	console.error = report;
	expect(text("fallback")).toBe("failed");
});
