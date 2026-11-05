import * as r from "./raven";
import { RavenError } from "./errors";
import { applyHandlers, controlledSync, eventScope, forgetHandlers, setVirtualItems, virtualItemsOf } from "./events";
import { CLEARED, resolveProps, type RavenProps, type ResolvedProps, type TreeItem } from "./props";

/** What React's tree is made of: a widget, or a window, which is no widget of its parent. */
export interface HostNode {
	readonly tag: string;
	/** The widget to put in a parent, or null for a window, which stands by itself. */
	readonly nativeWidget: r.Rid | null;
	/** Says who holds it. */
	setParent(parent: WidgetInstance | null): void;
	update(props: RavenProps): void;
	applyParentAttributes(): void;
	append(child: HostNode): void;
	insertBefore(child: HostNode, before: HostNode): void;
	remove(child: HostNode): void;
	/** Forgets the handlers of this node and of everything under it. */
	forgetTree(): void;
	/** Deletes it, after its parent let it go. */
	dispose(): void;
}

/** How to read the value a widget holds by itself, for the attribute that sets it. */
interface ControlledValue {
	readonly attribute: string;
	/** The value of the widget, as the attribute would be written. */
	readonly read: (widget: r.Rid) => string;
	/** Whether the widget already holds a value, when `sameValue` is not the way to tell. */
	readonly same?: (held: string, wanted: string) => boolean;
	/**
	 * The user changes it without an event that says so: it is not set to what it holds, and not
	 * put back either, or the view would jump back at the next event of something else.
	 */
	readonly unreported?: true;
}

const numberText = (value: number): string => String(value);
const twoDigits = (value: number): string => String(value).padStart(2, "0");

const flagText = (value: number): string => (value ? "true" : "false");
/** A text is that text: "1.0" is not "1", which is what makes a number the same as another. */
const sameText = (held: string, wanted: string): boolean => held === wanted;
/** A code of a color, in either case. */
const sameColor = (held: string, wanted: string): boolean => held.toLowerCase() === wanted.toLowerCase();

/**
 * The attributes of what the user changes directly, by tag: the value is held by the widget, so
 * an attribute must not be set to what it already holds. `src/test/coverage.test.ts` says why
 * the other attributes of these tags are not here.
 */
const CONTROLLED: Readonly<Record<string, readonly ControlledValue[]>> = {
	TextInput: [{ attribute: "Text", read: (widget) => r.Rtext_input_get_text(widget) ?? "", same: sameText }],
	TextEditor: [
		{ attribute: "Text", read: (widget) => r.Rtext_editor_get_text(widget) ?? "", same: sameText },
		{ attribute: "Zoom", read: (widget) => numberText(r.Rtext_editor_get_zoom(widget)), unreported: true },
	],
	Checkbox: [{ attribute: "Checked", read: (widget) => flagText(r.Rcheckbox_is_checked(widget)) }],
	Slider: [{ attribute: "Value", read: (widget) => numberText(r.Rslider_get_value(widget)) }],
	SpinBox: [{ attribute: "Value", read: (widget) => numberText(r.Rspin_box_get_value(widget)) }],
	ComboBox: [{ attribute: "Selected", read: (widget) => numberText(r.Rcombo_box_get_selected(widget)) }],
	ListView: [{ attribute: "Selected", read: (widget) => numberText(r.Rlist_view_get_selected(widget)) }],
	TabView: [{ attribute: "ActiveTab", read: (widget) => numberText(r.Rtab_view_get_active(widget)) }],
	Expander: [{ attribute: "Expanded", read: (widget) => flagText(r.Rexpander_is_expanded(widget)) }],
	Island: [{ attribute: "Expanded", read: (widget) => flagText(r.Risland_is_expanded(widget)) }],
	Table: [
		{ attribute: "Selected", read: (widget) => numberText(r.Rtable_get_selected(widget)) },
		{ attribute: "SortColumn", read: (widget) => numberText(r.Rtable_get_sort_column(widget)) },
	],
	Rating: [{ attribute: "Value", read: (widget) => numberText(r.Rrating_get_value(widget)) }],
	Pagination: [{ attribute: "Page", read: (widget) => numberText(r.Rpagination_get_page(widget)) }],
	DatePicker: [{
		attribute: "Date",
		read: (widget) => {
			const [year, month, day] = r.Rdate_picker_get_date(widget);
			return `${year}-${twoDigits(month)}-${twoDigits(day)}`;
		},
	}],
	TimePicker: [{
		attribute: "Time",
		read: (widget) => r.Rtime_picker_get_time(widget).map(twoDigits).join(":"),
		same: (held, wanted) => held === wanted || held === `${wanted}:00`,
	}],
	ColorPicker: [{ attribute: "Color", read: (widget) => r.Rcolor_picker_get_hex(widget) ?? "", same: sameColor }],
	MenuItem: [{ attribute: "Checked", read: (widget) => flagText(r.Rmenu_item_is_checked(widget)) }],
	DockArea: [{ attribute: "Layout", read: (widget) => r.Rdock_area_save_layout(widget) ?? "", same: sameText }],
	Timeline: [
		{ attribute: "Time", read: (widget) => numberText(r.Rtimeline_get_time(widget)) },
		{ attribute: "ViewStart", read: (widget) => numberText(r.Rtimeline_get_view(widget)[0]), unreported: true },
		{ attribute: "ViewEnd", read: (widget) => numberText(r.Rtimeline_get_view(widget)[1]), unreported: true },
	],
	NodeGraph: [
		{ attribute: "CenterX", read: (widget) => numberText(r.Rnode_graph_get_view(widget)[0]), unreported: true },
		{ attribute: "CenterY", read: (widget) => numberText(r.Rnode_graph_get_view(widget)[1]), unreported: true },
		{ attribute: "Zoom", read: (widget) => numberText(r.Rnode_graph_get_view(widget)[2]), unreported: true },
	],
	BlockEditor: [{ attribute: "Zoom", read: (widget) => numberText(r.Rblock_editor_get_view(widget)[2]), unreported: true }],
};

/** The attributes held by the widgets of a tag, for the test of what is covered. */
export const controlledAttributes = (tag: string): readonly string[] => (CONTROLLED[tag] ?? []).map(({ attribute }) => attribute);

/** Fills a TreeView from its `Items`, as text. Its rows are made again: their handles change. */
function fillTree(tree: r.Rid, text: string): void {
	const add = (parent: r.Rid, items: readonly TreeItem[]): void => {
		for (const item of items) {
			const row = r.Rtree_view_add_item(tree, parent, item.Text);
			if (item.Expanded) {
				r.Rtree_item_set_expanded(row, r.R_TRUE);
			}
			add(row, item.Children ?? []);
		}
	};
	r.Rtree_view_clear_items(tree);
	add(r.R_INVALID_ID, text ? (JSON.parse(text) as TreeItem[]) : []);
}

/** The styles of `FontStyle`, of the font of the theme. */
const FONT_STYLES: Readonly<Record<string, r.RFontStyle>> = { Regular: r.R_FONT_REGULAR, Bold: r.R_FONT_BOLD, Italic: r.R_FONT_ITALIC, BoldItalic: r.R_FONT_BOLD_ITALIC };

/** `TextDisabled` as the C API writes it: `TEXT_DISABLED`. */
const constantName = (name: string): string => name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();

/** The roles and metrics an override of a group is for, or undefined: only those can be taken back. */
export function overrideOf(name: string): { readonly role: r.RColorRole } | { readonly metric: r.RMetric } | undefined {
	const [group, key = ""] = name.split(".");
	if (group === "Color") {
		const role = r.RColorRole[`R_COLOR_${constantName(key)}` as keyof typeof r.RColorRole];
		return role === undefined ? undefined : { role };
	}
	if (group === "Metric") {
		const metric = r.RMetric[`R_METRIC_${constantName(key)}` as keyof typeof r.RMetric];
		return metric === undefined ? undefined : { metric };
	}
	return undefined;
}

/** Gives a color or a metric back to what the theme says. */
function clearOverride(widget: r.Rid, name: string): void {
	const override = overrideOf(name);
	if (override && "role" in override) {
		r.Rwidget_clear_color(widget, override.role);
	} else if (override) {
		r.Rwidget_clear_metric(widget, override.metric);
	} else {
		console.warn(`raven-react: ${name} cannot be taken back: leave the prop out instead`);
	}
}

/** The props XML does not take, by tag: they are set by calling Raven. */
const SET_BY_CALL: Readonly<Record<string, Readonly<Record<string, (widget: r.Rid, value: string) => void>>>> = {
	Image: { Texture: (widget, value) => r.Rimage_set_texture(widget, Number(value)) },
	Label: {
		FontStyle: (widget, value) => {
			const style = FONT_STYLES[value];
			if (style !== undefined) {
				r.Rlabel_set_font(widget, r.Rfont_get_variant(r.Rfont_get_default(), style));
			}
		},
	},
	TreeView: { Items: fillTree },
};

/** The prop that holds the elements XML takes inside a widget. It is part of how the widget is made. */
const MARKUP = "Markup";

/** Whether a tag stands outside what holds it: a `Menu` paints as a panel unless a `MenuBar` or a `Menu` holds it. */
const floatsIn = (parent: string, child: string): boolean => child === "Menu" && parent !== "MenuBar" && parent !== "Menu";

/** Whether two values of an attribute are the same. A Slider holds a float: its value comes back rounded. */
function sameValue(held: string, wanted: string): boolean {
	if (held === wanted) {
		return true;
	}
	const a = Number(held);
	const b = Number(wanted);
	return held !== "" && wanted !== "" && !Number.isNaN(a) && !Number.isNaN(b) && Math.abs(a - b) < 1e-5;
}

/**
 * A widget under React, and what a `ref` receives. Raven's handle is here with what the
 * renderer must remember: the tree, because Raven has no way to ask where a child is, and
 * the last props.
 */
export class WidgetInstance implements HostNode {
	private readonly children: HostNode[] = [];
	private parent: WidgetInstance | null = null;
	/** Told of a new handle when what holds it is not a parent: the island of a window. */
	private holder: ((widget: r.Rid) => void) | null = null;
	private resolved: ResolvedProps = { attributes: new Map(), handlers: new Map() };
	/** How many children the widget had when it was made: those of its markup come first. */
	private madeChildren = 0;

	private constructor(
		private id: r.Rid,
		readonly tag: string,
	) {}

	/** A new widget of a tag, with its props but those that need a parent. */
	static create(tag: string, props: RavenProps): WidgetInstance {
		const resolved = resolveProps(props);
		const instance = new WidgetInstance(WidgetInstance.make(tag, resolved.attributes.get(MARKUP)), tag);
		instance.madeChildren = r.Rwidget_get_child_count(instance.id);
		instance.applyAll(resolved);
		return instance;
	}

	/** An instance for a widget React does not own: the top of a root. */
	static forContainer(id: r.Rid): WidgetInstance {
		return new WidgetInstance(id, "");
	}

	/** Makes the widget of a tag in Raven. */
	private static make(tag: string, markup = ""): r.Rid {
		const id = r.Rwidget_create_from_xml(`<${tag}>${markup}</${tag}>`);
		if (id === r.R_INVALID_ID) {
			RavenError.fromLibrary(`Raven cannot make <${tag}>`);
		}
		return id;
	}

	/**
	 * Raven's handle of the widget, for the functions of the `raven` export. Read it when you
	 * need it and do not keep it: it changes if the widget has to be made again.
	 */
	get widget(): r.Rid {
		return this.id;
	}

	/** Gives the widget the keyboard. */
	focus(): void {
		r.Rwidget_focus(this.id);
	}

	get nativeWidget(): r.Rid {
		return this.id;
	}

	/**
	 * Opens a `<Menu>` that stands by itself as a popup, at a position of its window. A right click
	 * gives that position: `OnContext` of a TreeView or a TileView, in the window.
	 */
	open(x: number, y: number): void {
		let holder = this.parent;
		while (holder && holder.id === r.R_INVALID_ID) {
			holder = holder.parent;
		}
		const window = holder ? r.Rwidget_get_window(holder.id) : r.R_INVALID_ID;
		if (this.tag !== "Menu" || window === r.R_INVALID_ID) {
			RavenError.throw(`raven-react: only a <Menu> in a window opens, and this is a <${this.tag}>`);
		}
		r.Rmenu_open(this.id, window, x, y);
	}

	setParent(parent: WidgetInstance | null): void {
		this.parent = parent;
	}

	/** Says who to tell of a new handle, when what holds this widget is not a parent. */
	setHolder(holder: ((widget: r.Rid) => void) | null): void {
		this.holder = holder;
	}

	/** Whether a child is one of the widgets of this one: a window or a menu in the tree is not. */
	private holds(child: HostNode): boolean {
		return child.nativeWidget !== null && !floatsIn(this.tag, child.tag);
	}

	/** Whether an attribute is about the place of the widget in its parent: `Slot.Padding`. */
	private static belongsToParent(name: string): boolean {
		return name.startsWith("Slot.");
	}

	/**
	 * A list of items is emptied when it gets new ones, with the row it had selected: `Selected`,
	 * which did not change, comes back. This is also for a `Selected` that comes before `Items`.
	 */
	private restoreSelected(): void {
		const selected = this.resolved.attributes.get("Selected");
		if (selected !== undefined && this.resolved.attributes.has("Items") && CONTROLLED[this.tag]) {
			this.setAttribute("Selected", selected);
		}
	}

	/** Sets one attribute. What the types let through and Raven refuses is said, not lost. */
	private setAttribute(name: string, value: string): void {
		if (name === virtualItemsOf(this.tag)?.count || name === MARKUP) {
			return;
		}
		if (value === CLEARED) {
			clearOverride(this.id, name);
			return;
		}
		const controlled = CONTROLLED[this.tag]?.find(({ attribute }) => attribute === name);
		if (controlled && (controlled.same ?? sameValue)(controlled.read(this.id), value)) {
			return;
		}
		eventScope.ignoringEvents(() => {
			const call = SET_BY_CALL[this.tag]?.[name];
			if (call) {
				call(this.id, value);
			} else if (!r.Rwidget_set_attribute(this.id, name, value)) {
				console.warn(`raven-react: <${this.tag}> did not take ${name}="${value}"`);
			}
		});
	}

	/**
	 * Gives a new widget all its props. That includes those of its place in a parent, which Raven
	 * only keeps until there is one: a DockArea places a child when it receives it, from `Slot.Dock`
	 * and the others, so they cannot wait until it has been added. `applyParentAttributes` then
	 * gives them again, which tells the parent, that already took its child, to look at them.
	 */
	private applyAll(next: ResolvedProps): void {
		for (const [name, value] of next.attributes) {
			this.setAttribute(name, value);
		}
		applyHandlers(this.tag, this.id, new Map(), next.handlers);
		this.applyVirtualItems(null, next);
		this.resolved = next;
		this.restoreSelected();
		this.watchControlled();
	}

	/** Gives a list its items when their number or their function changed, and shows them. */
	private applyVirtualItems(previous: ResolvedProps | null, next: ResolvedProps): void {
		const virtual = virtualItemsOf(this.tag);
		const handler = virtual ? next.handlers.get(virtual.prop) : undefined;
		if (!virtual || !handler) {
			return;
		}
		const count = next.attributes.get(virtual.count);
		const before = previous?.handlers.get(virtual.prop);
		if (before === handler && previous?.attributes.get(virtual.count) === count) {
			return;
		}
		setVirtualItems(this.tag, this.id, Number(count ?? 0), handler);
		if (before) {
			r.Rwidget_invalidate(this.id);
		}
	}

	/** After an event, puts back what the props say if a handler refused the change. */
	private watchControlled(): void {
		const controlled = CONTROLLED[this.tag];
		if (!controlled) {
			return;
		}
		controlledSync.set(this.id, () => {
			for (const { attribute, unreported } of controlled) {
				const wanted = this.resolved.attributes.get(attribute);
				if (wanted !== undefined && !unreported) {
					this.setAttribute(attribute, wanted);
				}
			}
		});
	}

	/** Sets the attributes that need a parent, once there is one. */
	applyParentAttributes(): void {
		for (const [name, value] of this.resolved.attributes) {
			if (WidgetInstance.belongsToParent(name)) {
				this.setAttribute(name, value);
			}
		}
	}

	/** Goes from the last props to new ones, setting only what changed. */
	update(props: RavenProps): void {
		// (its window can be gone already: closed by the user, with no OnClose to ask first)
		if (!r.Rwidget_is_valid(this.id)) {
			return;
		}
		const next = resolveProps(props);
		const previous = this.resolved;
		// Raven has no way to give an attribute its default back, and no way to read it:
		// a widget that loses an attribute is made again, from the attributes that are left.
		// (so is one whose markup changed, which only counts when it is made)
		if ([...previous.attributes.keys()].some((name) => !next.attributes.has(name)) || previous.attributes.get(MARKUP) !== next.attributes.get(MARKUP)) {
			this.remake(next);
			return;
		}
		for (const [name, value] of next.attributes) {
			if (previous.attributes.get(name) !== value) {
				this.setAttribute(name, value);
			}
		}
		applyHandlers(this.tag, this.id, previous.handlers, next.handlers);
		this.applyVirtualItems(previous, next);
		if (next.handlers.get("OnPaint") !== previous.handlers.get("OnPaint")) {
			r.Rwidget_invalidate(this.id);
		}
		this.resolved = next;
		if (previous.attributes.get("Items") !== next.attributes.get("Items")) {
			this.restoreSelected();
		}
	}

	/**
	 * Replaces the widget by a new one in the same place, with the same children: those React does
	 * not know of too, added by the application. What a new widget holds by itself stays with it.
	 * If the new one cannot take the props, the old one stays as it was, and React hears of it.
	 */
	private remake(next: ResolvedProps): void {
		const old = this.id;
		const previous = this.resolved;
		const parent = this.parent;
		const placed = parent?.holds(this) === true;
		const index = placed ? parent.nativeIndexOf(this, true) : -1;
		this.id = WidgetInstance.make(this.tag, next.attributes.get(MARKUP));
		const madeChildren = r.Rwidget_get_child_count(this.id);
		try {
			this.applyAll(next);
		} catch (error) {
			forgetHandlers(this.tag, this.id, true);
			r.Rwidget_destroy(this.id);
			this.id = old;
			this.resolved = previous;
			throw error;
		}
		forgetHandlers(this.tag, old, true);
		// What Raven made in the old widget: as many as in the new one, but for a markup that changed.
		const own = r.Rwidget_get_child_count(this.id) + this.madeChildren - madeChildren;
		this.madeChildren = madeChildren;
		const moving = Array.from({ length: Math.max(r.Rwidget_get_child_count(old) - own, 0) }, (_, position) => r.Rwidget_get_child(old, own + position));
		for (const child of moving) {
			r.Rwidget_remove_child(old, child);
			r.Rwidget_add_child(this.id, child);
		}
		if (placed) {
			r.Rwidget_remove_child(parent.id, old);
			r.Rwidget_insert_child(parent.id, this.id, index);
		}
		this.holder?.(this.id);
		if (r.Rwidget_is_valid(old)) {
			r.Rwidget_destroy(old);
		}
		this.applyParentAttributes();
	}

	/**
	 * Where a child goes among the widgets of this one. Those React knows are enough, unless the
	 * application added others: then it is just before the next child React knows.
	 * `attached` says whether Raven already has the child, so that it counts among what Raven holds.
	 */
	private nativeIndexOf(child: HostNode, attached: boolean): number {
		const held = this.children.filter((other) => this.holds(other));
		const index = held.indexOf(child);
		const count = r.Rwidget_get_child_count(this.id);
		if (count <= (attached ? held.length : held.length - 1)) {
			return index;
		}
		const positionOf = (widget: r.Rid | null): number => {
			for (let position = 0; position < count; position++) {
				if (r.Rwidget_get_child(this.id, position) === widget) {
					return position;
				}
			}
			return -1;
		};
		const here = positionOf(child.nativeWidget);
		if (here >= 0) {
			return here;
		}
		const next = positionOf(held[index + 1]?.nativeWidget ?? null);
		return next >= 0 ? next : count;
	}

	/** Makes sure a widget has a widget to go in: the top of a root of windows has none. */
	private checkHolds(child: HostNode): void {
		if (this.holds(child) && this.id === r.R_INVALID_ID) {
			RavenError.throw(`raven-react: <${child.tag}> must be inside a <Window>`);
		}
	}

	/** Adds a child at the end. A child already here moves to the end. */
	append(child: HostNode): void {
		this.checkHolds(child);
		this.detach(child);
		this.children.push(child);
		child.setParent(this);
		if (this.holds(child)) {
			r.Rwidget_add_child(this.id, child.nativeWidget as r.Rid);
		}
	}

	/** Puts a child before another one. A child already here moves. */
	insertBefore(child: HostNode, before: HostNode): void {
		this.checkHolds(child);
		this.detach(child);
		const index = this.children.indexOf(before);
		if (index < 0) {
			RavenError.throw(`raven-react: <${before.tag}> is not a child of <${this.tag}>`);
		}
		this.children.splice(index, 0, child);
		child.setParent(this);
		if (this.holds(child)) {
			r.Rwidget_insert_child(this.id, child.nativeWidget as r.Rid, this.nativeIndexOf(child, false));
		}
	}

	/** Takes a child out without deleting it. */
	private detach(child: HostNode): void {
		const index = this.children.indexOf(child);
		if (index >= 0) {
			this.children.splice(index, 1);
			if (this.holds(child)) {
				r.Rwidget_remove_child(this.id, child.nativeWidget as r.Rid);
			}
		}
	}

	/** Removes a child and deletes it with everything under it. */
	remove(child: HostNode): void {
		child.forgetTree();
		// (the window may be gone already, closed by the user, with its widgets)
		if (this.holds(child) && r.Rwidget_is_valid(child.nativeWidget as r.Rid)) {
			r.Rwidget_remove_child(this.id, child.nativeWidget as r.Rid);
		}
		const index = this.children.indexOf(child);
		if (index >= 0) {
			this.children.splice(index, 1);
		}
		child.setParent(null);
		child.dispose();
	}

	forgetTree(): void {
		for (const child of this.children) {
			child.forgetTree();
		}
		forgetHandlers(this.tag, this.id, false);
	}

	/** Deletes what is in this tree without being a widget of it: deleting a widget does not reach those. */
	disposeDetached(): void {
		for (const child of this.children) {
			if (!this.holds(child)) {
				child.dispose();
			} else if (child instanceof WidgetInstance) {
				child.disposeDetached();
			}
		}
	}

	dispose(): void {
		this.disposeDetached();
		if (r.Rwidget_is_valid(this.id)) {
			r.Rwidget_destroy(this.id);
		}
	}
}
