/** A thread of the renderer: it waits for frames and renders bands of them. */

import { SharedFrame, type FrameBuffers } from "./shared-frame";

declare const self: Worker;

self.addEventListener("message", (event: MessageEvent<FrameBuffers>): void => {
	new SharedFrame(event.data).serve();
	process.exit(0);
});
