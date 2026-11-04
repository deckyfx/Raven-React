/**
 * Where the memory of the library comes from, and how to watch it. The port of `examples/memory` of Raven.
 *
 * The counting allocator of the original is left out. Raven calls an allocator from its worker
 * threads and before anything else starts, and a JavaScript function cannot be called off the
 * JS thread, so an `RAllocator` cannot be written in TSX. What remains is real: Raven's own
 * statistics and heap check, and with `--system` the native allocator Raven comes with.
 *
 *   bun run src/index.tsx            the allocator of Raven
 *   bun run src/index.tsx --system   the allocator of the C runtime (Rallocator_get_system)
 */

import { useEffect, useState, type ReactNode } from "react";
import { Button, HBox, Label, raven, runApp, ScrollBox, VBox, WrapBox } from "@decky.fx/raven-react";

/** How many buttons a click adds. */
const BATCH = 200;
/** How often the statistics are read, in milliseconds. */
const REFRESH_MS = 500;
/** Whether this run was started with the allocator of the C runtime. */
const SYSTEM_ALLOCATOR = process.argv.includes("--system");

const WHICH_ALLOCATOR = SYSTEM_ALLOCATOR
	? "The allocator of the C runtime is in use (Rallocator_get_system, started with --system): Raven counts its blocks but not their bytes, and Rmemory_check has no heap to walk."
	: "The allocator of Raven is in use (start with --system for the one of the C runtime).";
const LEFT_OUT =
	"Left out of this port: the counting allocator of the C example. Raven calls an allocator from its worker threads and before anything else starts, and a JavaScript function cannot be called off the JS thread.";

/** What `Rmemory_get_stats` reports, as a line of text. */
function readStats(): string {
	const stats = new raven.RMemoryStats();
	raven.Rmemory_get_stats(stats);
	const usedKb = (stats.used_bytes / 1024).toFixed(1);
	const peakKb = (stats.peak_bytes / 1024).toFixed(1);
	const reservedMb = (stats.reserved_bytes / (1024 * 1024)).toFixed(1);
	return `Rmemory_get_stats: ${stats.allocation_count} blocks, ${usedKb} KB in use, peak ${peakKb} KB, ${reservedMb} MB taken from the system`;
}

/**
 * The line of statistics, on its own so that reading them does not render the buttons again.
 * It reads them on a timer, and at once when the number of buttons changed. When the buttons
 * are gone it first gives back to the system the regions that are now empty.
 */
function Statistics({ buttons }: { readonly buttons: number }): ReactNode {
	const [text, setText] = useState("");
	useEffect(() => {
		if (buttons === 0) {
			raven.Rmemory_trim();
		}
		setText(readStats());
	}, [buttons]);
	useEffect(() => {
		const timer = setInterval(() => setText(readStats()), REFRESH_MS);
		return () => clearInterval(timer);
	}, []);
	return <Label>{text}</Label>;
}

function App(): ReactNode {
	const [buttons, setButtons] = useState(BATCH);
	const [check, setCheck] = useState("");

	/** Walks the heap of Raven and verifies every block. With another allocator there is nothing to walk. */
	function checkHeap(): void {
		setCheck(raven.Rmemory_check() ? "Rmemory_check: the heap is consistent." : "Rmemory_check: the heap is damaged!");
	}

	return (
		<VBox Spacing={10} Slot={{ Padding: 16 }}>
			<Label Wrap>{WHICH_ALLOCATOR}</Label>
			<Label Wrap Opacity={0.7}>{LEFT_OUT}</Label>
			<Statistics buttons={buttons} />
			<Label Text={check} Opacity={0.7} />
			<HBox Spacing={8}>
				<Button Style="Primary" OnClicked={() => setButtons(buttons + BATCH)}>Add 200 buttons</Button>
				<Button OnClicked={() => setButtons(0)}>Remove them</Button>
				<Button OnClicked={checkHeap}>Check the heap</Button>
			</HBox>
			<ScrollBox Slot={{ Fill: 1 }}>
				<WrapBox Spacing={4}>
					{Array.from({ length: buttons }, (_, index) => <Button key={index}>{index + 1}</Button>)}
				</WrapBox>
			</ScrollBox>
		</VBox>
	);
}

// (before Rinit, and before anything else of the library that allocates)
if (SYSTEM_ALLOCATOR) {
	raven.Rset_allocator(raven.Rallocator_get_system());
}

await runApp(<App />, { Title: "Raven - memory", Width: 720, Height: 460 }, { appName: "memory" });

// What an application checks at exit: everything the library took, it gave back.
const after = new raven.RMemoryStats();
raven.Rmemory_get_stats(after);
console.log(`blocks still allocated after Rshutdown: ${after.allocation_count}`);
process.exit(after.allocation_count === 0 ? 0 : 1);
