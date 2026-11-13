/**
 * What Solid's renderer works on: an element over a node of the core (a widget, a window), or a
 * text its parent shows as `Text`. Solid makes a node first and gives it props one by one, before
 * and after it is placed; the core gets them all each time, as it does from React.
 */

import { getOwner, onCleanup } from "solid-js";
import { RavenError } from "../core/errors";
import type * as r from "../core/raven";
import type { RavenProps } from "../core/props";
import { finishPlacing, WidgetInstance, type HostNode } from "../core/widget-instance";
import { WindowInstance } from "../core/window-instance";

/** The props of a widget under Solid. Its children are the nodes, not a prop. */
type SolidProps = Record<string, unknown>;

/** A `<Separator>` in a `<Menu>`: a line of the menu, as in XML, which is an item there and no widget of its own. */
const menuSeparator = (props: SolidProps): SolidProps => ({ ...(props["Name"] === undefined ? {} : { Name: props["Name"] }), Separator: true });

export class SolidNode {
	parent: SolidNode | null = null;
	readonly children: SolidNode[] = [];
	private readonly props: SolidProps = {};
	/**
	 * Whether what made it in Solid is gone. Until then, a node taken out of the tree stays alive:
	 * Solid may place it again (`<Show>` of an element kept in a variable). After, it goes when out.
	 */
	private ownerGone: boolean;
	private destroyed = false;
	/** The top of a tree: its widget is the application's, which a tree never changes. */
	private isContainer = false;
	/** A child that waits for the node it replaces to go: see `insert`. */
	private held: { readonly child: SolidNode; readonly before: SolidNode } | null = null;
	/** What waits for the node of the core: the `ref` of a `<Separator>` not placed yet. */
	private readonly waiting: ((instance: HostNode) => void)[] = [];

	private constructor(
		readonly tag: string,
		private host: HostNode | null,
		/** The text of a text node; null for an element. */
		public text: string | null,
		/** Whether Solid owns it: the top of a tree is the application's, and stays when Solid's owner goes. */
		owned = true,
	) {
		const owner = owned ? getOwner() : null;
		this.ownerGone = owned && owner === null;
		if (owner) {
			onCleanup(() => this.leaveOwner());
		}
	}

	/** An element of a tag. A `<Separator>` waits for its parent: in a `<Menu>`, it is a line of the menu. */
	static element(tag: string): SolidNode {
		const host = tag === "Separator" ? null : tag === "Window" ? WindowInstance.create({}) : WidgetInstance.create(tag, {});
		return new SolidNode(tag, host, null);
	}

	static text(value: string): SolidNode {
		return new SolidNode("", null, value);
	}

	/** The top of a tree: a widget the application owns, or nothing, for a tree of windows. */
	static container(widget: r.Rid): SolidNode {
		const node = new SolidNode("", WidgetInstance.forContainer(widget), null, false);
		node.isContainer = true;
		return node;
	}

	/** A widget Raven made, a child of a registered tag in XML, which is only placed: see `WidgetInstance.adopt`. */
	static adopted(widget: r.Rid): SolidNode {
		return new SolidNode("", WidgetInstance.adopt(widget), null);
	}

	get isText(): boolean {
		return this.text !== null;
	}

	/** The node of the core. A `<Separator>` gets it when it is placed: in a `<Menu>`, a line of the menu. */
	private get instance(): HostNode {
		if (!this.host) {
			const inMenu = this.parent?.tag === "Menu";
			const host = inMenu ? WidgetInstance.create("MenuItem", menuSeparator(this.props)) : WidgetInstance.create(this.tag, this.props);
			this.host = host;
			for (const run of this.waiting.splice(0)) {
				run(host);
			}
		}
		return this.host;
	}

	/** Gives the node of the core to a function: now, or once it exists (a `<Separator>`, when it is placed). */
	withInstance(run: (instance: HostNode) => void): void {
		if (this.host) {
			run(this.host);
		} else {
			this.waiting.push(run);
		}
	}

	/** Sets a prop, or takes it away with `undefined`. */
	setProp(name: string, value: unknown): void {
		if (value === undefined) {
			delete this.props[name];
		} else {
			this.props[name] = value;
		}
		this.refresh();
	}

	/** Gives the node of the core all the props, with the text of the children. */
	refresh(): void {
		// (the widget of a container is not the tree's: nothing of its props is set)
		if (!this.host || this.destroyed || this.isContainer) {
			return;
		}
		const props = this.host.tag === "MenuItem" && this.tag === "Separator" ? menuSeparator(this.props) : this.props;
		this.host.update({ ...props, ...this.textChildren() } as RavenProps<string>);
	}

	/**
	 * The text of the children, as React gives it: text alone in a widget is its `Text`. Solid
	 * places an empty text where a condition shows nothing: that is no text beside widgets.
	 */
	private textChildren(): { readonly children?: readonly string[] } {
		const texts = this.children.filter((child) => child.isText);
		if (texts.length === 0) {
			return {};
		}
		if (texts.length < this.children.length) {
			const shown = texts.find((child) => child.text !== "");
			if (shown) {
				RavenError.throw(`raven-tsx: text must be alone in a widget: "${shown.text}"`);
			}
			return {};
		}
		return { children: texts.map((child) => child.text ?? "") };
	}

	/** Changes the text of a text node, which its parent shows as `Text`. Refused text changes nothing. */
	setText(value: string): void {
		const siblings = this.parent?.children ?? [];
		if (value !== "" && this.parent?.isContainer) {
			RavenError.throw(`raven-tsx: text must be in a widget: "${value}"`);
		}
		if (value !== "" && siblings.some((node) => !node.isText)) {
			RavenError.throw(`raven-tsx: text must be alone in a widget: "${value}"`);
		}
		this.text = value;
		this.parent?.refresh();
	}

	/** Gives the Text again when widgets came or went beside an empty text: see `textChildren`. */
	private refreshTextOf(): void {
		if (this.children.some((node) => node.isText)) {
			this.refresh();
		}
	}

	/** What conflicts with a child here: the widgets beside a text, or the texts beside a widget. */
	private conflictsOf(child: SolidNode): SolidNode[] {
		const others = this.children.filter((node) => node !== child);
		if (child.isText) {
			return child.text !== "" ? others.filter((node) => !node.isText) : [];
		}
		return others.filter((node) => node.isText && node.text !== "");
	}

	/** Text beside widgets is an error, as with React: said before anything changes, whichever comes first. */
	private checkMixed(child: SolidNode): void {
		// (as with React: text at the top of a tree, in a root or a portal, has no widget to be the Text of)
		if (this.isContainer && child.isText && child.text !== "") {
			RavenError.throw(`raven-tsx: text must be in a widget: "${child.text}"`);
		}
		const others = this.children.filter((node) => node !== child);
		const text = child.isText ? (child.text !== "" && others.some((node) => !node.isText) ? child.text : null) : (others.find((node) => node.isText && node.text !== "")?.text ?? null);
		if (text !== null) {
			RavenError.throw(`raven-tsx: text must be alone in a widget: "${text}"`);
		}
	}

	/** Places a child before another one, or at the end. A child already in a tree moves. */
	insert(child: SolidNode, before: SolidNode | null): void {
		if (child === before) {
			return;
		}
		this.placeHeld();
		// (Solid replaces a node by putting the new one before it, then taking it away: a widget in
		// place of a text, `{busy() ? <Spinner /> : "Save"}`. Side by side they would be refused: the
		// new one waits for that, see `release`. Anything else first places it as it is, refused or not)
		if (before && !this.isContainer && this.children.includes(before)) {
			const conflicts = this.conflictsOf(child);
			if (conflicts.length === 1 && conflicts[0] === before) {
				this.held = { child, before };
				queueMicrotask(() => this.placeHeldLater());
				return;
			}
		}
		this.place(child, before);
	}

	/** Places a child that waited for the node it replaces to go, as it is: one beside text is refused. */
	private placeHeld(): void {
		const held = this.held;
		if (!held) {
			return;
		}
		this.held = null;
		this.place(held.child, this.children.includes(held.before) ? held.before : null);
	}

	/** Places a child still waiting at the end of the task: Solid replaces in one go, so it was no replacement. */
	private placeHeldLater(): void {
		if (this.destroyed) {
			this.held = null;
			return;
		}
		try {
			this.placeHeld();
		} catch (error) {
			console.error("raven-tsx:", error);
		}
	}

	/** Places a child, as `insert` does, with no waiting. */
	private place(child: SolidNode, before: SolidNode | null): void {
		this.checkMixed(child);
		const moved = child.parent !== null && child.parent !== this;
		if (child.parent && moved) {
			// (a move: the child stays alive on the way, whatever its owner, and its windows open)
			child.parent.detach(child, false);
		}
		const current = this.children.indexOf(child);
		if (current >= 0) {
			this.children.splice(current, 1);
		}
		const index = before ? this.children.indexOf(before) : -1;
		this.children.splice(index < 0 ? this.children.length : index, 0, child);
		child.parent = this;
		if (child.isText) {
			this.refresh();
			return;
		}
		const host = this.instance;
		try {
			// (making a `<Separator>` runs its ref, which may throw, or take the child away, or delete
			// it or this, or put others beside it: what comes after it is read after)
			const childHost = child.instance;
			if (child.parent !== this || child.destroyed || this.destroyed) {
				return;
			}
			const next = this.children.slice(this.children.indexOf(child) + 1).find((node) => !node.isText);
			const beforeHost = next?.instance;
			if (beforeHost) {
				host.insertBefore(childHost, beforeHost);
			} else {
				host.append(childHost);
			}
		} catch (error) {
			// (user code that ran meanwhile placed it elsewhere: it is that parent's, as it is)
			if (child.parent !== this) {
				throw error;
			}
			// (it is not in this tree: nor in the core, which keeps one placed with a failure, a window
			// open whose function threw. It closes there, and goes if nothing in Solid owns it)
			const index = this.children.indexOf(child);
			if (index >= 0) {
				this.children.splice(index, 1);
			}
			child.parent = null;
			try {
				if (child.host) {
					host.release(child.host);
					child.host.closeWindows();
				}
			} catch (cleanup) {
				console.error("raven-tsx: cleaning up a child that failed:", cleanup);
			} finally {
				// (also when closing it threw: nothing else would delete one that no owner keeps)
				if (child.ownerGone && child.parent === null) {
					try {
						child.destroy();
					} catch (cleanup) {
						console.error("raven-tsx: cleaning up a child that failed:", cleanup);
					}
				}
			}
			throw error;
		}
		// (moved to a parent not placed: its windows close, to open with it)
		if (moved && !host.placed) {
			child.host?.closeWindows();
		}
		// (an empty text beside widgets is no Text, and alone it is: the Text follows what is here)
		this.refreshTextOf();
		// (what was made now has its parent: the attributes of its place go to it)
		finishPlacing();
	}

	/** Takes a child out, alive, wherever it goes next. Its windows close, unless it moves to another place now. */
	private detach(child: SolidNode, closing = true): void {
		const index = this.children.indexOf(child);
		if (index < 0) {
			return;
		}
		this.children.splice(index, 1);
		child.parent = null;
		if (child.isText) {
			this.refresh();
		} else if (child.host) {
			this.instance.release(child.host);
			this.refreshTextOf();
			// (a window is no widget of its parent: out of the tree, it closes, and those it holds, to open when placed again)
			if (closing) {
				child.host.closeWindows();
			}
		}
	}

	/** Takes a child out of the tree. It stays alive while what made it in Solid is there, and goes after. */
	release(child: SolidNode): void {
		// (the node a waiting child replaces goes: the child takes its place)
		if (this.held?.before === child) {
			const replacement = this.held.child;
			this.held = null;
			const after = this.children[this.children.indexOf(child) + 1] ?? null;
			this.releaseNow(child);
			this.place(replacement, after && this.children.includes(after) ? after : null);
			return;
		}
		this.placeHeld();
		this.releaseNow(child);
	}

	/** Takes a child out of the tree, as `release` does. */
	private releaseNow(child: SolidNode): void {
		if (!this.children.includes(child)) {
			return;
		}
		try {
			this.detach(child);
		} finally {
			// (also when closing its windows threw: it is out of the tree. Unless a cleanup of its
			// windows placed it elsewhere: it is that parent's now)
			if (child.ownerGone && child.parent === null) {
				child.destroy();
			}
		}
	}

	/** Takes every child out, each going or staying as its owner says: a portal that goes. */
	releaseAll(): void {
		this.releaseEach(false);
	}

	/** Takes every child out and deletes them: the end of a tree, after its owners are gone. */
	clear(): void {
		this.releaseEach(true);
	}

	/** Takes every child out, all of them, and then says the first failure. */
	private releaseEach(deleting: boolean): void {
		// (a child waiting to replace another is not placed: its owner deletes it)
		this.held = null;
		const failures: unknown[] = [];
		for (const child of [...this.children]) {
			try {
				// (one that a cleanup moved to another parent meanwhile is that one's, owner and all)
				if (deleting && child.parent === this) {
					child.ownerGone = true;
				}
				this.release(child);
			} catch (error) {
				failures.push(error);
			}
		}
		if (failures.length > 0) {
			throw failures[0];
		}
	}

	/** What made it in Solid is gone: it goes now, unless it is still in a tree, which deletes it with itself. */
	private leaveOwner(): void {
		this.ownerGone = true;
		if (!this.parent) {
			this.destroy();
		}
	}

	/** Deletes it in Raven, with what it holds. */
	private destroy(): void {
		if (this.destroyed || !this.host) {
			this.destroyed = true;
			return;
		}
		this.destroyed = true;
		const host = this.host;
		try {
			// (a child whose owner is still there leaves alive: it may be shown again; the others go)
			this.releaseAll();
		} finally {
			host.forgetTree();
			host.dispose();
		}
	}
}
