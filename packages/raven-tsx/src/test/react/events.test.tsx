/** The events, props and tree rules added after the first ones, on real widgets, with real input where it can be injected. */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { ptr, type Pointer } from "bun:ffi";
import { tmpdir } from "node:os";
import { createContext, createRef, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as r from "../../core/raven";
import { eventStats } from "../../core/events";
import {
	BlockEditor, Button, ColorPicker, createPortal, createWindow, Custom, DockArea, FileBrowser, HBox, Image, inEventScope, Island, Label, ListView, Menu, MenuBar, MenuItem, NodeGraph, raven, RavenRoot, registerWebView, Separator, tag, TabView, TextEditor, TextInput, TileView, Timeline, TreeView, useAction, useFrame, VBox, Viewport, webFunctions, WebView, Window, WrapBox,
	type WidgetInstance, type WindowInstance,
} from "../../react/index";

const WINDOW = { Title: "Test", Width: 640, Height: 480 } as const;
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
	expect(reported.filter((detail) => !detail.includes("invalid widget handle 0xFFFFFFFF"))).toEqual([]);
	expect(eventStats().handlers).toBe(0);
});

afterAll(() => {
	r.Rquit(0);
	r.Rshutdown();
});

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

async function mount(element: ReactNode): Promise<void> {
	const made = createWindow(WINDOW);
	window = made.window;
	root = made.root;
	root.render(element);
	await settle();
}

const find = (name: string): r.Rid => r.Rwidget_find(window, name);

function clickAt(x: number, y: number, button: r.RMouseButton = r.R_MOUSE_LEFT, count = 1): void {
	r.Rwindow_inject_mouse_move(window, x, y);
	for (let index = 0; index < count; index++) {
		r.Rwindow_inject_mouse_button(window, button, 1);
		r.Rwindow_inject_mouse_button(window, button, 0);
	}
}

function press(key: r.RKey, modifiers = 0): void {
	r.Rwindow_inject_key(window, key, 1, modifiers);
	r.Rwindow_inject_key(window, key, 0, modifiers);
}

test("a TextEditor gives its text, and its state does not move the caret", async () => {
	const seen: string[] = [];
	const editor = createRef<WidgetInstance>();
	function Notes(): ReactNode {
		const [text, setText] = useState("");
		return <VBox><TextEditor ref={editor} Name="e" Height={200} Text={text} OnChanged={(value) => { seen.push(value); setText(value); }} /></VBox>;
	}
	await mount(<Notes />);
	editor.current?.focus();
	r.Rwindow_inject_text(window, "ac");
	expect(seen.at(-1)).toBe("ac");
	press(r.R_KEY_LEFT);
	r.Rwindow_inject_text(window, "b");
	expect(r.Rtext_editor_get_text(find("e"))).toBe("abc");
	expect(seen.at(-1)).toBe("abc");
});

test("a TextEditor can refuse a change, says its zoom, and asks for completions", async () => {
	const zooms: number[] = [];
	const asked: string[] = [];
	const editor = createRef<WidgetInstance>();
	await mount(
		<VBox>
			<TextEditor
				ref={editor}
				Name="e"
				Height={200}
				Text="kept"
				OnChanged={() => {}}
				OnZoom={(zoom) => zooms.push(zoom)}
				OnCompletion={(prefix) => asked.push(prefix)}
			/>
		</VBox>,
	);
	editor.current?.focus();
	r.Rwindow_inject_text(window, "x");
	expect(r.Rtext_editor_get_text(find("e"))).toBe("kept");
	press(r.R_KEY_EQUAL, r.R_MOD_CTRL);
	expect(zooms.length).toBe(1);
	expect(zooms[0]).toBeCloseTo(r.Rtext_editor_get_zoom(find("e")), 5);
	r.Rtext_editor_show_completions(find("e"));
	expect(asked.length).toBeGreaterThan(0);
});

test("a controlled TextInput takes a text that reads as the same number", async () => {
	function Decimal(): ReactNode {
		const [value, setValue] = useState("1");
		return <VBox><TextInput Name="i" Text={value} OnChanged={(next) => setValue(next === "1.0" ? "1" : next)} /></VBox>;
	}
	await mount(<Decimal />);
	const input = find("i");
	const [x, y, width, height] = r.Rwidget_get_rect(input);
	clickAt(x + width / 2, y + height / 2);
	r.Rwindow_inject_text(window, ".");
	r.Rwindow_inject_text(window, "0");
	expect(r.Rtext_input_get_text(input)).toBe("1");
});

test("a ColorPicker takes a color, gives it as a code, and can refuse a change", async () => {
	const seen: string[] = [];
	function Picker({ locked }: { locked: boolean }): ReactNode {
		const [color, setColor] = useState("#7C5CFF");
		return (
			<VBox>
				<ColorPicker
					Name="c"
					Height={320}
					Color={color}
					OnChanged={(value) => {
						seen.push(value);
						if (!locked) {
							setColor(value);
						}
					}}
				/>
			</VBox>
		);
	}
	await mount(<Picker locked={false} />);
	const picker = find("c");
	expect(r.Rcolor_picker_get_hex(picker)).toBe("#7C5CFF");
	const [x, y] = r.Rwidget_get_rect(picker);
	clickAt(x + 60, y + 60);
	expect(seen.length).toBeGreaterThan(0);
	expect(seen.at(-1)).toMatch(/^#[0-9A-F]{6}/);
	expect(r.Rcolor_picker_get_hex(picker)).toBe(seen.at(-1) ?? "");
	root?.render(<Picker locked />);
	await settle();
	const held = r.Rcolor_picker_get_hex(picker);
	clickAt(x + 90, y + 90);
	expect(seen.at(-1)).not.toBe(held ?? "");
	expect(r.Rcolor_picker_get_hex(picker)).toBe(held);
});

test("an Island of a Window floats above the content, follows its props, and goes with its element", async () => {
	const seen: boolean[] = [];
	const owner = createRef<WindowInstance>();
	const island = createRef<WidgetInstance>();
	const warnings: string[] = [];
	const warn = console.warn;
	console.warn = (...values: string[]): void => void warnings.push(values.join(" "));
	function Windowed({ on, faded }: { on: boolean; faded: boolean }): ReactNode {
		return (
			<Window ref={owner} Width={400} Height={300}>
				{on && <Island ref={island} Name="i" ExpandOnClick Slot={{ Padding: 8 }} {...(faded ? { Opacity: 0.5 } : {})} OnChanged={(value) => seen.push(value)}><Label>folded</Label><Label>unfolded</Label></Island>}
				<VBox Name="content"><Button Name="b">b</Button></VBox>
			</Window>
		);
	}
	const windows = new RavenRoot();
	windows.render(<Windowed on faded />);
	await settle();
	const id = owner.current?.window ?? r.R_INVALID_ID;
	const first = island.current?.widget ?? r.R_INVALID_ID;
	expect(r.Rwindow_get_island(id)).toBe(first);
	expect(r.Rwidget_get_parent(first)).toBe(r.R_INVALID_ID);
	expect(r.Rwidget_get_child_count(r.Rwindow_get_content(id))).toBe(1);
	// what the examples did by hand does no harm
	r.Rwindow_set_island(r.Rwidget_get_window(first), first);
	expect(r.Rwidget_is_valid(first)).toBe(1);

	const [x, y, width, height] = r.Rwidget_get_rect(first);
	r.Rwindow_inject_mouse_move(id, x + width / 2, y + height / 2);
	r.Rwindow_inject_mouse_button(id, r.R_MOUSE_LEFT, 1);
	r.Rwindow_inject_mouse_button(id, r.R_MOUSE_LEFT, 0);
	expect(seen).toEqual([true]);

	// a prop taken away makes it again, as anything else, and it is still the island
	windows.render(<Windowed on faded={false} />);
	await settle();
	expect(island.current?.widget).not.toBe(first);
	expect(r.Rwindow_get_island(id)).toBe(island.current?.widget ?? -1);
	expect(r.Rwidget_is_valid(first)).toBe(0);

	windows.render(<Windowed on={false} faded={false} />);
	await settle();
	expect(r.Rwindow_get_island(id)).toBe(r.R_INVALID_ID);
	expect(r.Rwidget_get_child_count(r.Rwindow_get_content(id))).toBe(1);

	// coming back in front of the content
	windows.render(<Windowed on faded={false} />);
	await settle();
	expect(r.Rwindow_get_island(id)).toBe(island.current?.widget ?? -1);
	windows.unmount();
	console.warn = warn;
	expect(warnings).toEqual([]);
});

test("a link of a Markdown label comes to OnLink", async () => {
	const seen: string[] = [];
	await mount(<VBox><Label Name="l" Markdown Text="[go](https://example.com/page)" OnLink={(url) => seen.push(url)} /></VBox>);
	const [x, y, , height] = r.Rwidget_get_rect(find("l"));
	clickAt(x + 6, y + height / 2);
	expect(seen).toEqual(["https://example.com/page"]);
});

test("a Menu outside a MenuBar stands by itself, opens on request, and goes with what holds it", async () => {
	const seen: boolean[] = [];
	let plain = 0;
	const menu = createRef<WidgetInstance>();
	function Holder({ on }: { on: boolean }): ReactNode {
		const [checked, setChecked] = useState(false);
		return (
			<VBox Name="box">
				<Button Name="first">first</Button>
				{on && (
					<VBox Name="middle">
						<Menu ref={menu} Name="m">
							<MenuItem Name="plain" Text="Plain" OnClicked={() => plain++} />
							<MenuItem Name="check" Text="Check" Checkable Checked={checked} OnClicked={(value) => { seen.push(value); setChecked(value); }} />
						</Menu>
					</VBox>
				)}
				<Button Name="last">last</Button>
			</VBox>
		);
	}
	await mount(<Holder on />);
	const widget = menu.current?.widget ?? r.R_INVALID_ID;
	expect(r.Rwidget_get_parent(widget)).toBe(r.R_INVALID_ID);
	expect(r.Rwidget_get_child_count(find("middle"))).toBe(0);
	menu.current?.open(40, 40);
	await settle();
	r.Rwindow_inject_mouse_move(window, 60, 54);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 1);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 0);
	await settle();
	expect(plain + seen.length).toBe(1);
	root?.render(<Holder on={false} />);
	await settle();
	expect(r.Rwidget_is_valid(widget)).toBe(0);
});

test("a Menu in a MenuBar is still one of its widgets", async () => {
	await mount(
		<VBox>
			<MenuBar Name="bar">
				<Menu Name="file" Title="File"><MenuItem Text="Quit" /></Menu>
			</MenuBar>
		</VBox>,
	);
	expect(r.Rwidget_get_parent(find("file"))).toBe(find("bar"));
});

test("only a Menu opens", async () => {
	const button = createRef<WidgetInstance>();
	await mount(<VBox><Button ref={button} Name="b">b</Button></VBox>);
	expect(() => button.current?.open(0, 0)).toThrow("only a <Menu>");
});

test("a Window nested in a widget goes when that widget goes", async () => {
	const inner = createRef<WindowInstance>();
	function Holder({ on }: { on: boolean }): ReactNode {
		return <VBox>{on && <VBox><Window ref={inner} Width={100} Height={100} /></VBox>}</VBox>;
	}
	await mount(<Holder on />);
	const id = inner.current?.window ?? r.R_INVALID_ID;
	expect(r.Rwindow_is_valid(id)).toBe(1);
	root?.render(<Holder on={false} />);
	await settle();
	expect(r.Rwindow_is_valid(id)).toBe(0);
});

test("an Image shows a texture made from pixels, and keeps it when it is made again", async () => {
	const texture = r.Rtexture_create_from_pixels(new Uint8Array(64 * 64 * 4).fill(255), 64, 64);
	const tall = (): number => r.Rwidget_get_rect(find("i"))[3];
	function Picture({ faded }: { faded: boolean }): ReactNode {
		return <HBox><VBox><Image Name="i" Texture={texture} {...(faded ? { Opacity: 0.5 } : {})} /></VBox></HBox>;
	}
	await mount(<Picture faded />);
	const first = find("i");
	// (it has no getter: an image takes the size of its texture)
	expect(tall()).toBe(64);
	root?.render(<Picture faded={false} />);
	await settle();
	expect(find("i")).not.toBe(first);
	expect(tall()).toBe(64);
	root?.unmount();
	root = null;
	r.Rtexture_destroy(texture);
});

test("a Window takes Backdrop, Opacity and ContinuousRedraw, made and open", async () => {
	const warnings: string[] = [];
	const warn = console.warn;
	console.warn = (...values: string[]): void => void warnings.push(values.join(" "));
	const owner = createRef<WindowInstance>();
	const sizes: number[][] = [];
	function Live({ opacity, redraw, backdrop }: { opacity: number; redraw: boolean; backdrop: "Blur" | "None" }): ReactNode {
		return <Window ref={owner} Width={200} Height={100} Opacity={opacity} ContinuousRedraw={redraw} Backdrop={backdrop} Transparent OnResize={(width, height) => sizes.push([width, height])}><VBox /></Window>;
	}
	const windows = new RavenRoot();
	windows.render(<Live opacity={0.5} redraw backdrop="None" />);
	await settle();
	const id = owner.current?.window ?? r.R_INVALID_ID;
	expect(r.Rwindow_is_valid(id)).toBe(1);
	windows.render(<Live opacity={0.9} redraw={false} backdrop="Blur" />);
	await settle();
	expect(warnings.filter((text) => text.includes("only counts when"))).toEqual([]);
	r.Rwindow_set_size(id, 300, 150);
	await settle();
	expect(sizes.at(-1)).toEqual([300, 150]);
	windows.unmount();
	console.warn = warn;
});

test("useFrame: several at once, beside Rset_frame_callback, and gone with their component", async () => {
	let a = 0;
	let b = 0;
	let direct = 0;
	function Ticker({ add }: { add: number }): ReactNode {
		const [ticks, setTicks] = useState(0);
		useFrame((delta) => {
			expect(typeof delta).toBe("number");
			a += add;
			if (ticks < 2) {
				setTicks(ticks + 1);
			}
		});
		useFrame(() => b++);
		return <Label Name="t">{ticks}</Label>;
	}
	raven.Rset_frame_callback(() => direct++);
	await mount(<VBox><Ticker add={1} /></VBox>);
	await settle();
	expect(a).toBeGreaterThan(0);
	expect(b).toBe(a);
	expect(direct).toBeGreaterThan(0);
	expect(r.Rlabel_get_text(find("t"))).toBe("2");
	root?.unmount();
	root = null;
	await settle();
	const [sawA, sawDirect] = [a, direct];
	r.Rdraw_frame();
	r.Rdraw_frame();
	expect(a).toBe(sawA);
	expect(direct).toBeGreaterThan(sawDirect);
	raven.Rset_frame_callback(null);
	const after = direct;
	await settle();
	expect(direct).toBe(after);
});

test("Rset_frame_callback gives a function of JavaScript its user data, as C would", async () => {
	await mount(<VBox><Label Name="t">t</Label></VBox>);
	const seen: (Pointer | null)[] = [];
	const data = new Uint8Array(8);
	raven.Rset_frame_callback((_delta, userData) => void seen.push(userData), data);
	r.Rdraw_frame();
	expect(seen.at(-1)).toBe(ptr(data));
	raven.Rset_frame_callback((_delta, userData) => void seen.push(userData), ptr(data));
	r.Rdraw_frame();
	expect(seen.at(-1)).toBe(ptr(data));
	raven.Rset_frame_callback((_delta, userData) => void seen.push(userData));
	r.Rdraw_frame();
	expect(seen.at(-1)).toBeNull();
	raven.Rset_frame_callback(null);
});

test("an exception in a frame function does not stop the others", async () => {
	const report = console.error;
	const reported: string[] = [];
	console.error = (...values: string[]): void => void reported.push(values.join(" "));
	let ran = 0;
	function Bad(): ReactNode {
		useFrame(() => {
			throw new Error("in a frame");
		});
		useFrame(() => ran++);
		return <Label>x</Label>;
	}
	await mount(<VBox><Bad /></VBox>);
	await settle();
	console.error = report;
	expect(ran).toBeGreaterThan(0);
	expect(reported.join()).toContain("in a frame");
});

test("useAction receives the widget that fired the action, and an On prop receives nothing", async () => {
	const senders: r.Rid[] = [];
	const received: number[] = [];
	function Named(): ReactNode {
		useAction("test.sender", (sender) => senders.push(sender));
		return (
			<VBox>
				<Button Name="a" OnClicked="test.sender">a</Button>
				<Button Name="b" OnClicked={(...values: never[]) => void received.push(values.length)}>b</Button>
			</VBox>
		);
	}
	await mount(<Named />);
	for (const name of ["a", "b"]) {
		const [x, y, width, height] = r.Rwidget_get_rect(find(name));
		clickAt(x + width / 2, y + height / 2);
	}
	expect(senders).toEqual([find("a")]);
	expect(received).toEqual([0]);
});

test("OnEvent gives the input of a widget, says whether it was taken, and survives a remake", async () => {
	const types: r.REventType[] = [];
	function Pad({ faded }: { faded: boolean }): ReactNode {
		return (
			<VBox>
				<Custom
					Name="pad"
					OnMeasure={() => ({ Width: 200, Height: 100 })}
					{...(faded ? { Opacity: 0.5 } : {})}
					OnEvent={(event) => {
						types.push(event.type);
						return true;
					}}
				/>
			</VBox>
		);
	}
	await mount(<Pad faded />);
	const [x, y] = r.Rwidget_get_rect(find("pad"));
	clickAt(x + 20, y + 20);
	expect(types).toContain(r.R_EVENT_MOUSE_DOWN);
	types.length = 0;
	root?.render(<Pad faded={false} />);
	await settle();
	clickAt(x + 30, y + 30);
	expect(types).toContain(r.R_EVENT_MOUSE_DOWN);
});

test("children the application adds stay in their place, through inserts and a remake", async () => {
	const names = (parent: r.Rid): string[] => Array.from({ length: r.Rwidget_get_child_count(parent) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(parent, index)) ?? "");
	function Mixed({ first, faded }: { first: boolean; faded: boolean }): ReactNode {
		const box = useRef<WidgetInstance>(null);
		useLayoutEffect(() => {
			const id = box.current?.widget ?? r.R_INVALID_ID;
			const foreign = r.Rwidget_create_from_xml('<Label Name="foreign"/>');
			r.Rwidget_add_child(id, foreign);
			return () => r.Rwidget_destroy(foreign);
		}, []);
		return (
			<VBox>
				<WrapBox ref={box} Name="box" {...(faded ? { Opacity: 0.5 } : {})}>
					{first && <Label Name="first">first</Label>}
					<Label Name="second">second</Label>
				</WrapBox>
			</VBox>
		);
	}
	await mount(<Mixed first={false} faded />);
	expect(names(find("box"))).toEqual(["second", "foreign"]);
	root?.render(<Mixed first faded />);
	await settle();
	expect(names(find("box"))).toEqual(["first", "second", "foreign"]);
	const before = find("box");
	root?.render(<Mixed first faded={false} />);
	await settle();
	expect(find("box")).not.toBe(before);
	expect(names(find("box"))).toEqual(["first", "second", "foreign"]);
});

test("a child put before another goes just before it, past a child the application added", async () => {
	const names = (parent: r.Rid): string[] => Array.from({ length: r.Rwidget_get_child_count(parent) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(parent, index)) ?? "");
	function Mixed({ order }: { order: readonly string[] }): ReactNode {
		const box = useRef<WidgetInstance>(null);
		useLayoutEffect(() => {
			const id = box.current?.widget ?? r.R_INVALID_ID;
			const foreign = r.Rwidget_create_from_xml('<Label Name="foreign"/>');
			r.Rwidget_insert_child(id, foreign, 1);
			return () => r.Rwidget_destroy(foreign);
		}, []);
		return (
			<VBox>
				<WrapBox ref={box} Name="box">
					{order.map((name) => <Label key={name} Name={name}>{name}</Label>)}
				</WrapBox>
			</VBox>
		);
	}
	await mount(<Mixed order={["a", "b"]} />);
	expect(names(find("box"))).toEqual(["a", "foreign", "b"]);
	// a new child
	root?.render(<Mixed order={["a", "c", "b"]} />);
	await settle();
	expect(names(find("box"))).toEqual(["a", "foreign", "c", "b"]);
	// a child that moves: it is out of Raven when its place is asked
	root?.render(<Mixed order={["a", "b", "c"]} />);
	await settle();
	expect(names(find("box"))).toEqual(["a", "foreign", "b", "c"]);
	root?.render(<Mixed order={["a", "c", "b"]} />);
	await settle();
	expect(names(find("box"))).toEqual(["a", "foreign", "c", "b"]);
});

test("a Viewport says its size from the first layout, which an effect is too late for", async () => {
	const sizes: number[][] = [];
	let late = 0;
	function Scene(): ReactNode {
		const view = useRef<WidgetInstance>(null);
		useLayoutEffect(() => {
			r.Rdraw_frame();
			raven.Rviewport_set_resize_callback(view.current?.widget ?? r.R_INVALID_ID, () => void late++);
		}, []);
		return (
			<VBox>
				<Viewport Name="v" Height={100} OnResize={(width, height) => sizes.push([width, height])} />
				<Viewport ref={view} Name="w" Height={100} />
			</VBox>
		);
	}
	await mount(<Scene />);
	expect(sizes.at(-1)?.[1]).toBe(100);
	expect(sizes.at(-1)?.[0]).toBeGreaterThan(0);
	expect(late).toBe(0);
});

test("a TabView of documents asks before a tab closes, and the element takes it away", async () => {
	const asked: number[] = [];
	function Tabs({ second }: { second: boolean }): ReactNode {
		return (
			<VBox>
				<TabView Name="tabs" Height={200} Documents OnClose={(index) => void asked.push(index)}>
					<Label Name="a" Slot={{ Title: "A" }}>a</Label>
					{second && <Label Name="b" Slot={{ Title: "B" }}>b</Label>}
				</TabView>
			</VBox>
		);
	}
	await mount(<Tabs second />);
	const tabs = find("tabs");
	expect(r.Rtab_view_get_tab_count(tabs)).toBe(2);
	const [x, y] = r.Rwidget_get_rect(tabs);
	clickAt(x + 20, y + 10, r.R_MOUSE_MIDDLE);
	expect(asked).toEqual([0]);
	expect(r.Rtab_view_get_tab_count(tabs)).toBe(2);
	root?.render(<Tabs second={false} />);
	await settle();
	expect(r.Rtab_view_get_tab_count(tabs)).toBe(1);
});

test("a DockArea asks before a panel closes, and gives its layout when it changes", async () => {
	const asked: r.Rid[] = [];
	const layouts: string[] = [];
	let allow = false;
	await mount(
		<VBox>
			<DockArea
				Name="dock"
				Height={300}
				OnClose={(panel) => {
					asked.push(panel);
					return allow;
				}}
				OnChanged={(layout) => layouts.push(layout)}
			>
				<Label Name="left" Slot={{ Title: "Left", Dock: "Left" }}>l</Label>
				<Label Name="right" Slot={{ Title: "Right", Dock: "Right" }}>r</Label>
			</DockArea>
		</VBox>,
	);
	const left = find("left");
	const right = find("right");
	// each on its own side, which only works with the slot set before the panel is added
	expect(r.Rwidget_get_rect(left)[0]).toBeLessThan(r.Rwidget_get_rect(right)[0]);
	expect(r.Rwidget_get_rect(left)[2]).toBeGreaterThan(0);
	expect(r.Rwidget_get_rect(right)[2]).toBeGreaterThan(0);
	// a click on the close button of the tab of a panel
	const clickClose = (): void => {
		const [x, y] = r.Rwidget_get_rect(left);
		for (let offset = 20; offset < 200; offset += 4) {
			clickAt(x + offset, y - 12);
			if (asked.length > 0) {
				break;
			}
		}
	};
	clickClose();
	expect(asked).toEqual([left]);
	expect(r.Rwidget_is_valid(left)).toBe(1);
	asked.length = 0;
	allow = true;
	clickClose();
	await settle();
	expect(asked).toEqual([left]);
	expect(layouts.length).toBeGreaterThan(0);
	expect(typeof layouts.at(-1)).toBe("string");
});

test("a TreeView takes its rows as a prop, and says what was right clicked", async () => {
	const contexts: number[][] = [];
	const items = [{ Text: "World", Expanded: true, Children: [{ Text: "Sky" }, { Text: "Sea" }] }, { Text: "Stars" }];
	function Tree({ list }: { list: typeof items }): ReactNode {
		return <VBox><TreeView Name="t" Height={200} Items={list} OnContext={(item, x, y) => contexts.push([item, x, y])} /></VBox>;
	}
	await mount(<Tree list={items} />);
	const tree = find("t");
	expect(r.Rtree_view_get_item_count(tree)).toBe(2);
	const world = r.Rtree_view_get_item(tree, 0);
	expect(r.Rtree_item_get_text(world)).toBe("World");
	expect(r.Rtree_item_get_child_count(world)).toBe(2);
	expect(r.Rtree_item_is_expanded(world)).toBe(1);
	await settle();
	const [x, y] = r.Rwidget_get_rect(tree);
	clickAt(x + 30, y + 10, r.R_MOUSE_RIGHT);
	expect(contexts.length).toBe(1);
	expect(contexts[0]?.[0]).toBe(world);
	root?.render(<Tree list={[{ Text: "Only" }] as typeof items} />);
	await settle();
	expect(find("t")).toBe(tree);
	expect(r.Rtree_view_get_item_count(tree)).toBe(1);
	root?.render(<Tree list={[]} />);
	await settle();
	expect(r.Rtree_view_get_item_count(tree)).toBe(0);
});

test("a TileView says what was right clicked", async () => {
	const contexts: number[] = [];
	await mount(<VBox><TileView Name="t" Height={200} TileWidth={100} TileHeight={80} ItemCount={3} ItemFill={(index, item) => { item.text = `Tile ${index}`; }} OnContext={(index) => contexts.push(index)} /></VBox>);
	await settle();
	const [x, y] = r.Rwidget_get_rect(find("t"));
	clickAt(x + 30, y + 20, r.R_MOUSE_RIGHT);
	expect(contexts).toEqual([0]);
});

test("a Timeline is filled by Markup, and gives the playhead and the item", async () => {
	const times: number[] = [];
	const selected: number[] = [];
	const activated: number[] = [];
	function Sequence({ label }: { label: string }): ReactNode {
		return (
			<VBox>
				<Timeline
					Name="t"
					Height={200}
					Duration={10}
					HeaderWidth={100}
					Markup={`<Track Name="${label}"><Clip Start="0" Length="10" Label="clip"/></Track>`}
					OnTime={(seconds) => times.push(seconds)}
					OnSelection={(item) => selected.push(item)}
					OnActivated={(item) => activated.push(item)}
				/>
			</VBox>
		);
	}
	await mount(<Sequence label="Camera" />);
	const timeline = find("t");
	expect(r.Rtimeline_get_track_count(timeline)).toBe(1);
	await settle();
	const [x, y, width] = r.Rwidget_get_rect(timeline);
	clickAt(x + (100 + width) / 2, y + 8);
	expect(times.length).toBeGreaterThan(0);
	expect(times.at(-1)).toBeCloseTo(r.Rtimeline_get_time(timeline), 5);
	clickAt(x + (100 + width) / 2, y + 50);
	expect(selected.length).toBeGreaterThan(0);
	clickAt(x + (100 + width) / 2, y + 50, r.R_MOUSE_LEFT, 2);
	expect(activated.length).toBeGreaterThan(0);
	root?.render(<Sequence label="Sound" />);
	await settle();
	expect(find("t")).not.toBe(timeline);
	expect(r.Rtimeline_get_track_count(find("t"))).toBe(1);
});

test("a NodeGraph is filled by Markup, and says what the user does", async () => {
	const selected: number[] = [];
	const contexts: number[][] = [];
	const asked: number[][] = [];
	await mount(
		<VBox>
			<NodeGraph
				Name="g"
				Height={300}
				Markup={`<Node Name="a" Title="A" X="40" Y="40"><Output Name="o" Label="O"/></Node><Node Name="b" Title="B" X="320" Y="40"><Input Name="i" Label="I"/></Node>`}
				OnSelection={(node) => selected.push(node)}
				OnContext={(node, x, y) => contexts.push([node, x, y])}
				OnConnect={(output, input) => {
					asked.push([output, input]);
					return false;
				}}
			/>
		</VBox>,
	);
	const graph = find("g");
	expect(r.Rnode_graph_get_node_count(graph)).toBe(2);
	await settle();
	const a = r.Rnode_graph_find_node(graph, "a");
	const [nodeX, nodeY] = r.Rnode_graph_get_node_position(graph, a);
	// (the canvas starts with its corner at the corner of the widget)
	const [x, y] = r.Rwidget_get_rect(graph);
	const cx = nodeX + 12;
	const cy = nodeY + 8;
	clickAt(x + cx, y + cy);
	expect(selected).toContain(a);
	clickAt(x + cx, y + cy, r.R_MOUSE_RIGHT);
	expect(contexts[0]?.[0]).toBe(a);
});

test("a NodeGraph says a double click on its empty canvas, where, in place of framing its nodes", async () => {
	const activated: number[][] = [];
	await mount(
		<VBox>
			<NodeGraph Name="g" Height={300} Markup={'<Node Name="a" Title="A" X="40" Y="40"/>'} OnCanvasActivated={(x, y) => activated.push([x, y])} />
		</VBox>,
	);
	await settle();
	const graph = find("g");
	const [x, y, width, height] = r.Rwidget_get_rect(graph);
	// (far from the node: the empty canvas)
	clickAt(x + width - 40, y + height - 40, r.R_MOUSE_LEFT, 2);
	expect(activated.length).toBe(1);
	expect(activated[0]?.every((value) => Number.isFinite(value))).toBe(true);
});

test("a NodeGraph says a pin clicked, and a wire dropped on no pin, with where", async () => {
	const clicked: number[][] = [];
	const dropped: number[][] = [];
	await mount(
		<VBox>
			<NodeGraph
				Name="g"
				Height={300}
				Markup={'<Node Name="a" Title="A" X="40" Y="40"><Output Name="o" Label="O"/></Node>'}
				OnPinClicked={(pin, x, y) => clicked.push([pin, x, y])}
				OnWireDropped={(pin, x, y) => dropped.push([pin, x, y])}
			/>
		</VBox>,
	);
	await settle();
	const graph = find("g");
	const pin = r.Rnode_graph_find_pin(graph, r.Rnode_graph_find_node(graph, "a"), "o");
	const [pinX, pinY] = r.Rnode_graph_get_pin_position(graph, pin);
	// (the canvas starts with its corner at the corner of the widget)
	const [x, y] = r.Rwidget_get_rect(graph);
	clickAt(x + pinX, y + pinY);
	expect(clicked[0]?.[0]).toBe(pin);
	// (a wire from the pin, dropped on the empty canvas)
	r.Rwindow_inject_mouse_move(window, x + pinX, y + pinY);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 1);
	r.Rdraw_frame();
	r.Rwindow_inject_mouse_move(window, x + pinX + 120, y + pinY + 140);
	r.Rdraw_frame();
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 0);
	expect(dropped[0]?.[0]).toBe(pin);
});

test("a TextEditor gives the tooltip of the text under the pointer, at its line and column", async () => {
	const asked: number[][] = [];
	await mount(
		<VBox>
			<TextEditor
				Name="e"
				Height={200}
				Text={"alpha beta"}
				OnHover={(line, column) => {
					asked.push([line, column]);
					return `at ${line}:${column}`;
				}}
			/>
		</VBox>,
	);
	await settle();
	const editor = find("e");
	const [x, y] = r.Rwidget_get_rect(editor);
	// (over the first word: Raven asks the function, and shows what it gives)
	for (const dx of [24, 30, 36, 42, 48, 54, 60, 66, 72, 78]) {
		r.Rwindow_inject_mouse_move(window, x + dx, y + 10);
		r.Rdraw_frame();
		if (asked.length > 0) {
			break;
		}
	}
	expect(asked.length).toBeGreaterThan(0);
	const [line, column] = asked.at(-1) ?? [];
	expect(r.Rwidget_get_tooltip(editor)).toBe(`at ${line}:${column}`);
});

test("a BlockEditor gives the block that changed", async () => {
	const changed: number[] = [];
	const editor = createRef<WidgetInstance>();
	await mount(
		<VBox>
			<BlockEditor ref={editor} Name="b" Height={200} Palette={false} Markup={'<Kind Name="move" Label="move" Shape="Statement"/>'} OnChanged={(block) => changed.push(block)} OnClicked={() => {}} OnContext={() => {}} />
		</VBox>,
	);
	const widget = find("b");
	const block = r.Rblock_editor_add_block(widget, "move", 20, 20);
	expect(block).toBeGreaterThan(0);
	await settle();
	const [x, y] = r.Rwidget_get_rect(widget);
	// (the view starts 20 before the canvas)
	r.Rwindow_inject_mouse_move(window, x + 50, y + 48);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 1);
	r.Rdraw_frame();
	r.Rwindow_inject_mouse_move(window, x + 120, y + 100);
	r.Rdraw_frame();
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 0);
	expect(changed).toContain(block);
});

test("a FileBrowser says when it is cancelled, and what was chosen", async () => {
	let cancelled = 0;
	const accepted: string[] = [];
	await mount(<VBox><FileBrowser Name="f" Height={300} Mode="Save" Directory={tmpdir()} FileName="name.txt" OnCancelled={() => cancelled++} OnAccepted={(path) => accepted.push(path)} OnChanged={() => {}} /></VBox>);
	const browser = find("f");
	await settle();
	const buttons = Array.from({ length: r.Rwidget_get_child_count(browser) }, (_, index) => r.Rwidget_get_child(browser, index)).filter((child) => r.Rwidget_get_type(child) === r.R_WIDGET_BUTTON);
	const clickButton = (button: r.Rid | undefined): void => {
		const [x, y, width, height] = r.Rwidget_get_rect(button ?? r.R_INVALID_ID);
		clickAt(x + width / 2, y + height / 2);
	};
	clickButton(buttons[0]);
	expect(cancelled).toBe(1);
	expect(accepted).toEqual([]);
	clickButton(buttons[1]);
	expect(accepted.length).toBe(1);
	expect(accepted[0]).toEndWith("name.txt");
});

test("tag makes a component for a tag of its own", async () => {
	const Registered = tag<{ readonly Name?: string; readonly Text?: string }>("Label");
	await mount(<VBox><Registered Name="l" Text="hello" /></VBox>);
	expect(r.Rlabel_get_text(find("l"))).toBe("hello");
});

test("a theme is a name, not only one of the choices", async () => {
	const warn = console.warn;
	const warnings: string[] = [];
	console.warn = (...values: string[]): void => void warnings.push(values.join(" "));
	const name = r.Rtheme_load_from_memory('<Theme Name="Paper" Base="Light"/>');
	expect(name).toBe("Paper");
	await mount(<VBox Theme="Paper"><Label>x</Label></VBox>);
	console.warn = warn;
	expect(warnings).toEqual([]);
});

test("a Separator in a Menu is a line of the menu, and elsewhere a widget", async () => {
	function Menus({ name }: { name: string }): ReactNode {
		return (
			<VBox Name="box">
				<Separator Name="plain" />
				<MenuBar>
					<Menu Name="m" Title="File">
						<MenuItem Text="Open" />
						<Separator Name={name} />
						<MenuItem Text="Quit" />
					</Menu>
				</MenuBar>
			</VBox>
		);
	}
	await mount(<Menus name="line" />);
	expect(r.Rwidget_get_child_count(find("m"))).toBe(3);
	const line = find("line");
	expect(r.Rwidget_get_type(line)).toBe(r.R_WIDGET_MENU_ITEM);
	expect(r.Rwidget_get_type(find("plain"))).toBe(r.R_WIDGET_SEPARATOR);
	root?.render(<Menus name="renamed" />);
	await settle();
	expect(find("renamed")).toBe(line);
});

test("a checkable MenuItem shows what its prop says, whatever a click did", async () => {
	const seen: boolean[] = [];
	const menu = createRef<WidgetInstance>();
	const item = createRef<WidgetInstance>();
	await mount(
		<VBox>
			<Menu ref={menu}>
				<MenuItem ref={item} Text="Check" Checkable Checked OnClicked={(value) => seen.push(value)} />
			</Menu>
		</VBox>,
	);
	menu.current?.open(40, 40);
	await settle();
	r.Rwindow_inject_mouse_move(window, 70, 56);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 1);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 0);
	expect(seen).toEqual([false]);
	expect(r.Rmenu_item_is_checked(item.current?.widget ?? r.R_INVALID_ID)).toBe(1);
});

test("createPortal renders into a widget given to Raven by hand, with context", async () => {
	const Theme = createContext("none");
	const graph = createRef<WidgetInstance>();
	let box: r.Rid = r.R_INVALID_ID;
	function Content(): ReactNode {
		const theme = useContext(Theme);
		return <Label Name="in-node">{theme}</Label>;
	}
	function Node({ show }: { show: boolean }): ReactNode {
		const [made] = useState(() => r.Rwidget_create_from_xml("<VBox/>"));
		box = made;
		useLayoutEffect(() => {
			const id = graph.current?.widget ?? r.R_INVALID_ID;
			r.Rnode_graph_set_node_content(id, r.Rnode_graph_add_node(id, "N", 0, 0), made);
		}, [made]);
		return show ? createPortal(<Content />, made) : null;
	}
	function App({ show }: { show: boolean }): ReactNode {
		return (
			<Theme.Provider value="dark">
				<VBox>
					<NodeGraph ref={graph} Name="g" Height={300} />
					<Node show={show} />
				</VBox>
			</Theme.Provider>
		);
	}
	await mount(<App show />);
	const label = r.Rwidget_find(box, "in-node");
	expect(r.Rwidget_get_parent(label)).toBe(box);
	expect(r.Rlabel_get_text(label)).toBe("dark");
	root?.render(<App show={false} />);
	await settle();
	expect(r.Rwidget_get_child_count(box)).toBe(0);
	expect(r.Rwidget_is_valid(label)).toBe(0);
});

test("inEventScope commits what a callback of C changes before the next event", async () => {
	const setter: { current: (next: number) => void } = { current: () => {} };
	function Counter(): ReactNode {
		const [count, setCount] = useState(0);
		setter.current = setCount;
		return <VBox><Label Name="n">{count}</Label></VBox>;
	}
	await mount(<Counter />);
	const wrapped = inEventScope((value: number) => {
		setter.current(value);
		return value + 1;
	});
	expect(wrapped(5)).toBe(6);
	expect(r.Rlabel_get_text(find("n"))).toBe("5");
	const report = console.error;
	console.error = (): void => {};
	const throwing = inEventScope((): number => {
		throw new Error("x");
	}, 0);
	expect(throwing()).toBe(0);
	console.error = report;
});

test("a ListView keeps its selected row when its items change, and Selected can come first", async () => {
	function Rows({ items }: { items: readonly string[] }): ReactNode {
		return <VBox><ListView Name="l" Height={100} Selected={1} Items={items} OnChanged={() => {}} /></VBox>;
	}
	await mount(<Rows items={["a", "b", "c"]} />);
	expect(r.Rlist_view_get_selected(find("l"))).toBe(1);
	root?.render(<Rows items={["x", "y"]} />);
	await settle();
	expect(r.Rlist_view_get_item_count(find("l"))).toBe(2);
	expect(r.Rlist_view_get_selected(find("l"))).toBe(1);
});

test("panels of a DockArea given by slots stand on their sides, also after a remake and a re-add", async () => {
	function Panels({ fade }: { fade: boolean }): ReactNode {
		return (
			<VBox>
				<DockArea Name="d" Height={300} {...(fade ? { Movable: false } : {})}>
					<Label Name="c" Slot={{ Title: "Center" }}>c</Label>
					<Label Name="r" Slot={{ Title: "Right", Dock: "Right", DockTo: "c", DockSize: 0.25 }}>r</Label>
					<Label Name="t" Slot={{ Title: "Tab", Dock: "Tab", DockTo: "c" }}>t</Label>
				</DockArea>
			</VBox>
		);
	}
	await mount(<Panels fade />);
	const area = find("d");
	expect(r.Rwidget_get_rect(find("r"))[0]).toBeGreaterThan(r.Rwidget_get_rect(find("c"))[0]);
	// what examples/workspace does to place them by hand does no harm
	for (const name of ["c", "r", "t"]) {
		const child = find(name);
		r.Rwidget_remove_child(area, child);
		r.Rwidget_add_child(area, child);
	}
	await settle();
	expect(r.Rwidget_get_rect(find("r"))[0]).toBeGreaterThan(r.Rwidget_get_rect(find("c"))[0]);
	expect(r.Rwidget_get_child_count(area)).toBe(3);
	root?.render(<Panels fade={false} />);
	await settle();
	expect(find("d")).not.toBe(area);
	expect(r.Rwidget_get_child_count(find("d"))).toBe(3);
	expect(r.Rwidget_get_rect(find("r"))[0]).toBeGreaterThan(r.Rwidget_get_rect(find("c"))[0]);
});

test("a Window and a widget take what is dropped", async () => {
	const owner = createRef<WindowInstance>();
	const windows = new RavenRoot();
	windows.render(<Window ref={owner} OnDrop={() => true}><VBox OnDrop={() => true} /></Window>);
	await settle();
	// (the OnDrop of each, and what an open window is told when the user closes it)
	expect(eventStats().handlers).toBe(3);
	windows.unmount();
	expect(eventStats().handlers).toBe(0);
});

test("Color and Metric take null to go back to the theme, without making the widget again", async () => {
	const theme = r.Rtheme_get_color(r.R_COLOR_TEXT);
	const color = (widget: r.Rid): readonly number[] => r.Rwidget_get_color(widget, r.R_COLOR_TEXT);
	function Text({ override }: { override: boolean }): ReactNode {
		return <VBox><Label Name="l" Color={{ Text: override ? "#FF0000" : null }} Metric={{ FontSize: override ? 30 : null }}>x</Label></VBox>;
	}
	await mount(<Text override />);
	const label = find("l");
	expect(color(label)[0]).toBeCloseTo(1, 3);
	expect(r.Rwidget_get_metric(label, r.R_METRIC_FONT_SIZE)).toBe(30);
	root?.render(<Text override={false} />);
	await settle();
	expect(find("l")).toBe(label);
	expect(color(label)).toEqual(theme);
	expect(r.Rwidget_get_metric(label, r.R_METRIC_FONT_SIZE)).toBe(r.Rtheme_get_metric(r.R_METRIC_FONT_SIZE));
});

test("FontStyle takes a style of the font of the theme", async () => {
	// (a bold Raven derives can be as wide: another font as the variant shows which was taken)
	r.Rfont_set_variant(r.Rfont_get_default(), r.R_FONT_BOLD, r.Rfont_get_monospace());
	const wide = (): number => r.Rwidget_get_rect(find("l"))[2];
	function Heading({ style }: { style: "Regular" | "Bold" }): ReactNode {
		return <HBox><VBox><Label Name="l" FontStyle={style}>A heading of some length</Label></VBox></HBox>;
	}
	await mount(<Heading style="Regular" />);
	const regular = wide();
	root?.render(<Heading style="Bold" />);
	await settle();
	expect(wide()).not.toBe(regular);
	r.Rfont_set_variant(r.Rfont_get_default(), r.R_FONT_BOLD, r.R_INVALID_ID);
});

test("the functions of raven_web come from the library, and WebView is a tag once they are asked", async () => {
	expect(webFunctions().Rweb_is_available()).toBeOneOf([0, 1]);
	registerWebView();
	// None of this needs a page. A real browser would only make it slow: starting one and stopping
	// it at once took over 5 seconds on the macOS runner, past the time limit of a test.
	webFunctions().Rweb_set_browser_path(Buffer.from("/nonexistent/raven-test-browser\0"));
	const page = createRef<WidgetInstance>();
	await mount(<VBox><WebView ref={page} Name="w" Height={100} Zoom={1.5} /></VBox>);
	webFunctions().Rweb_set_browser_path(null);
	expect(webFunctions().Rweb_view_is_valid(page.current?.widget ?? r.R_INVALID_ID)).toBe(1);
	expect(webFunctions().Rweb_view_get_zoom(page.current?.widget ?? r.R_INVALID_ID)).toBeCloseTo(1.5, 5);
});

/** Never called: what the compiler must refuse. */
export const refusedByTheTypes = (): readonly ReactNode[] => [
	// @ts-expect-error a WebView forwards its input through this callback, which a prop would replace
	<WebView OnEvent={() => true} />,
	// @ts-expect-error the action of a TextInput fires on Enter, so a name here would not fire at each change
	<TextInput OnChanged="save" />,
	// @ts-expect-error the action of a ListView fires when a row is activated, not when the selection changes
	<ListView OnChanged="save" />,
	// @ts-expect-error as for a ListView
	<TreeView OnChanged="save" />,
	// @ts-expect-error as for a ListView
	<TileView OnChanged="save" />,
];
