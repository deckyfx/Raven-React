import * as r from "./raven";
import { RavenError } from "./errors";
import { applyHandlers, controlledSync, eventScope, forgetHandlers } from "./events";
import { resolveProps, type RavenProps, type ResolvedProps } from "./props";

/** How to read the value a widget holds by itself, for the attribute that sets it. */
interface ControlledValue {
	readonly attribute: string;
	/** The value of the widget, as the attribute would be written. */
	readonly read: (widget: r.Rid) => string;
}

const numberText = (value: number): string => String(value);

/** The widgets the user changes directly. Their attribute must not be set to what they already hold. */
const CONTROLLED: Readonly<Record<string, ControlledValue>> = {
	TextInput: { attribute: "Text", read: (widget) => r.Rtext_input_get_text(widget) ?? "" },
	Checkbox: { attribute: "Checked", read: (widget) => (r.Rcheckbox_is_checked(widget) ? "true" : "false") },
	Slider: { attribute: "Value", read: (widget) => numberText(r.Rslider_get_value(widget)) },
	SpinBox: { attribute: "Value", read: (widget) => numberText(r.Rspin_box_get_value(widget)) },
	ComboBox: { attribute: "Selected", read: (widget) => numberText(r.Rcombo_box_get_selected(widget)) },
	TabView: { attribute: "ActiveTab", read: (widget) => numberText(r.Rtab_view_get_active(widget)) },
	Expander: { attribute: "Expanded", read: (widget) => (r.Rexpander_is_expanded(widget) ? "true" : "false") },
};

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
 * A widget under React. Raven's handle is here with what the renderer must remember:
 * the tree, because Raven has no way to ask where a child is, and the last props.
 */
export class WidgetInstance {
	private readonly children: WidgetInstance[] = [];
	private parent: WidgetInstance | null = null;
	private resolved: ResolvedProps = { attributes: new Map(), handlers: new Map() };

	private constructor(
		private id: r.Rid,
		readonly tag: string,
	) {}

	/** A new widget of a tag, with its props but those that need a parent. */
	static create(tag: string, props: RavenProps): WidgetInstance {
		const instance = new WidgetInstance(WidgetInstance.make(tag), tag);
		instance.applyAll(resolveProps(props));
		return instance;
	}

	/** An instance for a widget React does not own: the top of a root. */
	static forContainer(id: r.Rid): WidgetInstance {
		return new WidgetInstance(id, "");
	}

	/** Makes the widget of a tag in Raven. */
	private static make(tag: string): r.Rid {
		const id = r.Rwidget_create_from_xml(`<${tag}/>`);
		if (id === r.R_INVALID_ID) {
			RavenError.fromLibrary(`Raven cannot make <${tag}>`);
		}
		return id;
	}

	/** Raven's handle of the widget. It changes if the widget has to be made again. */
	get widget(): r.Rid {
		return this.id;
	}

	/** Whether an attribute needs the widget to have its parent: `Slot.Padding` belongs to the parent's layout. */
	private static belongsToParent(name: string): boolean {
		return name.startsWith("Slot.");
	}

	/** Sets one attribute. What the types let through and Raven refuses is said, not lost. */
	private setAttribute(name: string, value: string): void {
		const controlled = CONTROLLED[this.tag];
		if (controlled?.attribute === name && sameValue(controlled.read(this.id), value)) {
			return;
		}
		eventScope.ignoringEvents(() => {
			if (!r.Rwidget_set_attribute(this.id, name, value)) {
				console.warn(`raven-react: <${this.tag}> did not take ${name}="${value}"`);
			}
		});
	}

	/** Gives a new widget all its props but those that need a parent. */
	private applyAll(next: ResolvedProps): void {
		for (const [name, value] of next.attributes) {
			if (!WidgetInstance.belongsToParent(name)) {
				this.setAttribute(name, value);
			}
		}
		applyHandlers(this.tag, this.id, new Map(), next.handlers);
		this.resolved = next;
		this.watchControlled();
	}

	/** After an event, puts back what the props say if a handler refused the change. */
	private watchControlled(): void {
		const controlled = CONTROLLED[this.tag];
		if (!controlled) {
			return;
		}
		controlledSync.set(this.id, () => {
			const wanted = this.resolved.attributes.get(controlled.attribute);
			if (wanted !== undefined) {
				this.setAttribute(controlled.attribute, wanted);
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
		const next = resolveProps(props);
		const previous = this.resolved;
		// Raven has no way to give an attribute its default back, and no way to read it:
		// a widget that loses an attribute is made again, from the attributes that are left.
		if ([...previous.attributes.keys()].some((name) => !next.attributes.has(name))) {
			this.remake(next);
			return;
		}
		for (const [name, value] of next.attributes) {
			if (previous.attributes.get(name) !== value) {
				this.setAttribute(name, value);
			}
		}
		applyHandlers(this.tag, this.id, previous.handlers, next.handlers);
		this.resolved = next;
	}

	/** Replaces the widget by a new one in the same place, with the same children. */
	private remake(next: ResolvedProps): void {
		const old = this.id;
		const parent = this.parent;
		const index = parent ? parent.children.indexOf(this) : -1;
		forgetHandlers(this.tag, old, true);
		this.id = WidgetInstance.make(this.tag);
		this.applyAll(next);
		for (const child of this.children) {
			r.Rwidget_remove_child(old, child.id);
			r.Rwidget_add_child(this.id, child.id);
		}
		if (parent) {
			r.Rwidget_remove_child(parent.id, old);
			r.Rwidget_insert_child(parent.id, this.id, index);
		}
		r.Rwidget_destroy(old);
		this.applyParentAttributes();
	}

	/** Adds a child at the end. A child already here moves to the end. */
	append(child: WidgetInstance): void {
		this.detach(child);
		this.children.push(child);
		child.parent = this;
		r.Rwidget_add_child(this.id, child.id);
	}

	/** Puts a child before another one. A child already here moves. */
	insertBefore(child: WidgetInstance, before: WidgetInstance): void {
		this.detach(child);
		const index = this.children.indexOf(before);
		if (index < 0) {
			RavenError.throw(`raven-react: <${before.tag}> is not a child of <${this.tag}>`);
		}
		this.children.splice(index, 0, child);
		child.parent = this;
		r.Rwidget_insert_child(this.id, child.id, index);
	}

	/** Takes a child out without deleting it. */
	private detach(child: WidgetInstance): void {
		const index = this.children.indexOf(child);
		if (index >= 0) {
			this.children.splice(index, 1);
			r.Rwidget_remove_child(this.id, child.id);
		}
	}

	/** Removes a child and deletes it with everything under it. */
	remove(child: WidgetInstance): void {
		child.forgetTree();
		const index = this.children.indexOf(child);
		if (index >= 0) {
			this.children.splice(index, 1);
		}
		child.parent = null;
		// (the window may be gone already, closed by the user, with its widgets)
		if (r.Rwidget_is_valid(child.id)) {
			r.Rwidget_remove_child(this.id, child.id);
			r.Rwidget_destroy(child.id);
		}
	}

	/** Forgets the handlers of this widget and of everything under it: Raven deletes them together. */
	private forgetTree(): void {
		for (const child of this.children) {
			child.forgetTree();
		}
		forgetHandlers(this.tag, this.id, false);
	}
}
