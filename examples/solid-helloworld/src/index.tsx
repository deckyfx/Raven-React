/** Hello world in Raven with Solid: the interface is in `App.tsx`. */

import { runApp } from "@decky.fx/raven-tsx/solid";
import { App } from "./App";

await runApp(() => <App />, { Title: "Hello from Solid", Width: 520, Height: 460 });
