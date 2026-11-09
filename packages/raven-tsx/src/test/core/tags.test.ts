/** Registered tags through a plain adapter, with no framework: what the core does for any adapter. */

import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import * as r from "../../core/raven";
import { registerTagWith, type TagAdapter, type TagContent, type TagMount } from "../../core/tags";

/** An adapter that only says what it was asked, with its component named by a text. */
class RecordingAdapter implements TagAdapter<string> {
	readonly calls: string[] = [];

	/** The last content a component was given. */
	last: TagContent | null = null;

	mount(component: string, props: TagContent, container: r.Rid): TagMount {
		this.calls.push(`mount ${component}`);
		this.last = props;
		expect(r.Rwidget_is_valid(container)).toBeTruthy();
		return {
			update: (next) => {
				this.calls.push(`update ${component}`);
				this.last = next;
			},
			unmount: () => this.calls.push(`unmount ${component}`),
		};
	}
}

const unregister: (() => void)[] = [];

beforeAll(() => {
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_NULL;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
});

afterEach(() => {
	for (const done of unregister.splice(0)) {
		done();
	}
});

afterAll(() => {
	r.Rshutdown();
});

/** Lets the microtask that places the children of an element run. */
const placed = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test("an adapter mounts a component with the attributes and the widgets of its element, then updates and unmounts it", async () => {
	const adapter = new RecordingAdapter();
	unregister.push(registerTagWith<string, { Title: string; footer: boolean }, boolean>(adapter, "CoreCard", "card", { attributes: { Title: "string" }, slots: ["footer"] }));
	const card = r.Rwidget_create_from_xml('<CoreCard Title="Sales"><Label Name="body"/><Into Name="footer"><Button Name="ok"/></Into></CoreCard>');
	expect(adapter.calls).toEqual([]);
	await placed();
	expect(adapter.calls).toEqual(["mount card"]);
	expect(adapter.last?.attributes).toEqual({ Title: "Sales" });
	expect(adapter.last?.children.map((widget) => r.Rwidget_get_name(widget))).toEqual(["body"]);
	expect(adapter.last?.slots.footer?.map((widget) => r.Rwidget_get_name(widget))).toEqual(["ok"]);
	const adopted = [...(adapter.last?.children ?? []), ...(adapter.last?.slots.footer ?? [])];

	r.Rwidget_set_attribute(card, "Title", "Costs");
	expect(adapter.calls).toEqual(["mount card", "update card"]);
	expect(adapter.last?.attributes).toEqual({ Title: "Costs" });

	r.Rwidget_destroy(card);
	r.Rdraw_frame();
	expect(adapter.calls).toEqual(["mount card", "update card", "unmount card"]);
	// (the adapter showed none of them: they went with the element)
	expect(adopted.filter((widget) => r.Rwidget_is_valid(widget))).toEqual([]);
});

test("a component that was taken away is not taken away again when the new one fails to mount", async () => {
	const first = new RecordingAdapter();
	const failing: TagAdapter<string> = {
		mount: () => {
			throw new Error("cannot mount");
		},
	};
	const quiet = spyOn(console, "error").mockImplementation(() => {});
	try {
		unregister.push(registerTagWith<string, { Title: string }, never>(first, "CoreFailing", "old", { attributes: { Title: "string" } }));
		const swap = r.Rwidget_create_from_xml("<CoreFailing/>");
		await placed();
		unregister.push(registerTagWith<string, { Title: string }, never>(failing, "CoreFailing", "new", { attributes: { Title: "string" } }));
		r.Rwidget_set_attribute(swap, "Title", "x");
		r.Rwidget_set_attribute(swap, "Title", "y");
		r.Rwidget_destroy(swap);
		r.Rdraw_frame();
		expect(first.calls).toEqual(["mount old", "unmount old"]);
	} finally {
		quiet.mockRestore();
	}
});

test("the widgets of an element are destroyed with it even when its component fails to unmount", async () => {
	let children: readonly r.Rid[] = [];
	const failing: TagAdapter<string> = {
		mount: (_component, props) => {
			children = props.children;
			return {
				update: () => {},
				unmount: () => {
					throw new Error("cannot unmount");
				},
			};
		},
	};
	const quiet = spyOn(console, "error").mockImplementation(() => {});
	try {
		unregister.push(registerTagWith<string, object, never>(failing, "CoreStuck", "stuck"));
		const card = r.Rwidget_create_from_xml('<CoreStuck><Label Name="body"/></CoreStuck>');
		await placed();
		expect(children.length).toBe(1);
		r.Rwidget_destroy(card);
		r.Rdraw_frame();
		expect(children.filter((widget) => r.Rwidget_is_valid(widget))).toEqual([]);
	} finally {
		quiet.mockRestore();
	}
});

test("a tag registered again renders the new component, through its own adapter", async () => {
	const first = new RecordingAdapter();
	const second = new RecordingAdapter();
	unregister.push(registerTagWith<string, { Title: string }, never>(first, "CoreSwap", "old", { attributes: { Title: "string" } }));
	const swap = r.Rwidget_create_from_xml("<CoreSwap/>");
	await placed();
	unregister.push(registerTagWith<string, { Title: string }, never>(second, "CoreSwap", "new", { attributes: { Title: "string" } }));
	r.Rwidget_set_attribute(swap, "Title", "x");
	expect(first.calls).toEqual(["mount old", "unmount old"]);
	expect(second.calls).toEqual(["mount new"]);
	expect(second.last?.attributes).toEqual({ Title: "x" });
	r.Rwidget_destroy(swap);
	r.Rdraw_frame();
});
