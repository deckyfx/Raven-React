/** Hello world in Raven: the interface is `main.xml`, the behaviour is here. */

import "./native";
import * as r from "raven";
import embeddedUi from "../main.xml" with { type: "text" };
import { envConfig } from "./env-config";

/** Prints the last error of the library with `context`, then exits. */
function fail(context: string): never {
	const [code, detail] = r.Rerror_get_last();
	console.error(`${context}: ${r.Rerror_to_string(code)}: ${detail}`);
	process.exit(1);
}

if (!r.Rinit(r.R_BACKEND_VULKAN)) {
	fail("cannot start Raven");
}

// `bun run dev` loads the file, which reloads when saved; the binary has its own copy.
// (String: bun-types describes *.xml as parsed by default, and this import is `type: "text"`.)
const uiFile = envConfig.UI_FILE;
const window = uiFile ? r.Rwindow_create_from_xml_file(uiFile) : r.Rwindow_create_from_xml(String(embeddedUi));
if (window === r.R_INVALID_ID) {
	fail(`cannot load ${uiFile ?? "the embedded interface"}`);
}

let clicks = 0;
// OnClicked="hello.clicked" in main.xml fires this action.
r.Raction_bind("hello.clicked", () => {
	clicks += 1;
	// Name="status" in main.xml. Looked up on each click because a reload
	// only keeps the handles of widgets the file did not change.
	r.Rlabel_set_text(r.Rwidget_find(window, "status"), `Clicked ${clicks} time(s)`);
});

// Ends when the window closes. Timers and promises keep running meanwhile.
await r.runLoop();
r.Rshutdown();
