/**
 * raven-tsx for Solid: the interface in TSX, on Raven's widgets. It exports everything of the
 * core too, so an application needs this one import. Its TSX is compiled for Solid by the plugin
 * of `@decky.fx/raven-tsx/solid/plugin`: `preload = ["@decky.fx/raven-tsx/solid/preload"]` in bunfig.toml.
 *
 *     import { createSignal } from "solid-js";
 *     import { Button, Label, runApp, VBox } from "@decky.fx/raven-tsx/solid";
 *
 *     function App() {
 *       const [count, setCount] = createSignal(0);
 *       return (
 *         <VBox Spacing={12} Slot={{ Padding: 24 }}>
 *           <Label>Clicked {count()} times</Label>
 *           <Button Style="Primary" OnClicked={() => setCount(count() + 1)}>Click me</Button>
 *         </VBox>
 *       );
 *     }
 *
 *     await runApp(() => <App />, { Title: "Hello", Width: 480, Height: 240 });
 */

export * from "../core";
export * from "./components.generated";
export { Portal } from "./portal";
export { createAction, createFrame, createShortcut } from "./primitives";
export { createWindow, RavenRoot, runApp, type RunOptions } from "./root";
export { tag, type SolidProps } from "./tag";
export { registerTag, type TagOptions } from "./tags";
export { WebView } from "./web";
