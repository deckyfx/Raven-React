import { createContext, type ReactNode } from "react";
import ReactReconciler from "react-reconciler";
import { DefaultEventPriority, DiscreteEventPriority } from "react-reconciler/constants";
import { RavenError } from "../core/errors";
import * as r from "../core/raven";
import { eventScope } from "../core/events";
import { childrenText, type RavenProps } from "../core/props";
import { ADOPTED_TAG, finishPlacing, WidgetInstance, type HostNode } from "../core/widget-instance";
import { WindowInstance } from "../core/window-instance";

/** React asks for a context per level of the tree. Raven has no use for one, but it must exist. */
type HostContext = { readonly inMenu: boolean };
const HOST_CONTEXT: HostContext = { inMenu: false };
const MENU_CONTEXT: HostContext = { inMenu: true };
const NO_TIMEOUT = -1;

/** The props of a widget under React, where children are React's. */
type ReactRavenProps = RavenProps<ReactNode>;

/** A `<Separator>` in a `<Menu>`: a line of the menu, as in XML, which is an item there and no widget of its own. */
const menuSeparator = (props: ReactRavenProps): ReactRavenProps => ({ ...(props["Name"] === undefined ? {} : { Name: props["Name"] }), Separator: true });

/** The priority React asks about: discrete while a native event runs, as a click in React DOM. */
class UpdatePriority {
	/** What React set, or 0. */
	current = 0;

	/** Runs something at the discrete priority. */
	discrete(run: () => void): void {
		const before = this.current;
		this.current = DiscreteEventPriority;
		try {
			run();
		} finally {
			this.current = before;
		}
	}
}

const updatePriority = new UpdatePriority();

type RavenHostConfig = ReactReconciler.HostConfig<
	string, ReactRavenProps, HostNode, HostNode, never, never, never, never, never, HostNode,
	HostContext, never, ReturnType<typeof setTimeout>, typeof NO_TIMEOUT, null, null, null, never, never, never
>;

const hostConfig: RavenHostConfig = {
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,
	supportsMicrotasks: true,
	isPrimaryRenderer: true,
	warnsIfNotActing: false,
	noTimeout: NO_TIMEOUT,
	scheduleTimeout: setTimeout,
	cancelTimeout: clearTimeout,
	scheduleMicrotask: queueMicrotask,
	NotPendingTransition: null,
	HostTransitionContext: createContext<null>(null),

	// (Raven makes nothing while React renders, which React may throw away: a node is made when it
	// is placed, as React commits it, with what it holds. See `HostNode.materialize`)
	createInstance: (tag, props, _root, context) => {
		if (tag === "Window") {
			return WindowInstance.create(props);
		}
		if (tag === ADOPTED_TAG) {
			return WidgetInstance.adopt(typeof props["widget"] === "number" ? props["widget"] : r.R_INVALID_ID);
		}
		return tag === "Separator" && context.inMenu ? WidgetInstance.create("MenuItem", menuSeparator(props)) : WidgetInstance.create(tag, props);
	},
	createTextInstance: (text) => RavenError.throw(`raven-tsx: text must be alone in a widget: "${text}"`),
	shouldSetTextContent: (_tag, props) => childrenText(props["children"]) !== null,
	appendInitialChild: (parent, child) => parent.appendInitial(child),
	finalizeInitialChildren: () => false,
	commitMount: () => {},
	getPublicInstance: (instance) => instance,
	getRootHostContext: () => HOST_CONTEXT,
	getChildHostContext: (parent, tag) => {
		const inMenu = tag === "Menu";
		return inMenu === parent.inMenu ? parent : inMenu ? MENU_CONTEXT : HOST_CONTEXT;
	},
	prepareForCommit: () => null,
	resetAfterCommit: () => finishPlacing(),
	preparePortalMount: () => {},
	clearContainer: () => {},

	appendChild: (parent, child) => parent.append(child),
	appendChildToContainer: (container, child) => container.append(child),
	insertBefore: (parent, child, before) => parent.insertBefore(child, before),
	insertInContainerBefore: (container, child, before) => container.insertBefore(child, before),
	removeChild: (parent, child) => parent.remove(child),
	removeChildFromContainer: (container, child) => container.remove(child),
	commitUpdate: (instance, tag, _previous, next) => instance.update(tag === "Separator" && instance.tag === "MenuItem" ? menuSeparator(next) : next),
	commitTextUpdate: () => {},
	hideInstance: () => {},
	unhideInstance: () => {},
	hideTextInstance: () => {},
	unhideTextInstance: () => {},
	detachDeletedInstance: () => {},
	beforeActiveInstanceBlur: () => {},
	afterActiveInstanceBlur: () => {},
	prepareScopeUpdate: () => {},
	getInstanceFromNode: () => null,
	getInstanceFromScope: () => null,

	setCurrentUpdatePriority: (priority) => {
		updatePriority.current = priority;
	},
	getCurrentUpdatePriority: () => updatePriority.current,
	resolveUpdatePriority: () => updatePriority.current || DefaultEventPriority,
	shouldAttemptEagerTransition: () => false,
	trackSchedulerEvent: () => {},
	resolveEventType: () => null,
	resolveEventTimeStamp: () => -1.1,
	requestPostPaintCallback: () => {},
	maySuspendCommit: () => false,
	maySuspendCommitOnUpdate: () => false,
	maySuspendCommitInSyncRender: () => false,
	preloadInstance: () => true,
	startSuspendingCommit: () => null,
	suspendInstance: () => {},
	suspendOnActiveViewTransition: () => {},
	waitForCommitToBeReady: () => null,
	bindToConsole: (_method, args) => console.log.bind(console, ...args),
	getSuspendedCommitReason: () => null,
	resetFormInstance: () => {},
	rendererVersion: "0.1.2",
	rendererPackageName: "raven-tsx-react",
	extraDevToolsConfig: null,
};

export const reconciler = ReactReconciler(hostConfig);

eventScope.setFlush(() => {
	reconciler.flushSyncWork();
});
eventScope.setWrapper((run) => updatePriority.discrete(run));
