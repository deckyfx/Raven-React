import * as r from "./raven";
import { RavenError } from "./errors";
import { closeEvents } from "./events";
import { escapeXml, resolveProps, type RavenProps, type ResolvedProps } from "./props";
import { WidgetInstance, type HostNode } from "./widget-instance";

/** Where the widgets of a window go. Its size is the size of the window. */
export const CONTENT_NAME = "raven-react.content";

/** Makes a window from attributes, with a place for widgets. */
export function makeWindow(attributes: ReadonlyMap<string, string>): { window: r.Rid; content: r.Rid } {
	const text = [...attributes].map(([name, value]) => `${name}="${escapeXml(value)}"`).join(" ");
	const window = r.Rwindow_create_from_xml(`<Window ${text}><VBox Name="${CONTENT_NAME}"/></Window>`);
	if (window === r.R_INVALID_ID) {
		RavenError.fromLibrary("Raven cannot make the window");
	}
	return { window, content: r.Rwidget_find(window, CONTENT_NAME) };
}

/**
 * A `<Window>` under React, and what a `ref` receives. It holds widgets but stands by itself:
 * it can be anywhere in the tree, and goes away when its element does.
 */
export class WindowInstance implements HostNode {
	readonly tag = "Window";
	readonly nativeWidget = null;
	private readonly content: WidgetInstance;

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
		const title = next.attributes.get("Title");
		if (title !== undefined && title !== previous.get("Title")) {
			r.Rwindow_set_title(this.window, title);
		}
		const theme = next.attributes.get("Theme");
		if (theme !== undefined && theme !== previous.get("Theme")) {
			r.Rwindow_set_theme(this.window, theme);
		}
		const width = next.attributes.get("Width");
		const height = next.attributes.get("Height");
		if (width !== undefined && height !== undefined && (width !== previous.get("Width") || height !== previous.get("Height"))) {
			r.Rwindow_set_size(this.window, Number(width), Number(height));
		}
		for (const [name, value] of next.attributes) {
			if (previous.get(name) !== value && !["Title", "Theme", "Width", "Height"].includes(name)) {
				console.warn(`raven-react: <Window> ${name} only counts when the window is made`);
			}
		}
		closeEvents.set(this.window, next.handlers.get("OnClose"));
	}

	append(child: HostNode): void {
		this.content.append(child);
	}

	insertBefore(child: HostNode, before: HostNode): void {
		this.content.insertBefore(child, before);
	}

	remove(child: HostNode): void {
		this.content.remove(child);
	}

	forgetTree(): void {
		this.content.forgetTree();
		closeEvents.set(this.window, undefined, false);
	}

	dispose(): void {
		if (this.isOpen) {
			r.Rwindow_destroy(this.window);
		}
	}
}
