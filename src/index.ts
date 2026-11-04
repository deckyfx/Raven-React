/**
 * raven-react: the interface in TSX, on Raven's widgets.
 *
 *     import { useState } from "react";
 *     import { Button, Label, runApp, VBox } from "raven-react";
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
export type { AttributeGroup, AttributeValue, EventHandler } from "./props";
export { createWindow, RavenRoot, runApp } from "./root";
