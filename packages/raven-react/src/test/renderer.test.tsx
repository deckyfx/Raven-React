/** React on real Raven widgets, without a window system or a GPU, clicked and typed into for real. */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { Component, createRef, useEffect, useState, type ReactNode } from "react";
import * as r from "../raven";
import { eventStats } from "../events";
import {
	Border, Breadcrumb, Button, Checkbox, ComboBox, createWindow, Custom, DatePicker, Expander, HBox, Label, ListView, Overlay, Pagination, raven, RavenRoot, Rating, Slider, SpinBox, Table, TabView, TextInput, TileView, TimePicker, Toast, TreeView, VBox, Window,
	type WidgetInstance, type WindowInstance,
} from "../index";

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

/** Presses and releases a key. */
function press(key: r.RKey): void {
	r.Rwindow_inject_key(window, key, 1, 0);
	r.Rwindow_inject_key(window, key, 0, 0);
}

/** Clicks a place of the window. */
function clickAt(x: number, y: number): void {
	r.Rwindow_inject_mouse_move(window, x, y);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 1);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 0);
}

test("a ref gives the widget, and stays right when the widget is made again", async () => {
	const input = createRef<WidgetInstance>();
	const panel = createRef<WidgetInstance>();
	function Panel({ faded }: { faded: boolean }): ReactNode {
		return (
			<VBox>
				<TextInput ref={input} Name="input" />
				<Border ref={panel} Name="panel" {...(faded ? { Opacity: 0.5 } : {})} />
			</VBox>
		);
	}
	await mount(<Panel faded />);
	expect(input.current?.widget).toBe(find("input"));
	input.current?.focus();
	expect(r.Rwidget_is_focused(find("input"))).toBe(1);
	const before = panel.current?.widget;
	root?.render(<Panel faded={false} />);
	await settle();
	expect(panel.current?.widget).not.toBe(before);
	expect(panel.current?.widget).toBe(find("panel"));
	root?.unmount();
	root = null;
	expect(input.current).toBe(null);
});

test("a SpinBox gives its value at each change", async () => {
	const seen: number[] = [];
	const spin = createRef<WidgetInstance>();
	await mount(<VBox><SpinBox ref={spin} Name="spin" Value={3} Step={0.5} OnChanged={(value) => seen.push(value)} /></VBox>);
	spin.current?.focus();
	press(r.R_KEY_UP);
	expect(seen).toEqual([3.5]);
	r.Rwindow_inject_text(window, "7.25");
	press(r.R_KEY_ENTER);
	expect(seen.at(-1)).toBeCloseTo(7.25, 5);
});

test("a ComboBox gives the index that was picked", async () => {
	const seen: number[] = [];
	await mount(<VBox><ComboBox Name="combo" Items={["one", "two", "three"]} OnChanged={(value) => seen.push(value)} /></VBox>);
	click("combo");
	press(r.R_KEY_DOWN);
	press(r.R_KEY_ENTER);
	expect(seen.length).toBe(1);
	expect(seen[0]).toBe(r.Rcombo_box_get_selected(find("combo")));
});

test("a TabView makes a tab per child, and gives the index of the tab", async () => {
	const seen: number[] = [];
	await mount(
		<VBox>
			<TabView Name="tabs" Height={120} OnChanged={(value) => seen.push(value)}>
				<Button Name="first" Slot={{ Title: "First" }}>a</Button>
				<Button Name="second" Slot={{ Title: "Second" }}>b</Button>
			</TabView>
		</VBox>,
	);
	const tabs = find("tabs");
	expect(r.Rtab_view_get_tab_count(tabs)).toBe(2);
	r.Rtab_view_set_active(tabs, 1);
	await settle();
	const [x, y] = r.Rwidget_get_rect(tabs);
	clickAt(x + 10, y + 8);
	expect(seen.at(-1)).toBe(0);
	expect(r.Rtab_view_get_active(tabs)).toBe(0);
});

test("an Expander gives its state", async () => {
	const seen: boolean[] = [];
	await mount(
		<VBox>
			<Expander Name="more" Title="More" OnChanged={(value) => seen.push(value)}>
				<Button Name="inside">inside</Button>
			</Expander>
		</VBox>,
	);
	const [x, y, width] = r.Rwidget_get_rect(find("more"));
	const before = r.Rexpander_is_expanded(find("more"));
	clickAt(x + width / 2, y + 8);
	expect(seen).toEqual([before === 0]);
});

test("a ListView gives the selected row, and the row that is activated", async () => {
	const selected: number[] = [];
	const activated: number[] = [];
	const list = createRef<WidgetInstance>();
	await mount(
		<VBox>
			<ListView ref={list} Name="list" Height={100} Items={["a", "b", "c"]} OnChanged={(value) => selected.push(value)} OnActivated={(value) => activated.push(value)} />
		</VBox>,
	);
	expect(r.Rlist_view_get_item_count(find("list"))).toBe(3);
	list.current?.focus();
	press(r.R_KEY_DOWN);
	press(r.R_KEY_DOWN);
	expect(selected.length).toBe(2);
	expect(selected.at(-1)).toBe(r.Rlist_view_get_selected(find("list")));
	press(r.R_KEY_ENTER);
	expect(activated).toEqual([r.Rlist_view_get_selected(find("list"))]);
});

test("a controlled ListView stays on what the state says", async () => {
	await mount(<VBox><ListView Name="list" Height={100} Items={["a", "b", "c"]} Selected={1} OnChanged={() => {}} /></VBox>);
	click("list");
	expect(r.Rlist_view_get_selected(find("list"))).toBe(1);
});

test("a virtual ListView asks for its rows, and follows the state", async () => {
	const asked: number[] = [];
	function Rows(): ReactNode {
		const [count, setCount] = useState(1_000_000);
		const [word, setWord] = useState("Row");
		return (
			<VBox>
				<ListView
					Name="list"
					Height={100}
					ItemCount={count}
					ItemText={(index) => {
						asked.push(index);
						return `${word} ${index}`;
					}}
				/>
				<Button Name="less" OnClicked={() => setCount(5)}>less</Button>
				<Button Name="word" OnClicked={() => setWord("Line")}>word</Button>
			</VBox>
		);
	}
	await mount(<Rows />);
	const list = find("list");
	expect(r.Rlist_view_get_item_count(list)).toBe(1_000_000);
	expect(r.Rlist_view_get_item_text(list, 123456)).toBe("Row 123456");
	expect(asked.length).toBeLessThan(100);
	Bun.gc(true);
	expect(r.Rlist_view_get_item_text(list, 7)).toBe("Row 7");
	click("less");
	expect(r.Rlist_view_get_item_count(find("list"))).toBe(5);
	click("word");
	expect(r.Rlist_view_get_item_text(find("list"), 2)).toBe("Line 2");
	expect(find("list")).toBe(list);
});

test("a TreeView is filled through its ref, and gives the handle of the item", async () => {
	const seen: r.Rid[] = [];
	const tree = createRef<WidgetInstance>();
	await mount(<VBox><TreeView ref={tree} Name="tree" Height={100} OnChanged={(item) => seen.push(item)} /></VBox>);
	const widget = tree.current?.widget ?? r.R_INVALID_ID;
	const world = raven.Rtree_view_add_item(widget, r.R_INVALID_ID, "World");
	raven.Rtree_view_add_item(widget, r.R_INVALID_ID, "Sky");
	await settle();
	tree.current?.focus();
	press(r.R_KEY_DOWN);
	expect(seen.length).toBeGreaterThan(0);
	expect(seen.at(-1)).toBe(r.Rtree_view_get_selected_item(widget));
	expect([world, r.Rtree_view_get_selected_item(widget)]).toContain(seen[0] ?? r.R_INVALID_ID);
});

test("a TileView asks for its items and gives the one picked", async () => {
	const filled = new Set<number>();
	const selected: number[] = [];
	await mount(
		<VBox>
			<TileView
				Name="tiles"
				Height={200}
				TileWidth={100}
				TileHeight={80}
				ItemCount={3}
				ItemFill={(index, item) => {
					filled.add(index);
					item.text = `Tile ${index} é`;
				}}
				OnChanged={(value) => selected.push(value)}
			/>
		</VBox>,
	);
	const tiles = find("tiles");
	expect(r.Rtile_view_get_count(tiles)).toBe(3);
	await settle();
	expect(filled.size).toBeGreaterThan(0);
	const [x, y] = r.Rwidget_get_rect(tiles);
	clickAt(x + 130, y + 20);
	expect(r.Rtile_view_get_current(tiles)).toBe(1);
	expect(selected.length).toBeGreaterThan(0);
});

test("a Custom paints with the C API, and says its size", async () => {
	const sizes: number[][] = [];
	await mount(
		<VBox>
			<Custom
				Name="canvas"
				OnMeasure={() => ({ Width: 200, Height: 77 })}
				OnPaint={(painter, width, height) => {
					sizes.push([width, height]);
					raven.Rdraw_rect(painter, 0, 0, width, height, 4, 1, 0, 0, 1);
					raven.Rdraw_curve(painter, 0, 0, 10, 10, 20, 10, 30, 0, 2, 1, 1, 0, 1);
				}}
			/>
		</VBox>,
	);
	expect(r.Rwidget_get_rect(find("canvas"))[3]).toBe(77);
	await settle();
	expect(sizes.length).toBeGreaterThan(0);
	expect(sizes.at(-1)?.[1]).toBe(77);
});

test("windows come and go with their elements, and follow their props", async () => {
	const first = createRef<WindowInstance>();
	const second = createRef<WindowInstance>();
	let closing = 0;
	function Windows({ title, both }: { title: string; both: boolean }): ReactNode {
		return (
			<>
				<Window ref={first} Title={title} Width={300} Height={200}>
					<Label Name="in-first">one</Label>
				</Window>
				{both && (
					<Window ref={second} Title="Second" Width={200} Height={100} OnClose={() => closing++}>
						<Label Name="in-second">two</Label>
					</Window>
				)}
			</>
		);
	}
	const windows = new RavenRoot();
	windows.render(<Windows title="First" both />);
	await settle();
	const a = first.current?.window ?? r.R_INVALID_ID;
	const b = second.current?.window ?? r.R_INVALID_ID;
	expect(r.Rwindow_get_title(a)).toBe("First");
	expect(r.Rwindow_get_title(b)).toBe("Second");
	expect(r.Rlabel_get_text(r.Rwidget_find(b, "in-second"))).toBe("two");

	windows.render(<Windows title="Renamed" both />);
	await settle();
	expect(first.current?.window).toBe(a);
	expect(r.Rwindow_get_title(a)).toBe("Renamed");

	// with OnClose, closing is a request: the window stays until the element goes
	r.Rwindow_close(b);
	expect(closing).toBe(1);
	expect(r.Rwindow_is_valid(b)).toBe(1);
	windows.render(<Windows title="Renamed" both={false} />);
	await settle();
	expect(r.Rwindow_is_valid(b)).toBe(0);
	expect(r.Rwindow_is_valid(a)).toBe(1);

	// without it, the user can close it at any time, and updates do no harm
	r.Rwindow_close(a);
	expect(first.current?.isOpen).toBe(false);
	windows.render(<Windows title="Again" both={false} />);
	await settle();
	windows.unmount();
	expect(eventStats().handlers).toBe(0);
});

test("a widget outside a window is said clearly", async () => {
	const report = console.error;
	const reported: string[] = [];
	console.error = (...values: unknown[]): void => void reported.push(values.join(" "));
	const windows = new RavenRoot();
	windows.render(<Label>lost</Label>);
	await settle();
	console.error = report;
	expect(reported.join()).toContain("must be inside a <Window>");
	windows.unmount();
});

test("a Table takes its columns and rows, and gives the row and the sort", async () => {
	const selected: number[] = [];
	const activated: number[] = [];
	const sorts: [number, boolean][] = [];
	const rows = [["Ada", "36"], ["Grace", "85"], ["Bob", "9"]];
	const table = createRef<WidgetInstance>();
	await mount(
		<VBox>
			<Table
				ref={table}
				Name="t"
				Height={200}
				Columns={["Name", "Age"]}
				RowCount={rows.length}
				CellText={(row, column) => rows[row]?.[column] ?? ""}
				OnChanged={(row) => selected.push(row)}
				OnActivated={(row) => activated.push(row)}
				OnSort={(column, descending) => sorts.push([column, descending])}
			/>
		</VBox>,
	);
	const widget = find("t");
	expect(r.Rtable_get_column_count(widget)).toBe(2);
	expect(r.Rtable_get_column_header(widget, 1)).toBe("Age");
	expect(r.Rtable_get_row_count(widget)).toBe(3);
	expect(r.Rtable_get_cell(widget, 1, 0)).toBe("Grace");
	table.current?.focus();
	press(r.R_KEY_DOWN);
	expect(selected.at(-1)).toBe(r.Rtable_get_selected(widget));
	press(r.R_KEY_ENTER);
	expect(activated.at(-1)).toBe(r.Rtable_get_selected(widget));
	const [x, y] = r.Rwidget_get_rect(widget);
	clickAt(x + 20, y + 6);
	expect(sorts).toEqual([[0, false]]);
});

test("a DatePicker gives the date as its attribute writes it, and can be controlled", async () => {
	const seen: string[] = [];
	function Picker({ locked }: { locked: boolean }): ReactNode {
		const [date, setDate] = useState("2026-11-03");
		return (
			<VBox>
				<Label Name="value">{date}</Label>
				<DatePicker
					Name="d"
					Date={date}
					OnChanged={(value) => {
						seen.push(value);
						if (!locked) {
							setDate(value);
						}
					}}
				/>
			</VBox>
		);
	}
	await mount(<Picker locked={false} />);
	click("d");
	press(r.R_KEY_DOWN);
	press(r.R_KEY_ENTER);
	expect(seen).toEqual(["2026-11-10"]);
	expect(text("value")).toBe("2026-11-10");
	root?.render(<Picker locked />);
	await settle();
	click("d");
	press(r.R_KEY_DOWN);
	press(r.R_KEY_ENTER);
	expect(seen.at(-1)).toBe("2026-11-17");
	expect(r.Rdate_picker_get_date(find("d"))).toEqual([2026, 11, 10]);
});

test("a TimePicker gives the time, and does not fight its own value", async () => {
	const seen: string[] = [];
	const picker = createRef<WidgetInstance>();
	function Clock(): ReactNode {
		const [time, setTime] = useState("09:30");
		return (
			<VBox>
				<TimePicker
					ref={picker}
					Name="t"
					Time={time}
					MinuteStep={15}
					OnChanged={(value) => {
						seen.push(value);
						setTime(value);
					}}
				/>
			</VBox>
		);
	}
	await mount(<Clock />);
	picker.current?.focus();
	press(r.R_KEY_DOWN);
	expect(seen).toEqual(["08:30:00"]);
	press(r.R_KEY_RIGHT);
	press(r.R_KEY_UP);
	expect(seen.at(-1)).toBe("08:45:00");
	expect(r.Rtime_picker_get_time(find("t"))).toEqual([8, 45, 0]);
});

test("a Rating gives its score as a number", async () => {
	const seen: number[] = [];
	await mount(<HBox><Rating Name="r" Value={2} AllowHalf OnChanged={(value) => seen.push(value)} /></HBox>);
	const [x, y, , height] = r.Rwidget_get_rect(find("r"));
	clickAt(x + 2 + 22 * 3 + 14, y + height / 2);
	expect(seen).toEqual([4]);
	clickAt(x + 2 + 22 * 3 + 3, y + height / 2);
	expect(seen.at(-1)).toBe(3.5);
});

test("a Pagination gives the page, and a controlled one stays where the state says", async () => {
	const seen: number[] = [];
	function Pages({ locked }: { locked: boolean }): ReactNode {
		const [page, setPage] = useState(9);
		return (
			<HBox>
				<Pagination
					Name="p"
					PageCount={20}
					Page={page}
					OnChanged={(value) => {
						seen.push(value);
						if (!locked) {
							setPage(value);
						}
					}}
				/>
			</HBox>
		);
	}
	await mount(<Pages locked={false} />);
	const [x, y, , height] = r.Rwidget_get_rect(find("p"));
	const button = r.Rtheme_get_metric(r.R_METRIC_CONTROL_HEIGHT);
	clickAt(x + button / 2, y + height / 2);
	expect(seen).toEqual([8]);
	expect(r.Rpagination_get_page(find("p"))).toBe(8);
	root?.render(<Pages locked />);
	await settle();
	const [x2, y2, , height2] = r.Rwidget_get_rect(find("p"));
	clickAt(x2 + button / 2, y2 + height2 / 2);
	expect(seen.at(-1)).toBe(7);
	expect(r.Rpagination_get_page(find("p"))).toBe(8);
});

test("a Breadcrumb gives the index of the item", async () => {
	const seen: number[] = [];
	await mount(<HBox><Breadcrumb Name="b" Items={["Home", "Documents", "Report"]} OnClicked={(index) => seen.push(index)} /></HBox>);
	expect(r.Rbreadcrumb_get_item_count(find("b"))).toBe(3);
	const [x, y, , height] = r.Rwidget_get_rect(find("b"));
	clickAt(x + 8, y + height / 2);
	expect(seen).toEqual([0]);
});

test("a Toast is shown through its ref, and its button calls back", async () => {
	let undone = 0;
	const toast = createRef<WidgetInstance>();
	await mount(
		<Overlay>
			<Button Name="under">under</Button>
			<Toast ref={toast} Name="toast" ActionText="Undo" Kind="Success" Slot={{ HAlign: "Center", VAlign: "Bottom" }} OnClicked={() => undone++} />
		</Overlay>,
	);
	const widget = toast.current?.widget ?? r.R_INVALID_ID;
	expect(r.Rtoast_is_shown(widget)).toBe(0);
	raven.Rtoast_show(widget, "Saved", 0);
	await settle();
	expect(r.Rtoast_is_shown(widget)).toBe(1);
	expect(r.Rtoast_get_text(widget)).toBe("Saved");
	const [x, y, width, height] = r.Rwidget_get_rect(widget);
	clickAt(x + width - 20, y + height / 2);
	expect(undone).toBe(1);
	expect(r.Rtoast_is_shown(widget)).toBe(0);
});

test("a system notification goes through the C API, with the fallback on the JavaScript thread", async () => {
	const seen: string[] = [];
	raven.Rnotification_set_fallback((title, body) => {
		seen.push(`${title}: ${body}`);
		expect(r.Ris_ui_thread()).toBe(1);
	});
	await mount(<VBox><Label>x</Label></VBox>);
	const shown = raven.Rnotification_show("Backup", "Finished", raven.R_NOTIFICATION_NORMAL);
	expect(shown === 1 || seen.includes("Backup: Finished")).toBe(true);
	raven.Rnotification_set_fallback(null);
});
