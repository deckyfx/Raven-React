/**
 * A music player, to show what Raven can do: only the interface, no server and no sound (the
 * songs, made up, "play" by the clock). The port of `examples/music` of Raven.
 *
 *   Space        play / pause         Ctrl+Left / Right   previous / next
 *   Ctrl+L       like the song        Ctrl+F              search
 *   Ctrl+P       settings             Alt+Left            back
 *
 * As the C example, it reads RAVEN_MUSIC_LOOK, RAVEN_MUSIC_PAGE, RAVEN_MUSIC_PAUSED and
 * RAVEN_MUSIC_ISLAND, to open on a given screen.
 */

import { raven, runApp } from "@decky.fx/raven-react";
import { drawAtlas } from "./glyphs";
import { initLibrary } from "./library";
import { applyLook, LOOKS, MusicProvider } from "./music";
import { Shell } from "./Shell";

const THEMES = `${import.meta.dir}/../assets/themes`;

const wantedLook = LOOKS.findIndex((look) => look.name === process.env.RAVEN_MUSIC_LOOK);
const look = wantedLook >= 0 ? wantedLook : 0;

/** What the interface needs before it is made: the covers, the pictures, the themes. */
function setup(): void {
	initLibrary();
	drawAtlas();
	for (const theme of ["nocturne", "aurora", "daylight", "styles"]) {
		raven.Rtheme_load(`${THEMES}/${theme}.xml`);
	}
	applyLook(look);
}

await runApp(
	<MusicProvider start={{ look, page: process.env.RAVEN_MUSIC_PAGE, paused: process.env.RAVEN_MUSIC_PAUSED !== undefined }}>
		<Shell islandExpanded={process.env.RAVEN_MUSIC_ISLAND !== undefined} />
	</MusicProvider>,
	undefined,
	{ appName: "Raven Music", setup },
);
