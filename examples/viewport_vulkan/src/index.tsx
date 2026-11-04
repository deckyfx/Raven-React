/**
 * A PARTIAL port of `examples/viewport_vulkan` of Raven: there is no Vulkan in this program.
 *
 * The original records Vulkan commands twice: into its own image, wrapped as a texture with no
 * copy, and inside Raven's render pass through a draw callback. Vulkan bindings for JavaScript
 * are not reasonable, and a draw callback here would have nothing to record its commands with.
 * What this shows instead is the idea of the example, a scene of the application that lives in
 * the interface like any widget, by the two ways open to a program in TypeScript:
 *
 *   left   Viewport   the triangle is rendered on the CPU into a typed array, and given to
 *                     Raven with Rtexture_update: "anything, one copy".
 *   right  Custom     the triangle is drawn with Rdraw_triangle while Raven paints its frame.
 *                     A Custom, not a Viewport: the Rdraw_ functions are not a draw callback.
 *
 * Mode 1 with no copy (Rvulkan_texture_create_from_image_view) and mode 2
 * (Rviewport_set_draw_callback) are not demonstrated.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Checkbox, Custom, HBox, Label, Overlay, raven, runApp, Splitter, VBox, Viewport, type WidgetInstance } from "@decky.fx/raven-react";
import { placeCorners, SoftwareTarget } from "./triangle";

/** Cuts per side of the triangle of the right pane: Rdraw_triangle has one color, so colors are many small triangles. */
const CUTS = 32;

/** Draws the triangle with the Rdraw_ functions, one small flat triangle per step of its gradient. */
function paintTriangle(painter: raven.Pointer | null, width: number, height: number, angle: number): void {
	raven.Rdraw_rect(painter, 0, 0, width, height, 0, 0, 0, 0, 1);
	const [a, b, c] = placeCorners(width, height, angle);
	/** A point of the triangle, and its color, by its row and column in the cuts. */
	const point = (row: number, column: number): readonly [number, number, number, number, number] => {
		const wb = column / CUTS;
		const wc = row / CUTS;
		const wa = 1 - wb - wc;
		return [
			wa * a.x + wb * b.x + wc * c.x,
			wa * a.y + wb * b.y + wc * c.y,
			wa * a.red + wb * b.red + wc * c.red,
			wa * a.green + wb * b.green + wc * c.green,
			wa * a.blue + wb * b.blue + wc * c.blue,
		];
	};
	// Rdraw_triangle smooths its edges, which would show every cut: each one overlaps the next by a pixel
	const grow = 1 + (1.75 * CUTS) / Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1);
	/** One small triangle, in the color of its middle. */
	const flat = (p: ReturnType<typeof point>, q: ReturnType<typeof point>, s: ReturnType<typeof point>): void => {
		const x = (p[0] + q[0] + s[0]) / 3;
		const y = (p[1] + q[1] + s[1]) / 3;
		raven.Rdraw_triangle(
			painter,
			x + (p[0] - x) * grow, y + (p[1] - y) * grow,
			x + (q[0] - x) * grow, y + (q[1] - y) * grow,
			x + (s[0] - x) * grow, y + (s[1] - y) * grow,
			(p[2] + q[2] + s[2]) / 3, (p[3] + q[3] + s[3]) / 3, (p[4] + q[4] + s[4]) / 3, 1,
		);
	};
	for (let row = 0; row < CUTS; row++) {
		for (let column = 0; column < CUTS - row; column++) {
			flat(point(row, column), point(row, column + 1), point(row + 1, column));
			if (column + row + 1 < CUTS) {
				flat(point(row, column + 1), point(row + 1, column + 1), point(row + 1, column));
			}
		}
	}
}

function App(): ReactNode {
	const viewport = useRef<WidgetInstance>(null);
	const custom = useRef<WidgetInstance>(null);
	const [paused, setPaused] = useState(false);
	// what the frame callback and the paint read: animation is no state of React
	const angle = useRef(0);
	const pausedNow = useRef(paused);
	pausedNow.current = paused;

	useEffect(() => {
		const target = new SoftwareTarget();
		let texture = raven.R_INVALID_ID;

		raven.Rset_frame_callback((delta) => {
			const id = viewport.current?.widget ?? raven.R_INVALID_ID;
			if (!raven.Rwidget_is_valid(id)) {
				return;
			}
			if (!pausedNow.current) {
				angle.current += delta;
				// the Custom paints again: a realtime viewport redraws the window, but not its widgets
				if (custom.current) {
					raven.Rwidget_invalidate(custom.current.widget);
				}
			}
			// asked at each frame: Rviewport_set_resize_callback says nothing of a size that was
			// reached before it was set, and the first layout comes before the effects of React
			const [width, height] = raven.Rviewport_get_pixel_size(id);
			const resized = width !== target.width || height !== target.height;
			if (width <= 0 || height <= 0 || (pausedNow.current && !resized)) {
				return;
			}
			if (resized) {
				target.resize(width, height);
			}
			target.render(angle.current);
			if (texture === raven.R_INVALID_ID) {
				texture = raven.Rtexture_create_from_pixels(target.bytes, width, height);
				raven.Rviewport_set_texture(id, texture);
			} else {
				raven.Rtexture_update(texture, target.bytes, width, height);
			}
		});
		return () => {
			raven.Rset_frame_callback(null);
			if (texture !== raven.R_INVALID_ID) {
				raven.Rtexture_destroy(texture);
			}
		};
	}, []);

	return (
		<VBox Spacing={8} Slot={{ Padding: 10 }}>
			<HBox Spacing={12}>
				<Checkbox Style="Switch" Checked={paused} OnChanged={setPaused}>Pause</Checkbox>
				<Label Wrap Opacity={0.7} Slot={{ VAlign: "Center", Fill: 1 }}>
					Software rendering in TypeScript, not Vulkan: JavaScript has no reasonable way to record Vulkan commands. Both scenes are still clipped, resized and covered by widgets like any other widget.
				</Label>
			</HBox>
			<Splitter Slot={{ Fill: 1 }}>
				<VBox Spacing={4}>
					<Label>Texture: pixels rendered on the CPU, one copy (Rtexture_update)</Label>
					<Overlay Slot={{ Fill: 1 }}>
						<Viewport ref={viewport} Realtime={!paused} />
						<Button Slot={{ HAlign: "Right", VAlign: "Bottom", Padding: 12 }}>UI over the scene</Button>
					</Overlay>
				</VBox>
				<VBox Spacing={4}>
					<Label>Custom: Rdraw_triangle while the frame is painted (no draw callback)</Label>
					<Overlay Slot={{ Fill: 1 }}>
						<Custom ref={custom} OnPaint={(painter, width, height) => paintTriangle(painter, width, height, -angle.current)} />
						<Button Slot={{ HAlign: "Right", VAlign: "Bottom", Padding: 12 }}>UI over the scene</Button>
					</Overlay>
				</VBox>
			</Splitter>
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven - viewports, software rendering (not Vulkan)", Width: 960, Height: 540 }, { appName: "viewport_vulkan" });
