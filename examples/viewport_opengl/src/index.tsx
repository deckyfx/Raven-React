/**
 * An OpenGL scene inside a Raven window, on the native child window of a viewport (mode 3 of
 * raven_viewport.h). The port of `examples/viewport_opengl` of Raven, for X11 only: the original's
 * WGL part for Windows is not here.
 *
 * What this mode cannot do: the system draws the child window above the interface, so widgets
 * cannot overlap the scene and scroll boxes do not clip it.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Checkbox, HBox, Label, raven, runApp, Separator, Slider, VBox, Viewport, type WidgetInstance } from "@decky.fx/raven-react";
import {
	GL_COLOR_BUFFER_BIT,
	GL_DEPTH_BUFFER_BIT,
	GL_DEPTH_TEST,
	GL_FILL,
	GL_FRONT_AND_BACK,
	GL_LINE,
	GL_MODELVIEW,
	GL_PROJECTION,
	GL_QUADS,
	GlContext,
	type Gl,
} from "./gl";

type Vector3 = readonly [number, number, number];

/** The six faces of the cube, each with its color and its four corners. */
const FACES: readonly { readonly color: Vector3; readonly corners: readonly Vector3[] }[] = [
	{ color: [1, 0.35, 0.2], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
	{ color: [0.25, 0.85, 0.4], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
	{ color: [0.25, 0.5, 1], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
	{ color: [1, 0.8, 0.2], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
	{ color: [0.8, 0.3, 0.9], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
	{ color: [0.2, 0.85, 0.9], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
];

/** Draws the cube, with the calls of OpenGL 1.1. */
function drawScene(gl: Gl, width: number, height: number, angle: number, wireframe: boolean): void {
	const aspect = width / height;
	gl.glViewport(0, 0, width, height);
	gl.glClearColor(0.05, 0.06, 0.1, 1);
	gl.glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
	gl.glEnable(GL_DEPTH_TEST);
	gl.glPolygonMode(GL_FRONT_AND_BACK, wireframe ? GL_LINE : GL_FILL);

	gl.glMatrixMode(GL_PROJECTION);
	gl.glLoadIdentity();
	gl.glFrustum(-0.1 * aspect, 0.1 * aspect, -0.1, 0.1, 0.2, 20);
	gl.glMatrixMode(GL_MODELVIEW);
	gl.glLoadIdentity();
	gl.glTranslatef(0, 0, -5);
	gl.glRotatef(angle * 40, 0.3, 1, 0.2);

	gl.glBegin(GL_QUADS);
	for (const { color, corners } of FACES) {
		gl.glColor3f(color[0], color[1], color[2]);
		for (const [x, y, z] of corners) {
			gl.glVertex3f(x, y, z);
		}
	}
	gl.glEnd();
}

function App(): ReactNode {
	const viewport = useRef<WidgetInstance>(null);
	const [speed, setSpeed] = useState(1);
	const [wireframe, setWireframe] = useState(false);
	const [info, setInfo] = useState("");
	// what the frame callback reads, as it is made once
	const controls = useRef({ speed, wireframe });
	// (after the commit: the frame callback reads what is on screen, not a render React may throw away)
	useLayoutEffect(() => {
		controls.current = { speed, wireframe };
	}, [speed, wireframe]);

	useEffect(() => {
		const scene = viewport.current?.widget ?? raven.R_INVALID_ID;
		// asks Raven for a child window on the viewport, then puts an OpenGL context on it
		const native = new raven.RNativeWindow();
		if (!raven.Rviewport_set_native(scene, raven.R_TRUE) || !raven.Rviewport_get_native_handle(scene, native)) {
			setInfo("Cannot create an OpenGL context on the viewport.");
			return;
		}
		const context = GlContext.create(native);
		if (typeof context === "string") {
			raven.Rviewport_set_native(scene, raven.R_FALSE);
			setInfo(context);
			return;
		}
		setInfo(context.renderer);

		let angle = 0;
		raven.Rset_frame_callback((delta) => {
			const id = viewport.current?.widget ?? raven.R_INVALID_ID;
			if (!raven.Rwidget_is_valid(id)) {
				return;
			}
			angle += delta * controls.current.speed;
			// the child window has exactly the size of the widget, in pixels
			const [width, height] = raven.Rviewport_get_pixel_size(id);
			if (width > 0 && height > 0) {
				drawScene(context.gl, width, height, angle, controls.current.wireframe);
				context.swap();
			}
		});
		// the context goes before Raven stops
		return () => {
			raven.Rset_frame_callback(null);
			context.destroy();
		};
	}, []);

	return (
		<HBox>
			<VBox Width={240} Spacing={10} Slot={{ Padding: 12 }}>
				<Label TextSize={16}>OpenGL in a native viewport</Label>
				<Label Wrap Opacity={0.7}>The cube is drawn by an OpenGL context created on a child window that Raven keeps on the viewport widget.</Label>
				<Label>Speed</Label>
				<Slider Min={0} Max={4} Value={speed} OnChanged={setSpeed} />
				<Checkbox Checked={wireframe} OnChanged={setWireframe}>Wireframe</Checkbox>
				<Label Wrap Opacity={0.7}>{info}</Label>
			</VBox>
			<Separator Orientation="Vertical" />
			<Viewport ref={viewport} Realtime Slot={{ Fill: 1 }} />
		</HBox>
	);
}

await runApp(<App />, { Title: "Raven - OpenGL viewport", Width: 900, Height: 540 }, { appName: "viewport_opengl" });
