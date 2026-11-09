/** The window of the player: the port of `ui/main.xml`. Behind everything, a moving gradient in the colors of the cover. */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Border, HBox, Overlay, raven, Switcher, useShortcut, VBox, Window, type WidgetInstance, type WindowInstance } from "@decky.fx/raven-tsx/react";
import { Collection } from "./Collection";
import { Header } from "./Header";
import { Home } from "./Home";
import { IslandPanel } from "./IslandPanel";
import { hex, trackAt } from "./library";
import { LibraryPage } from "./LibraryPage";
import { PAGE_SETTINGS, useMusic } from "./music";
import { NowPlaying } from "./NowPlaying";
import { PlayerBar } from "./PlayerBar";
import { Search } from "./Search";
import { Settings } from "./Settings";
import { Sidebar } from "./Sidebar";

const EFFECTS = ["mesh", "aurora", "plasma", "spotlight", "shimmer"] as const;

/** The window, with everything in it. */
export function Shell({ islandExpanded }: { readonly islandExpanded: boolean }): ReactNode {
	const music = useMusic();
	const { player, album, dark } = music;
	const window = useRef<WindowInstance>(null);
	const island = useRef<WidgetInstance>(null);

	useShortcut(window, "Space", music.toggle);
	useShortcut(window, "Ctrl+Right", music.next);
	useShortcut(window, "Ctrl+Left", music.previous);
	useShortcut(window, "Ctrl+L", music.toggleLikeCurrent);
	useShortcut(window, "Ctrl+F", music.showSearch);
	useShortcut(window, "Ctrl+P", () => music.showPage(PAGE_SETTINGS));
	useShortcut(window, "Alt+Left", music.back);

	// An island floats above the content of its window only if the window holds it: in XML, as a
	// child of <Window>. Here that child goes in the content like any other, so it is moved.
	useLayoutEffect(() => {
		if (window.current && island.current) {
			raven.Rwindow_set_island(window.current.window, island.current.widget);
		}
	}, []);

	// what moves by itself: the bars while it plays, the background while it is animated
	useEffect(() => {
		if (window.current) {
			raven.Rwindow_set_continuous_redraw(window.current.window, player.playing || music.animate ? 1 : 0);
		}
	}, [player.playing, music.animate]);

	const effect = EFFECTS[music.effect];
	return (
		<Window
			ref={window}
			Title={`${trackAt(player.track).title} · ${album.artist}`}
			Width={1360}
			Height={860}
			MinWidth={1040}
			MinHeight={660}
			CustomHeader
		>
			<IslandPanel islandRef={island} expanded={islandExpanded} />
			<Overlay>
				{/* the colors of the cover, moving slowly */}
				<Border
					Effect={effect ?? "mesh"}
					EffectColor={hex(album.color, dark ? 0.55 : 1)}
					EffectColor2={hex(album.color2, dark ? 0.35 : 0.9)}
					EffectPointer={false}
					EffectAnimate={music.animate}
					Opacity={dark ? 0.9 : 0.45}
					Visibility={effect ? "Visible" : "Collapsed"}
				/>
				<VBox>
					<Header />
					<HBox Spacing={8} Slot={{ Fill: 1, Padding: [8, 0, 8, 8] }}>
						<Sidebar />
						<Border Class="surface" CornerRadius={12} Clip Slot={{ Fill: 1 }}>
							<Switcher Index={music.page}>
								<Home />
								<Collection />
								<Search />
								<LibraryPage />
								<Settings />
							</Switcher>
						</Border>
						<NowPlaying />
					</HBox>
					<PlayerBar />
				</VBox>
			</Overlay>
		</Window>
	);
}
