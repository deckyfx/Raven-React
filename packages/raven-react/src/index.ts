/**
 * raven-react: the interface in TSX, on Raven's widgets.
 *
 *     import { useState } from "react";
 *     import { Button, Label, runApp, VBox } from "@decky.fx/raven-react";
 *
 *     function App() {
 *       const [count, setCount] = useState(0);
 *       return (
 *         <VBox Spacing={12} Slot={{ Padding: 24 }}>
 *           <Label>Clicked {count} times</Label>
 *           <Button Style="Primary" OnClicked={() => setCount(count + 1)}>Click me</Button>
 *         </VBox>
 *       );
 *     }
 *
 *     await runApp(<App />, { Title: "Hello", Width: 480, Height: 240 });
 */

export * from "./components.generated";
export { RavenError } from "./errors";
export { inEventScope, type MeasuredSize, type Painter } from "./events";
export type { FrameHandler } from "./frame";
export type { AttributeGroup, AttributeValue, EventHandler, TreeItem } from "./props";
export { parseKeys, useAction, useFrame, useShortcut } from "./hooks";
export { createPortal, createWindow, RavenRoot, runApp, type RunOptions } from "./root";
export type { WidgetInstance } from "./widget-instance";
export type { WindowInstance } from "./window-instance";
/** All of Raven's C API, for what props do not cover: painting, for one. */
export * as raven from "./raven";
export { registerWebView, WebView, webFunctions, type WebViewProps } from "./web";
