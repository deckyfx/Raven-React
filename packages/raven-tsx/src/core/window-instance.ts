import * as r from "./raven";
import { RavenError } from "./errors";
import { closeEvents, WINDOW_EVENTS } from "./events";
import type { EventHandler } from "./props";
import { escapeXml, resolveProps, type RavenProps, type ResolvedProps } from "./props";
import { WidgetInstance, type HostNode } from "./widget-instance";

/** Where the widgets of a window go. Its size is the size of the window. */
export const CONTENT_NAME = "raven-tsx.content";

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
			console.warn(`raven-tsx: <Window> did not take Backdrop="${value}": it needs Transparent, and a window system that does it`);
		}
	},
	Opacity: (window, value) => {
		if (!r.Rwindow_set_opacity(window, Number(value))) {
			console.warn("raven-tsx: this window system cannot make a window see-through with Opacity");
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
 * A `<Window>` under a framework, and what a `ref` receives. It holds widgets but stands by itself:
 * it can be anywhere in the tree, and goes away when its element does. It opens once it is placed:
 * a render the framework throws away opens nothing.
 */
export class WindowInstance implements HostNode {
	readonly tag = "Window";
	readonly nativeWidget = null;
	private id: r.Rid = r.R_INVALID_ID;
	/** Where its widgets go, once it is open. */
	private content: WidgetInstance | null = null;
	/** The children rendered with it, which go in when it opens. */
	private readonly initial: HostNode[] = [];
	/** Its `<Island>`: it floats above the content, as in XML, and the window owns it. */
	private island: WidgetInstance | null = null;
	private state: "pending" | "live" | "gone" = "pending";
	/** What waits for the window to open. */
	private readonly opening = new Set<() => void>();

	private constructor(private resolved: ResolvedProps) {}

	/** A new window, as a framework renders it: it opens at `materialize`, with what its props say. */
	static create<Child>(props: RavenProps<Child>): WindowInstance {
		return new WindowInstance(resolveProps(props));
	}

	/** Raven's handle of the window, for the functions of the `raven` export: `R_INVALID_ID` until it is placed. */
	get window(): r.Rid {
		return this.id;
	}

	/** Opens the window, with its children. If any of it fails, the window is deleted. */
	materialize(): void {
		if (this.state !== "pending") {
			return;
		}
		const { window, content } = makeWindow(this.resolved.attributes);
		this.id = window;
		this.content = WidgetInstance.forContainer(content);
		this.state = "live";
		try {
			closeEvents.set(window, this.resolved.handlers.get("OnClose"));
			setWindowEvents(window, this.resolved.handlers);
			for (const child of this.initial.splice(0)) {
				this.append(child);
			}
		} catch (error) {
			this.forgetTree();
			this.dispose();
			throw error;
		}
		// (the window is open: what waited for it runs, and the first that threw says so after. A failure
		// of one is not a failure of the window, which stays. One that was cancelled meanwhile, or all of
		// them once the window is gone, disposed or destroyed in Raven, do not run)
		const failures: unknown[] = [];
		for (const run of [...this.opening]) {
			if (!this.opening.delete(run) || !this.isOpen) {
				continue;
			}
			try {
				run();
			} catch (error) {
				failures.push(error);
			}
		}
		if (failures.length > 0) {
			throw failures[0];
		}
	}

	/**
	 * Runs a function once the window is open: now if it is, or when it is placed. Returns what
	 * cancels it, if it has not run. A framework's ref gives the window before it opens.
	 */
	whenOpen(run: () => void): () => void {
		if (this.state === "live") {
			// (a window the user closed, or Raven destroyed, does not open again)
			if (this.isOpen) {
				run();
			}
			return () => {};
		}
		if (this.state === "gone") {
			return () => {};
		}
		this.opening.add(run);
		return () => void this.opening.delete(run);
	}

	/** Whether the window still exists: without an `OnClose`, the user can close it at any time. */
	get isOpen(): boolean {
		return this.id !== r.R_INVALID_ID && r.Rwindow_is_valid(this.id) !== 0;
	}

	setParent(): void {}

	applyParentAttributes(): void {}

	/** What can change on a window that is open. The other attributes only count when it is made. */
	update<Child>(props: RavenProps<Child>): void {
		const next = resolveProps(props);
		if (this.state === "live" && this.isOpen) {
			this.applyChanges(next);
		}
		this.resolved = next;
	}

	/** Applies what changed in the props. */
	private applyChanges(next: ResolvedProps): void {
		const previous = this.resolved.attributes;
		for (const [name, value] of next.attributes) {
			if (value !== previous.get(name)) {
				SET_ON_OPEN_WINDOW[name]?.(this.id, value);
			}
		}
		const width = next.attributes.get("Width");
		const height = next.attributes.get("Height");
		if (width !== undefined && height !== undefined && (width !== previous.get("Width") || height !== previous.get("Height"))) {
			r.Rwindow_set_size(this.id, Number(width), Number(height));
		}
		for (const [name, value] of next.attributes) {
			if (previous.get(name) !== value && !SET_ON_OPEN_WINDOW[name] && name !== "Width" && name !== "Height") {
				console.warn(`raven-tsx: <Window> ${name} only counts when the window is made`);
			}
		}
		closeEvents.set(this.id, next.handlers.get("OnClose"));
		setWindowEvents(this.id, next.handlers);
	}

	/** The place of its widgets: children are added and removed only once the window is placed. */
	private get open(): WidgetInstance {
		if (!this.content) {
			return RavenError.throw("raven-tsx: a <Window> got a child before it was placed");
		}
		return this.content;
	}

	/** Makes a child the island of this window, if it is one and there is none yet. */
	private takeIsland(child: HostNode): boolean {
		if (child.tag !== "Island" || this.island || !(child instanceof WidgetInstance)) {
			return false;
		}
		child.materialize();
		const set = (widget: r.Rid): void => r.Rwindow_set_island(this.id, widget);
		this.island = child;
		child.setHolder(set);
		set(child.widget);
		return true;
	}

	append(child: HostNode): void {
		if (this.state === "pending") {
			this.appendInitial(child);
			return;
		}
		if (child !== this.island && !this.takeIsland(child)) {
			this.open.append(child);
		}
	}

	appendInitial(child: HostNode): void {
		if (this.state === "live") {
			this.append(child);
		} else {
			this.releaseInitial(child);
			this.initial.push(child);
		}
	}

	/** Takes a child out of those that go in when the window opens. */
	private releaseInitial(child: HostNode): void {
		const index = this.initial.indexOf(child);
		if (index >= 0) {
			this.initial.splice(index, 1);
		}
	}

	release(child: HostNode): void {
		if (this.state !== "live") {
			this.releaseInitial(child);
			return;
		}
		if (child !== this.island) {
			this.open.release(child);
			return;
		}
		this.island = null;
		(child as WidgetInstance).setHolder(null);
		const widget = child.nativeWidget;
		if (this.isOpen && widget !== null && r.Rwidget_is_valid(widget)) {
			// (Rwindow_set_island would delete it: a widget added elsewhere leaves its window alive)
			const holder = r.Rwidget_create_from_xml("<VBox/>");
			r.Rwidget_add_child(holder, widget);
			r.Rwidget_remove_child(holder, widget);
			r.Rwidget_destroy(holder);
		}
	}

	insertBefore(child: HostNode, before: HostNode): void {
		if (this.state === "pending") {
			this.releaseInitial(child);
			const index = this.initial.indexOf(before);
			this.initial.splice(index < 0 ? this.initial.length : index, 0, child);
			return;
		}
		if (child === this.island || this.takeIsland(child)) {
			return;
		}
		// (the island is not among the widgets of the content: nothing can go before it there)
		if (before === this.island) {
			this.open.append(child);
		} else {
			this.open.insertBefore(child, before);
		}
	}

	remove(child: HostNode): void {
		if (this.state === "pending") {
			this.releaseInitial(child);
			// (a child can be live already, moved here: its handlers go before it does)
			child.forgetTree();
			child.dispose();
			return;
		}
		if (child !== this.island) {
			this.open.remove(child);
			return;
		}
		child.forgetTree();
		this.island = null;
		(child as WidgetInstance).setHolder(null);
		if (this.isOpen) {
			// (this deletes it: the window owns it. What it holds of registered tags is theirs)
			(child as WidgetInstance).releaseAdopted();
			r.Rwindow_set_island(this.id, r.R_INVALID_ID);
		}
		child.dispose();
	}

	forgetTree(): void {
		if (this.state !== "live") {
			return;
		}
		this.content?.forgetTree();
		this.island?.forgetTree();
		closeEvents.set(this.id, undefined, false);
		for (const event of Object.values(WINDOW_EVENTS)) {
			event.off(this.id, false);
		}
	}

	dispose(): void {
		const state = this.state;
		this.state = "gone";
		this.opening.clear();
		if (state !== "live") {
			return;
		}
		if (this.isOpen) {
			// (the window destroys what it holds: those of registered tags are theirs)
			this.content?.releaseAdopted();
			this.island?.releaseAdopted();
		}
		this.content?.disposeDetached();
		this.island?.disposeDetached();
		if (this.isOpen) {
			r.Rwindow_destroy(this.id);
		}
	}
}
