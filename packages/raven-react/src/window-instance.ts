import * as r from "./raven";
import { RavenError } from "./errors";
import { closeEvents, WINDOW_EVENTS } from "./events";
import type { EventHandler } from "./props";
import { escapeXml, resolveProps, type RavenProps, type ResolvedProps } from "./props";
import { WidgetInstance, type HostNode } from "./widget-instance";

/** Where the widgets of a window go. Its size is the size of the window. */
export const CONTENT_NAME = "raven-react.content";

/** What each way of writing `Backdrop` means, as the XML loader reads it. */
const BACKDROPS: Readonly<Record<string, r.RBackdrop>> = {
	None: r.R_BACKDROP_NONE,
	Opaque: r.R_BACKDROP_NONE,
	Transparent: r.R_BACKDROP_TRANSPARENT,
	Blur: r.R_BACKDROP_BLUR,
	Acrylic: r.R_BACKDROP_ACRYLIC,
	Mica: r.R_BACKDROP_MICA,
};

/** What a window can take while it is open, by calling Raven. */
const SET_ON_OPEN_WINDOW: Readonly<Record<string, (window: r.Rid, value: string) => void>> = {
	Title: (window, value) => r.Rwindow_set_title(window, value),
	Theme: (window, value) => void r.Rwindow_set_theme(window, value),
	Backdrop: (window, value) => {
		const backdrop = BACKDROPS[value];
		if (backdrop === undefined || !r.Rwindow_set_backdrop(window, backdrop)) {
			console.warn(`raven-react: <Window> did not take Backdrop="${value}": it needs Transparent, and a window system that does it`);
		}
	},
	Opacity: (window, value) => {
		if (!r.Rwindow_set_opacity(window, Number(value))) {
			console.warn("raven-react: this window system cannot make a window see-through with Opacity");
		}
	},
	ContinuousRedraw: (window, value) => r.Rwindow_set_continuous_redraw(window, value === "true" ? r.R_TRUE : r.R_FALSE),
};

/** What the XML of a window does not take: it is set by calling Raven, once the window is there. */
const NOT_IN_XML: ReadonlySet<string> = new Set(["Opacity", "ContinuousRedraw"]);

/**
 * Makes a window from attributes, with a place for widgets. That place is an `Overlay`, as for the
 * content of a window in C: a child fills the window and follows its `Slot`. A `VBox` would not let
 * it, and children that should stack go in one.
 */
export function makeWindow(attributes: ReadonlyMap<string, string>): { window: r.Rid; content: r.Rid } {
	const text = [...attributes].filter(([name]) => !NOT_IN_XML.has(name)).map(([name, value]) => `${name}="${escapeXml(value)}"`).join(" ");
	const window = r.Rwindow_create_from_xml(`<Window ${text}><Overlay Name="${CONTENT_NAME}"/></Window>`);
	if (window === r.R_INVALID_ID) {
		RavenError.fromLibrary("Raven cannot make the window");
	}
	for (const [name, value] of attributes) {
		if (NOT_IN_XML.has(name)) {
			SET_ON_OPEN_WINDOW[name]?.(window, value);
		}
	}
	return { window, content: r.Rwidget_find(window, CONTENT_NAME) };
}

/** Sets or removes the events of a window, from what its props say now. */
function setWindowEvents(window: r.Rid, handlers: ReadonlyMap<string, EventHandler>): void {
	for (const [name, event] of Object.entries(WINDOW_EVENTS)) {
		const handler = handlers.get(name);
		if (handler) {
			event.on(window, handler);
		} else {
			event.off(window, true);
		}
	}
}

/**
 * A `<Window>` under React, and what a `ref` receives. It holds widgets but stands by itself:
 * it can be anywhere in the tree, and goes away when its element does.
 */
export class WindowInstance implements HostNode {
	readonly tag = "Window";
	readonly nativeWidget = null;
	private readonly content: WidgetInstance;
	/** Its `<Island>`: it floats above the content, as in XML, and the window owns it. */
	private island: WidgetInstance | null = null;

	private constructor(
		/** Raven's handle of the window, for the functions of the `raven` export. */
		readonly window: r.Rid,
		content: r.Rid,
		private resolved: ResolvedProps,
	) {
		this.content = WidgetInstance.forContainer(content);
	}

	/** A new window, shown with what its props say. */
	static create(props: RavenProps): WindowInstance {
		const resolved = resolveProps(props);
		const { window, content } = makeWindow(resolved.attributes);
		closeEvents.set(window, resolved.handlers.get("OnClose"));
		setWindowEvents(window, resolved.handlers);
		return new WindowInstance(window, content, resolved);
	}

	/** Whether the window still exists: without an `OnClose`, the user can close it at any time. */
	get isOpen(): boolean {
		return r.Rwindow_is_valid(this.window) !== 0;
	}

	setParent(): void {}

	applyParentAttributes(): void {}

	/** What can change on a window that is open. The other attributes only count when it is made. */
	update(props: RavenProps): void {
		const next = resolveProps(props);
		if (this.isOpen) {
			this.applyChanges(next);
		}
		this.resolved = next;
	}

	/** Applies what changed in the props. */
	private applyChanges(next: ResolvedProps): void {
		const previous = this.resolved.attributes;
		for (const [name, value] of next.attributes) {
			if (value !== previous.get(name)) {
				SET_ON_OPEN_WINDOW[name]?.(this.window, value);
			}
		}
		const width = next.attributes.get("Width");
		const height = next.attributes.get("Height");
		if (width !== undefined && height !== undefined && (width !== previous.get("Width") || height !== previous.get("Height"))) {
			r.Rwindow_set_size(this.window, Number(width), Number(height));
		}
		for (const [name, value] of next.attributes) {
			if (previous.get(name) !== value && !SET_ON_OPEN_WINDOW[name] && name !== "Width" && name !== "Height") {
				console.warn(`raven-react: <Window> ${name} only counts when the window is made`);
			}
		}
		closeEvents.set(this.window, next.handlers.get("OnClose"));
		setWindowEvents(this.window, next.handlers);
	}

	/** Makes a child the island of this window, if it is one and there is none yet. */
	private takeIsland(child: HostNode): boolean {
		if (child.tag !== "Island" || this.island || !(child instanceof WidgetInstance)) {
			return false;
		}
		const set = (widget: r.Rid): void => r.Rwindow_set_island(this.window, widget);
		this.island = child;
		child.setHolder(set);
		set(child.widget);
		return true;
	}

	append(child: HostNode): void {
		if (child !== this.island && !this.takeIsland(child)) {
			this.content.append(child);
		}
	}

	insertBefore(child: HostNode, before: HostNode): void {
		if (child === this.island || this.takeIsland(child)) {
			return;
		}
		// (the island is not among the widgets of the content: nothing can go before it there)
		if (before === this.island) {
			this.content.append(child);
		} else {
			this.content.insertBefore(child, before);
		}
	}

	remove(child: HostNode): void {
		if (child !== this.island) {
			this.content.remove(child);
			return;
		}
		child.forgetTree();
		this.island = null;
		(child as WidgetInstance).setHolder(null);
		if (this.isOpen) {
			// (this deletes it: the window owns it. What it holds of registered tags is theirs)
			(child as WidgetInstance).releaseAdopted();
			r.Rwindow_set_island(this.window, r.R_INVALID_ID);
		}
		child.dispose();
	}

	forgetTree(): void {
		this.content.forgetTree();
		this.island?.forgetTree();
		closeEvents.set(this.window, undefined, false);
		for (const event of Object.values(WINDOW_EVENTS)) {
			event.off(this.window, false);
		}
	}

	dispose(): void {
		if (this.isOpen) {
			// (the window destroys what it holds: those of registered tags are theirs)
			this.content.releaseAdopted();
			this.island?.releaseAdopted();
		}
		this.content.disposeDetached();
		this.island?.disposeDetached();
		if (this.isOpen) {
			r.Rwindow_destroy(this.window);
		}
	}
}
