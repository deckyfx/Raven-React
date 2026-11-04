/**
 * raven-react: the interface in TSX, on Raven's widgets.
 *
 *     import { useState } from "react";
 *     import { Button, Label, runApp, VBox } from "@deckyfx/raven-react";
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
export type { MeasuredSize } from "./events";
export type { AttributeGroup, AttributeValue, EventHandler } from "./props";
export { createWindow, RavenRoot, runApp } from "./root";
export type { WidgetInstance } from "./widget-instance";
export type { WindowInstance } from "./window-instance";
/** All of Raven's C API, for what props do not cover: painting, for one. */
export * as raven from "./raven";
