/** React components as tags of Raven: built by Raven from XML, as `<Button>` is, with no declaration in XML. */

import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { useEffect, type ReactNode } from "react";
import * as r from "../raven";
import { Border, createWindow, HBox, Label, RavenRoot, registerTag, VBox } from "../index";
import { RavenError } from "../errors";

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
	errors.length = 0;
});

afterAll(() => {
	r.Rquit(0);
	r.Rshutdown();
});

/** Lets React and the event loop finish, with frames between. */
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

/** A small colored label, with a number and a switch to show the kinds of attributes. */
function Badge({ Text = "new", Count = 0, Loud = false }: { readonly Text?: string; readonly Count?: number; readonly Loud?: boolean }): ReactNode {
	useEffect(() => {
		mounted++;
		return () => void mounted--;
	}, []);
	return (
		<Border Name="badge">
			<Label Name="badge-text">{`${Loud ? Text.toUpperCase() : Text} ${Count}`}</Label>
		</Border>
	);
}

/** A card: a title, what it holds, and a footer. */
function Card({ Title = "Untitled", children, footer }: { readonly Title?: string; readonly children?: ReactNode; readonly footer?: ReactNode }): ReactNode {
	return (
		<VBox Name="card-body" Spacing={8}>
			<Label Name="card-title">{Title}</Label>
			{children}
			<HBox Name="card-footer">{footer}</HBox>
		</VBox>
	);
}

/** Registers a tag for one test. */
function register(...args: Parameters<typeof registerTag<{ readonly Text?: string; readonly Count?: number; readonly Loud?: boolean }>>): void {
	unregister.push(registerTag(...args));
}

test("Raven builds a registered component from XML, with its attributes as typed props", async () => {
	register("Badge", Badge, { attributes: { Text: "string", Count: "number", Loud: "boolean" } });
	await build('<VBox><Badge Name="b" Text="hot" Count="3" Loud="true"/></VBox>');
	expect(r.Rlabel_get_text(r.Rwidget_find(find("b"), "badge-text"))).toBe("HOT 3");
	expect(errors).toEqual([]);
});

test("an attribute set later renders the component again", async () => {
	register("Badge", Badge, { attributes: { Text: "string", Count: "number" } });
	await build('<VBox><Badge Name="b" Text="one"/></VBox>');
	expect(r.Rwidget_set_attribute(find("b"), "Count", "7")).toBeTruthy();
	expect(r.Rwidget_set_attribute(find("b"), "Text", "two")).toBeTruthy();
	await settle();
	expect(r.Rlabel_get_text(r.Rwidget_find(find("b"), "badge-text"))).toBe("two 7");
});

test("the text inside the element is its Text", async () => {
	register("Badge", Badge, { attributes: { Text: "string" } });
	await build('<VBox><Badge Name="b">inside</Badge></VBox>');
	expect(r.Rlabel_get_text(r.Rwidget_find(find("b"), "badge-text"))).toBe("inside 0");
});

test("what a component does not take stays with the widget: its name, its size, its place", async () => {
	register("Badge", Badge, { attributes: { Text: "string" } });
	await build('<VBox><Badge Name="b" Width="120" Slot.Padding="4"/></VBox>');
	expect(find("b")).not.toBe(r.R_INVALID_ID);
	expect(errors).toEqual([]);
});

test("a value that is not of the kind of its prop is reported by Raven, as for its own tags", async () => {
	register("Badge", Badge, { attributes: { Count: "number", Loud: "boolean" } });
	await build('<VBox><Badge Name="b" Count="many" Loud="perhaps"/></VBox>');
	expect(errors.filter((detail) => detail.includes("unknown attribute or invalid value"))).toHaveLength(2);
	expect(r.Rlabel_get_text(r.Rwidget_find(find("b"), "badge-text"))).toBe("new 0");
	errors.length = 0;
});

test("children of the element go where the component puts its children, and <Into> to a named place", async () => {
	unregister.push(registerTag("Card", Card, { attributes: { Title: "string" }, slots: ["footer"] }));
	const card = await build(
		'<Card Name="c" Title="Sales"><Label Name="first"/><Label Name="second"/><Into Name="footer"><Label Name="action"/></Into></Card>',
	);
	expect(r.Rlabel_get_text(r.Rwidget_find(card, "card-title"))).toBe("Sales");
	// in the body itself, in order, after the title: no box around them
	expect(namesUnder(r.Rwidget_find(card, "card-body"))).toEqual(["card-title", "first", "second", "card-footer"]);
	expect(namesUnder(r.Rwidget_find(card, "card-footer"))).toEqual(["action"]);
	expect(errors).toEqual([]);
});

test("a registered tag inside another one, and in a document built by code", async () => {
	unregister.push(registerTag("Card", Card, { attributes: { Title: "string" }, slots: ["footer"] }));
	register("Badge", Badge, { attributes: { Text: "string" } });
	const document = r.Rxml_document_create("Card");
	const card = r.Rxml_document_get_root(document);
	r.Rxml_node_set_attribute(card, "Name", "c");
	r.Rxml_node_set_attribute(r.Rxml_node_add_child(card, "Badge", -1), "Name", "inner");
	const widget = r.Rxml_document_create_widget(document);
	r.Rxml_document_destroy(document);
	const made = createWindow({ Title: "Tags", Width: 480, Height: 480 });
	window = made.window;
	root = made.root;
	r.Rwidget_add_child(r.Rwindow_get_content(window), widget);
	await settle();
	expect(namesUnder(r.Rwidget_find(find("c"), "card-body"))).toEqual(["card-title", "inner", "card-footer"]);
	expect(r.Rlabel_get_text(r.Rwidget_find(find("inner"), "badge-text"))).toBe("new 0");
});

test("<Into> a place the component does not have is reported, and its widgets are not lost", async () => {
	unregister.push(registerTag("Card", Card, { attributes: { Title: "string" }, slots: ["footer"] }));
	const reported = spyOn(console, "error").mockImplementation(() => {});
	try {
		const card = await build('<Card Name="c"><Into Name="header"><Label Name="lost"/></Into></Card>');
		expect(reported.mock.calls).toEqual([['raven-react: <Card>: <Into Name="header">: no place of this name; its widgets go with the others']]);
		expect(namesUnder(r.Rwidget_find(card, "card-body"))).toEqual(["card-title", "lost", "card-footer"]);
	} finally {
		reported.mockRestore();
	}
});

test("destroying the widget unmounts the component, and runs the cleanups of its effects", async () => {
	register("Badge", Badge, {});
	mounted = 0;
	const widget = await build('<VBox><Badge/><Badge/></VBox>');
	expect(mounted).toBe(2);
	r.Rwidget_destroy(widget);
	await settle();
	expect(mounted).toBe(0);
	expect(errors).toEqual([]);
});

/** A card that hides what it holds, or puts it in a box of its own, as its attributes say. */
function Folding({ Open = true, Boxed = false, children }: { readonly Open?: boolean; readonly Boxed?: boolean; readonly children?: ReactNode }): ReactNode {
	return (
		<VBox Name="folding-body">
			<Label Name="folding-title">Folding</Label>
			{Open && (Boxed ? <HBox Name="folding-box">{children}</HBox> : children)}
		</VBox>
	);
}

test("the widgets of the children stay alive while the component hides them, and come back", async () => {
	unregister.push(registerTag("Folding", Folding, { attributes: { Open: "boolean", Boxed: "boolean" } }));
	const card = await build('<Folding Name="f"><Label Name="kept"/></Folding>');
	const kept = r.Rwidget_find(card, "kept");
	expect(r.Rwidget_set_attribute(card, "Open", "false")).toBeTruthy();
	await settle();
	expect(r.Rwidget_is_valid(kept)).toBeTruthy();
	expect(namesUnder(r.Rwidget_find(card, "folding-body"))).toEqual(["folding-title"]);
	expect(r.Rwidget_set_attribute(card, "Open", "true")).toBeTruthy();
	await settle();
	expect(namesUnder(r.Rwidget_find(card, "folding-body"))).toEqual(["folding-title", "kept"]);
	expect(r.Rwidget_find(card, "kept")).toBe(kept);
	expect(errors).toEqual([]);
});

test("the widgets of the children stay alive when the component moves them into a box of its own", async () => {
	unregister.push(registerTag("Folding", Folding, { attributes: { Open: "boolean", Boxed: "boolean" } }));
	const card = await build('<Folding Name="f"><Label Name="kept"/></Folding>');
	const kept = r.Rwidget_find(card, "kept");
	expect(r.Rwidget_set_attribute(card, "Boxed", "true")).toBeTruthy();
	await settle();
	expect(namesUnder(r.Rwidget_find(card, "folding-box"))).toEqual(["kept"]);
	expect(r.Rwidget_find(card, "kept")).toBe(kept);
	expect(r.Rwidget_set_attribute(card, "Boxed", "false")).toBeTruthy();
	await settle();
	expect(namesUnder(r.Rwidget_find(card, "folding-body"))).toEqual(["folding-title", "kept"]);
	expect(errors).toEqual([]);
});

test("widgets of the children that are hidden when the element is destroyed are destroyed with it", async () => {
	unregister.push(registerTag("Folding", Folding, { attributes: { Open: "boolean" } }));
	const card = await build('<Folding Name="f"><Label Name="kept"/></Folding>');
	const kept = r.Rwidget_find(card, "kept");
	r.Rwidget_set_attribute(card, "Open", "false");
	await settle();
	r.Rwidget_destroy(card);
	await settle();
	expect(r.Rwidget_is_valid(kept)).toBeFalsy();
	expect(errors).toEqual([]);
});

test("a tag that is unregistered is known no more, and a tag of Raven cannot be taken", () => {
	const done = registerTag("Badge", Badge, {});
	expect(r.Rxml_is_tag_registered("Badge")).toBeTruthy();
	done();
	expect(r.Rxml_is_tag_registered("Badge")).toBeFalsy();
	expect(() => registerTag("Button", Badge, {})).toThrow(RavenError);
	expect(() => registerTag("Into", Badge, {})).toThrow(RavenError);
	errors.length = 0;
});

test("the kinds of attributes and the names of places are checked against the props", () => {
	// @ts-expect-error: Count is a number, not a string
	const kind = (): (() => void) => registerTag("Badge", Badge, { attributes: { Count: "string" } });
	// @ts-expect-error: Badge has no place for widgets called footer
	const place = (): (() => void) => registerTag("Badge", Badge, { slots: ["footer"] });
	expect([typeof kind, typeof place]).toEqual(["function", "function"]);
});
