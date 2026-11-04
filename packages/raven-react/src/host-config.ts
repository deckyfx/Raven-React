import { createContext } from "react";
import ReactReconciler from "react-reconciler";
import { DefaultEventPriority, DiscreteEventPriority } from "react-reconciler/constants";
import { RavenError } from "./errors";
import { eventScope, updatePriority } from "./events";
import { childrenText, type RavenProps } from "./props";
import { WidgetInstance, type HostNode } from "./widget-instance";
import { WindowInstance } from "./window-instance";

/** React asks for a context per level of the tree. Raven has no use for one, but it must exist. */
type HostContext = { readonly inMenu: boolean };
const HOST_CONTEXT: HostContext = { inMenu: false };
const MENU_CONTEXT: HostContext = { inMenu: true };
const NO_TIMEOUT = -1;

/** A `<Separator>` in a `<Menu>`: a line of the menu, as in XML, which is an item there and no widget of its own. */
const menuSeparator = (props: RavenProps): RavenProps => ({ ...(props.Name === undefined ? {} : { Name: props.Name }), Separator: true });

/** Widgets whose attributes that need a parent wait for the end of the commit. */
const placedInThisCommit: HostNode[] = [];

updatePriority.default = DefaultEventPriority;
updatePriority.discreteValue = DiscreteEventPriority;

type RavenHostConfig = ReactReconciler.HostConfig<
	string, RavenProps, HostNode, HostNode, never, never, never, never, never, HostNode,
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

	createInstance: (tag, props, _root, context) => {
		if (tag === "Window") {
			return WindowInstance.create(props);
		}
		return tag === "Separator" && context.inMenu ? WidgetInstance.create("MenuItem", menuSeparator(props)) : WidgetInstance.create(tag, props);
	},
	createTextInstance: (text) => RavenError.throw(`raven-react: text must be alone in a widget: "${text}"`),
	shouldSetTextContent: (_tag, props) => childrenText(props.children) !== null,
	appendInitialChild: (parent, child) => parent.append(child),
	finalizeInitialChildren: (instance) => {
		placedInThisCommit.push(instance);
		return false;
	},
	getPublicInstance: (instance) => instance,
	getRootHostContext: () => HOST_CONTEXT,
	getChildHostContext: (parent, tag) => {
		const inMenu = tag === "Menu";
		return inMenu === parent.inMenu ? parent : inMenu ? MENU_CONTEXT : HOST_CONTEXT;
	},
	prepareForCommit: () => null,
	resetAfterCommit: () => {
		for (const instance of placedInThisCommit.splice(0)) {
			instance.applyParentAttributes();
		}
	},
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
	resolveUpdatePriority: () => updatePriority.current || updatePriority.default,
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
	rendererVersion: "0.1.0",
	rendererPackageName: "raven-react",
	extraDevToolsConfig: null,
};

export const reconciler = ReactReconciler(hostConfig);

eventScope.setFlush(() => {
	reconciler.flushSyncWork();
});
