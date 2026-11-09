/** Every tag of Raven has a component of React, which makes its widget. */

import { afterAll, beforeAll, expect, test } from "bun:test";
import * as r from "../../core/raven";
import * as components from "../../react/index";

/** The tags of the schema of the library. */
const tags: string[] = [];

beforeAll(() => {
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_NULL;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
	for (let index = 0; index < r.Rxml_get_tag_count(); index++) {
		tags.push(r.Rxml_get_tag_name(index) ?? "");
	}
});

afterAll(() => {
	r.Rshutdown();
});

test("every tag has a component, which makes its widget", () => {
	const exported: Readonly<Record<string, ((props: object) => { type: string }) | undefined>> = components as never;
	expect(tags.length).toBeGreaterThan(40);
	for (const tag of tags) {
		expect(`${tag}: ${typeof exported[tag]}`).toBe(`${tag}: function`);
		expect(exported[tag]?.({}).type).toBe(tag);
		if (tag !== "Window") {
			const widget = r.Rwidget_create_from_xml(`<${tag}/>`);
			expect(`${tag}: ${widget !== r.R_INVALID_ID}`).toBe(`${tag}: true`);
			r.Rwidget_destroy(widget);
		}
	}
});
