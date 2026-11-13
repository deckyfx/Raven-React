/** @jsxImportSource solid-js */
/** Solid components as tags of Raven: built by Raven from XML, as `<Button>` is, with no declaration in XML. */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createSignal, onCleanup, onMount, splitProps, type JSX } from "solid-js";
import * as r from "../../core/raven";
import { Border, createWindow, HBox, Label, RavenRoot, registerTag, VBox } from "../../solid/index";

let window: r.Rid = r.R_INVALID_ID;
let root: RavenRoot | null = null;
const errors: string[] = [];
const unregister: (() => void)[] = [];

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
	for (const done of unregister.splice(0)) {
		done();
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

/** Lets the event loop finish, with frames between. */
async function settle(ms = 30): Promise<void> {
	const end = performance.now() + ms;
	do {
		r.Rdraw_frame();
		await new Promise<void>((resolve) => setImmediate(resolve));
	} while (performance.now() < end);
}

/** Has Raven build some XML into a new window, as a document or a file would. */
async function build(xml: string): Promise<r.Rid> {
	const made = createWindow({ Title: "Tags", Width: 480, Height: 480 });
	window = made.window;
	root = made.root;
	const widget = r.Rwidget_create_from_xml(xml);
	expect(widget).not.toBe(r.R_INVALID_ID);
	r.Rwidget_add_child(r.Rwindow_get_content(window), widget);
	await settle();
	return widget;
}

const find = (name: string): r.Rid => r.Rwidget_find(window, name);
/** The names of the widgets directly under one, in order. */
function namesUnder(widget: r.Rid): string[] {
	return Array.from({ length: r.Rwidget_get_child_count(widget) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(widget, index)) ?? "");
}

let mounted = 0;

interface BadgeProps {
	readonly Text?: string;
	readonly Count?: number;
	readonly Loud?: boolean;
}

/** A small label, with a number and a switch to show the kinds of attributes. */
function Badge(props: BadgeProps): JSX.Element {
	onMount(() => mounted++);
	onCleanup(() => mounted--);
	const text = (): string => props.Text ?? "new";
	return (
		<Border Name="badge">
			<Label Name="badge-text">{`${props.Loud ? text().toUpperCase() : text()} ${props.Count ?? 0}`}</Label>
		</Border>
	);
}

/** A card: a title, what it holds, and a footer. */
function Card(props: { readonly Title?: string; readonly children?: JSX.Element; readonly footer?: JSX.Element }): JSX.Element {
	return (
		<VBox Name="card-body" Spacing={8}>
			<Label Name="card-title">{props.Title ?? "Untitled"}</Label>
			{props.children}
			<HBox Name="card-footer">{props.footer}</HBox>
		</VBox>
	);
}

test("Raven builds a registered component from XML, with its attributes as typed props", async () => {
	unregister.push(registerTag("Badge", Badge, { attributes: { Text: "string", Count: "number", Loud: "boolean" } }));
	await build('<VBox><Badge Name="b" Text="hot" Count="3" Loud="true"/></VBox>');
	expect(r.Rlabel_get_text(r.Rwidget_find(find("b"), "badge-text"))).toBe("HOT 3");
	expect(errors).toEqual([]);
});

test("an attribute set later reaches the props, and the component is not made again", async () => {
	unregister.push(registerTag("Badge", Badge, { attributes: { Text: "string", Count: "number" } }));
	mounted = 0;
	await build('<VBox><Badge Name="b" Text="one"/></VBox>');
	const label = r.Rwidget_find(find("b"), "badge-text");
	expect(r.Rwidget_set_attribute(find("b"), "Count", "7")).toBeTruthy();
	expect(r.Rwidget_set_attribute(find("b"), "Text", "two")).toBeTruthy();
	await settle();
	expect(r.Rlabel_get_text(r.Rwidget_find(find("b"), "badge-text"))).toBe("two 7");
	expect(r.Rwidget_find(find("b"), "badge-text")).toBe(label);
	expect(mounted).toBe(1);
});

test("the text inside the element is its Text", async () => {
	unregister.push(registerTag("Badge", Badge, { attributes: { Text: "string" } }));
	await build('<VBox><Badge Name="b">inside</Badge></VBox>');
	expect(r.Rlabel_get_text(r.Rwidget_find(find("b"), "badge-text"))).toBe("inside 0");
});

test("children of the element go where the component puts its children, and <Into> to a named place", async () => {
	unregister.push(registerTag("Card", Card, { attributes: { Title: "string" }, slots: ["footer"] }));
	const card = await build(
		'<Card Name="c" Title="Sales"><Label Name="first"/><Label Name="second"/><Into Name="footer"><Label Name="action"/></Into></Card>',
	);
	expect(r.Rlabel_get_text(r.Rwidget_find(card, "card-title"))).toBe("Sales");
	expect(namesUnder(r.Rwidget_find(card, "card-body"))).toEqual(["card-title", "first", "second", "card-footer"]);
	expect(namesUnder(r.Rwidget_find(card, "card-footer"))).toEqual(["action"]);
	expect(errors).toEqual([]);
});

test("destroying the widget unmounts the component, and runs its cleanups", async () => {
	unregister.push(registerTag("Badge", Badge, {}));
	mounted = 0;
	const widget = await build("<VBox><Badge/><Badge/></VBox>");
	expect(mounted).toBe(2);
	r.Rwidget_destroy(widget);
	await settle();
	expect(mounted).toBe(0);
	expect(errors).toEqual([]);
});

test("an attribute set later reaches the props that splitProps gave out", async () => {
	function Split(props: BadgeProps): JSX.Element {
		const [count, rest] = splitProps(props, ["Count"]);
		return <Label Name="split">{`${rest.Text ?? "none"} ${count.Count ?? 0}`}</Label>;
	}
	unregister.push(registerTag("Split", Split, { attributes: { Text: "string", Count: "number" } }));
	await build('<VBox><Split Name="s"/></VBox>');
	expect(r.Rlabel_get_text(r.Rwidget_find(find("s"), "split"))).toBe("none 0");
	expect(r.Rwidget_set_attribute(find("s"), "Count", "5")).toBeTruthy();
	expect(r.Rwidget_set_attribute(find("s"), "Text", "late")).toBeTruthy();
	await settle();
	expect(r.Rlabel_get_text(r.Rwidget_find(find("s"), "split"))).toBe("late 5");
});

test("a child of the element that the component hides and shows again comes back", async () => {
	const [open, setOpen] = createSignal(true);
	function Fold(props: { readonly children?: JSX.Element }): JSX.Element {
		return <VBox Name="fold-body">{open() && props.children}</VBox>;
	}
	unregister.push(registerTag("Fold", Fold, {}));
	const fold = await build('<Fold Name="f"><Label Name="inner"/></Fold>');
	const inner = r.Rwidget_find(fold, "inner");
	expect(namesUnder(r.Rwidget_find(fold, "fold-body"))).toEqual(["inner"]);
	setOpen(false);
	expect(namesUnder(r.Rwidget_find(fold, "fold-body"))).toEqual([]);
	setOpen(true);
	// (the same widget: the element's child, which hiding did not delete)
	expect(namesUnder(r.Rwidget_find(fold, "fold-body"))).toEqual(["inner"]);
	expect(r.Rwidget_find(fold, "inner")).toBe(inner);
	setOpen(false);
	setOpen(true);
	expect(r.Rwidget_find(fold, "inner")).toBe(inner);
});
