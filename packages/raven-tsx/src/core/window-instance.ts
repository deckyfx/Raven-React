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
/** Throws the first of some failures, once all that could run has run. */
function throwFirst(failures: readonly unknown[]): void {
	if (failures.length > 0) {
		throw failures[0];
	}
}

/** Runs a function, and keeps its failure with the others, to go on with what must be done. */
function attempt(failures: unknown[], run: () => void): void {
	try {
		run();
	} catch (error) {
		failures.push(error);
	}
}

/** A function that runs when a window opens, and what it gave to run when it closes. */
interface Opening {
	readonly run: () => (() => void) | void;
	cleanup: (() => void) | null;
}

export class WindowInstance implements HostNode {
	readonly tag = "Window";
	readonly nativeWidget = null;

	get placed(): boolean {
		return this.state === "live" && this.isOpen;
	}
	private id: r.Rid = r.R_INVALID_ID;
	/** Where its widgets go, once it is open. */
	private content: WidgetInstance | null = null;
	/** The children rendered with it, which go in when it opens. */
	private readonly initial: HostNode[] = [];
	/** Its `<Island>`: it floats above the content, as in XML, and the window owns it. */
	private island: WidgetInstance | null = null;
	private state: "pending" | "live" | "closing" | "gone" = "pending";
	/** A dispose asked for while the window closes: done once it is closed. */
	private disposeAsked = false;
	/** Closed because what holds it left the tree (`closeWindows`): `openWindows` opens it again. */
	private hidden = false;
	/** What runs each time the window opens, with what it returned to run when it closes. */
	private readonly opening = new Set<Opening>();
	/** How many times it opened: a cleanup returned for an opening that is over runs at once. */
	private openings = 0;
	/** What the application put in its content itself, kept alive while it is closed. */
	private readonly keptNative: r.Rid[] = [];

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
		this.hidden = false;
		const { window, content } = makeWindow(this.resolved.attributes);
		this.id = window;
		this.content = WidgetInstance.forContainer(content);
		this.state = "live";
		try {
			closeEvents.set(window, this.resolved.handlers.get("OnClose"));
			setWindowEvents(window, this.resolved.handlers);
			for (const widget of this.keptNative.splice(0)) {
				if (r.Rwidget_is_valid(widget)) {
					r.Rwidget_add_child(content, widget);
				}
			}
			// (each child goes in, also past one that fails: then the window goes, with all of them)
			// (one at a time: one that user code released meanwhile is no longer waiting here)
			const failures: unknown[] = [];
			for (let child = this.initial.shift(); child; child = this.initial.shift()) {
				const next = child;
				attempt(failures, () => this.append(next));
			}
			throwFirst(failures);
		} catch (error) {
			this.forgetTree();
			this.dispose();
			throw error;
		}
		this.openings++;
		this.runOpening();
	}

	/** Runs what waits for the window to open, each once: the first that threw says so after. */
	private runOpening(): void {
		// (a failure of one is not a failure of the window, which stays. One cancelled meanwhile, or
		// all once the window is gone, disposed or destroyed in Raven, do not run)
		const failures: unknown[] = [];
		const openings = this.openings;
		for (const opening of [...this.opening]) {
			// (a function that closed the window and opened it again started a pass of its own)
			if (this.openings !== openings) {
				break;
			}
			if (!this.opening.has(opening) || !this.isOpen) {
				continue;
			}
			try {
				this.runOpeningOf(opening);
			} catch (error) {
				failures.push(error);
			}
		}
		throwFirst(failures);
	}

	/**
	 * Runs one function of an opening, and keeps what it returns for the closing. If the function
	 * cancelled itself or closed the window, that opening is over: what it returned runs now.
	 */
	private runOpeningOf(opening: Opening): void {
		const openings = this.openings;
		const cleanup = opening.run() ?? null;
		if (this.opening.has(opening) && this.state === "live" && this.isOpen && this.openings === openings) {
			opening.cleanup = cleanup;
		} else {
			cleanup?.();
		}
	}

	/** Takes the cleanups of the opening that ends, to run once the window is closed. */
	private takeClosing(): (() => void)[] {
		const cleanups: (() => void)[] = [];
		for (const opening of this.opening) {
			if (opening.cleanup) {
				cleanups.push(opening.cleanup);
				opening.cleanup = null;
			}
		}
		return cleanups;
	}

	/**
	 * Runs a function each time the window opens: now if it is open, and again if it is closed and
	 * placed again (`close`). What it returns runs when the window closes. Returns what cancels it,
	 * running that too. A framework's ref gives the window before it opens.
	 */
	whenOpen(run: () => (() => void) | void): () => void {
		if (this.state === "gone") {
			return () => {};
		}
		const opening: Opening = { run, cleanup: null };
		this.opening.add(opening);
		// (a window the user closed, or Raven destroyed, does not open again)
		if (this.state === "live" && this.isOpen) {
			try {
				this.runOpeningOf(opening);
			} catch (error) {
				// (the caller gets no way to cancel it: it is not kept)
				this.opening.delete(opening);
				throw error;
			}
		}
		return () => {
			this.opening.delete(opening);
			const cleanup = opening.cleanup;
			opening.cleanup = null;
			cleanup?.();
		};
	}

	/**
	 * Closes the window and keeps what it holds, alive, to open again when it is placed again: the
	 * same instance, as its `ref` gave it. A framework that takes a window out of its tree, and may
	 * put it back, closes it. (`window` is then another handle)
	 */
	close(): void {
		if (this.state !== "live") {
			return;
		}
		if (!this.isOpen) {
			// (closed by the user, or destroyed in Raven, with what it held: it does not open again)
			this.forgetTree();
			this.dispose();
			return;
		}
		// (while it closes, what user code does to it waits: whenOpen for the next opening, dispose for the end)
		this.state = "closing";
		const failures: unknown[] = [];
		const cleanups = this.takeClosing();
		// (the windows in it close too, kept to open with it)
		attempt(failures, () => this.content?.closeWindows());
		attempt(failures, () => this.island?.closeWindows());
		const children = this.content?.releaseChildren() ?? [];
		const island = this.island;
		if (island) {
			this.detachIsland(island);
		}
		// (what the application put in the content itself stays alive too)
		const content = this.content?.widget ?? r.R_INVALID_ID;
		while (r.Rwidget_is_valid(content) && r.Rwidget_get_child_count(content) > 0) {
			const widget = r.Rwidget_get_child(content, 0);
			r.Rwidget_remove_child(content, widget);
			this.keptNative.push(widget);
		}
		closeEvents.set(this.id, undefined, false);
		for (const event of Object.values(WINDOW_EVENTS)) {
			event.off(this.id, false);
		}
		if (this.isOpen) {
			r.Rwindow_destroy(this.id);
		}
		this.id = r.R_INVALID_ID;
		this.content = null;
		this.state = "pending";
		this.initial.push(...children, ...(island ? [island] : []));
		// (last: a cleanup sees the window closed)
		for (const cleanup of cleanups) {
			attempt(failures, cleanup);
		}
		if (this.disposeAsked) {
			this.disposeAsked = false;
			attempt(failures, () => this.dispose());
		}
		throwFirst(failures);
	}

	/** Whether the window still exists: without an `OnClose`, the user can close it at any time. */
	get isOpen(): boolean {
		return this.id !== r.R_INVALID_ID && r.Rwindow_is_valid(this.id) !== 0;
	}

	setParent(): void {}

	closeWindows(): void {
		if (this.state === "live") {
			this.hidden = true;
			this.close();
		}
	}

	openWindows(): void {
		// (only one closed with its tree: one closed by other code stays closed)
		if (this.hidden) {
			this.materialize();
		}
	}

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
		if (this.state !== "live") {
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
		// (also while it opens: what waits to go in is let go too)
		this.releaseInitial(child);
		if (this.state !== "live") {
			return;
		}
		if (child !== this.island) {
			this.open.release(child);
			return;
		}
		this.detachIsland(child);
	}

	/** Takes the island out of the window, alive. */
	private detachIsland(child: HostNode): void {
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
		if (this.state !== "live") {
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
		if (this.state !== "live") {
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
		if (this.state === "closing") {
			this.disposeAsked = true;
			return;
		}
		const state = this.state;
		const cleanups = state === "live" ? this.takeClosing() : [];
		this.state = "gone";
		this.opening.clear();
		const failures: unknown[] = [];
		if (state !== "live") {
			// (what waited to go in: what a framework placed in it and took back, alive, goes with it)
			for (const child of this.initial.splice(0)) {
				attempt(failures, () => {
					child.forgetTree();
					child.dispose();
				});
			}
			for (const widget of this.keptNative.splice(0)) {
				if (r.Rwidget_is_valid(widget)) {
					r.Rwidget_destroy(widget);
				}
			}
			throwFirst(failures);
			return;
		}
		if (this.isOpen) {
			// (the window destroys what it holds: those of registered tags are theirs)
			this.content?.releaseAdopted();
			this.island?.releaseAdopted();
		}
		attempt(failures, () => this.content?.disposeDetached());
		attempt(failures, () => this.island?.disposeDetached());
		if (this.isOpen) {
			r.Rwindow_destroy(this.id);
		}
		// (last, as for close: a cleanup that closes or disposes the window finds it gone)
		for (const cleanup of cleanups) {
			attempt(failures, cleanup);
		}
		throwFirst(failures);
	}
}
