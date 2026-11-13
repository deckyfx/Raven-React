/**
 * What the primitives subscribe to in Raven, kept by the root of the tree as well as by Solid's
 * cleanup. Solid runs the cleanups of an owner without catching: one that throws stops the others,
 * and an action would still be bound after its component went. The root stops what is left.
 */

import { getOwner, onCleanup, type Owner } from "solid-js";

/** What each root of a tree keeps, to stop at its end what its cleanups did not. */
const roots = new WeakMap<Owner, Set<() => void>>();

/** Says that an owner is the root of a tree, which keeps what is subscribed under it. */
export function trackRoot(owner: Owner): void {
	roots.set(owner, new Set());
}

/**
 * Stops a subscription with the cleanup of the current owner, or with the end of its root if a
 * cleanup that throws comes first. It stops once.
 */
export function onTeardown(stop: () => void): void {
	let kept: Set<() => void> | undefined;
	let done = false;
	const run = (): void => {
		if (done) {
			return;
		}
		done = true;
		kept?.delete(run);
		stop();
	};
	for (let owner = getOwner(); owner && !kept; owner = owner.owner) {
		kept = roots.get(owner);
	}
	kept?.add(run);
	onCleanup(run);
}

/** Stops what a root still keeps, after its cleanups ran: those a cleanup that threw left. */
export function stopLeft(owner: Owner): void {
	const kept = roots.get(owner);
	roots.delete(owner);
	for (const run of [...(kept ?? [])]) {
		try {
			run();
		} catch (error) {
			console.error("raven-tsx: stopping what a tree subscribed to:", error);
		}
	}
}
