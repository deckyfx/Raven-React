/**
 * raven-tsx for React: the interface in TSX, on Raven's widgets. It exports everything of the
 * core too, so an application needs this one import.
 *
 *     import { useState } from "react";
 *     import { Button, Label, runApp, VBox } from "@decky.fx/raven-tsx/react";
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

export * from "../core";
export * from "./components.generated";
export { useAction, useFrame, useShortcut } from "./hooks";
export { createPortal, createWindow, RavenRoot, runApp, type RunOptions } from "./root";
export { registerTag, type TagOptions } from "./tags";
export { WebView } from "./web";
