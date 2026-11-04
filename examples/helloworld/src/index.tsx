/** Hello world in Raven: the interface is React, in `App.tsx`. */

import { runApp } from "@deckyfx/raven-react";
import { App } from "./App";

await runApp(<App />, { Title: "Hello World", Width: 480, Height: 520 });
