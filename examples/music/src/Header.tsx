/** The header: the window has no title bar of the system (`CustomHeader`), this bar moves it and holds its buttons. */

import type { ReactNode } from "react";
import { Border, Button, HBox, HeaderBar, Spacer, TextInput } from "@decky.fx/raven-react";
import { PAGE_HOME, PAGE_SETTINGS, useMusic } from "./music";
import { Heading, Icon } from "./tags";
import { IconButton } from "./widgets";

/** The bar at the top of the window. */
export function Header(): ReactNode {
	const music = useMusic();
	return (
		<HeaderBar Title="" Background={false} Height={56}>
			<HBox Spacing={8} Slot={{ Fill: 1, Padding: [12, 0] }}>
				<HBox Spacing={8} Slot={{ VAlign: "Center" }}>
					<Border Class="logo" Background="#FFFFFF" CornerRadius={9} Width={30} Height={30} Slot={{ VAlign: "Center" }}>
						<Icon Glyph="note" Size={18} Tint="#060609" Slot={{ HAlign: "Center", VAlign: "Center" }} />
					</Border>
					<Heading Text="Raven Music" TextSize={16} Slot={{ VAlign: "Center" }} />
				</HBox>
				<Spacer Width={36} />
				<IconButton Glyph="back" OnClicked={music.back} Tip="Back (Alt+Left)" Size={18} Slot={{ VAlign: "Center" }} />
				<IconButton Glyph="home" OnClicked={() => music.showPage(PAGE_HOME)} Tip="Home" Size={20} Slot={{ VAlign: "Center" }} />
				<Border Class="search" CornerRadius={100} Width={280} Height={40} Padding={[14, 0]} Slot={{ VAlign: "Center" }}>
					<HBox Spacing={10}>
						<Icon Glyph="search" Size={18} Opacity={0.7} Slot={{ VAlign: "Center" }} />
						<TextInput
							ref={music.searchInput}
							Class="bare"
							Placeholder="What do you want to play?"
							Text={music.query}
							OnChanged={music.search}
							Slot={{ Fill: 1, VAlign: "Center" }}
						/>
					</HBox>
				</Border>
				<Spacer Slot={{ Fill: 1 }} />
				<IconButton Glyph="settings" OnClicked={() => music.showPage(PAGE_SETTINGS)} Tip="Settings (Ctrl+P)" Size={20} Slot={{ VAlign: "Center" }} />
				<Button Style="Flat" Class="icon" Tooltip="Mira Solen" Slot={{ VAlign: "Center", Padding: [0, 0, 8, 0] }}>
					<Border Background="#E8A93B" CornerRadius={100} Width={30} Height={30}>
						<Heading Text="M" TextSize={14} Color="#060609" Slot={{ HAlign: "Center", VAlign: "Center" }} />
					</Border>
				</Button>
			</HBox>
		</HeaderBar>
	);
}
