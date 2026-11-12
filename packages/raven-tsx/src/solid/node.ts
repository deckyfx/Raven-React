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
		return new SolidNode("", WidgetInstance.forContainer(widget), null, false);
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
		if (!this.host || this.destroyed) {
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

	/** Text beside widgets is an error, as with React: said before anything changes, whichever comes first. */
	private checkMixed(child: SolidNode): void {
		const others = this.children.filter((node) => node !== child);
		const text = child.isText ? (child.text !== "" && others.some((node) => !node.isText) ? child.text : null) : (others.find((node) => node.isText && node.text !== "")?.text ?? null);
		if (text !== null) {
			RavenError.throw(`raven-tsx: text must be alone in a widget: "${text}"`);
		}
	}

	/** Places a child before another one, or at the end. A child already in a tree moves. */
	insert(child: SolidNode, before: SolidNode | null): void {
		this.checkMixed(child);
		if (child.parent && child.parent !== this) {
			// (a move: the child stays alive on the way, whatever its owner)
			child.parent.detach(child);
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
		const next = this.children.slice(this.children.indexOf(child) + 1).find((node) => !node.isText);
		const host = this.instance;
		if (next) {
			host.insertBefore(child.instance, next.instance);
		} else {
			host.append(child.instance);
		}
		// (what was made now has its parent: the attributes of its place go to it)
		finishPlacing();
	}

	/** Takes a child out, alive, wherever it goes next. */
	private detach(child: SolidNode): void {
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
		}
	}

	/** Takes a child out of the tree. It stays alive while what made it in Solid is there, and goes after. */
	release(child: SolidNode): void {
		if (this.children.includes(child)) {
			this.detach(child);
			if (child.ownerGone) {
				child.destroy();
			}
		}
	}

	/** Takes every child out, each going or staying as its owner says: a portal that goes. */
	releaseAll(): void {
		for (const child of [...this.children]) {
			this.release(child);
		}
	}

	/** Takes every child out and deletes them: the end of a tree, after its owners are gone. */
	clear(): void {
		for (const child of [...this.children]) {
			child.ownerGone = true;
			this.release(child);
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
		this.host.forgetTree();
		this.host.dispose();
	}
}
