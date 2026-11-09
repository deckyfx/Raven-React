/**
 * The OpenGL 1.1, GLX and Xlib functions this example calls, through bun:ffi, and a context on
 * an X11 window. Only what the original calls: no loader, no WGL. On another window system
 * `GlContext.create` says so instead.
 */

import { dlopen, type Pointer } from "bun:ffi";
import { raven } from "@decky.fx/raven-tsx/react";

export const GL_COLOR_BUFFER_BIT = 0x4000;
export const GL_DEPTH_BUFFER_BIT = 0x0100;
export const GL_DEPTH_TEST = 0x0b71;
export const GL_FRONT_AND_BACK = 0x0408;
export const GL_LINE = 0x1b01;
export const GL_FILL = 0x1b02;
export const GL_PROJECTION = 0x1701;
export const GL_MODELVIEW = 0x1700;
export const GL_QUADS = 0x0007;
const GL_RENDERER = 0x1f01;

/** `sizeof(XWindowAttributes)`, and where it holds `Visual*`, on 64-bit Linux. */
const WINDOW_ATTRIBUTES_SIZE = 136;
const WINDOW_ATTRIBUTES_VISUAL = 24;
/** `sizeof(XVisualInfo)`, and where it holds `visualid`, on 64-bit Linux. */
const VISUAL_INFO_SIZE = 64;
const VISUAL_INFO_ID = 8;
const VISUAL_ID_MASK = 1;
/** The attribute of `glXGetConfig` that says whether a visual can render OpenGL at all. */
const GLX_USE_GL = 1;

/** Opens libGL, on the first context only: another system has no such library. */
function openGl() {
	return dlopen("libGL.so.1", {
		glXGetConfig: { args: ["ptr", "ptr", "i32", "ptr"], returns: "i32" },
		glXCreateContext: { args: ["ptr", "ptr", "ptr", "i32"], returns: "ptr" },
		glXMakeCurrent: { args: ["ptr", "u64", "ptr"], returns: "i32" },
		glXSwapBuffers: { args: ["ptr", "u64"], returns: "void" },
		glXDestroyContext: { args: ["ptr", "ptr"], returns: "void" },
		glGetString: { args: ["u32"], returns: "cstring" },
		glViewport: { args: ["i32", "i32", "i32", "i32"], returns: "void" },
		glClearColor: { args: ["f32", "f32", "f32", "f32"], returns: "void" },
		glClear: { args: ["u32"], returns: "void" },
		glEnable: { args: ["u32"], returns: "void" },
		glPolygonMode: { args: ["u32", "u32"], returns: "void" },
		glMatrixMode: { args: ["u32"], returns: "void" },
		glLoadIdentity: { args: [], returns: "void" },
		glFrustum: { args: ["f64", "f64", "f64", "f64", "f64", "f64"], returns: "void" },
		glTranslatef: { args: ["f32", "f32", "f32"], returns: "void" },
		glRotatef: { args: ["f32", "f32", "f32", "f32"], returns: "void" },
		glBegin: { args: ["u32"], returns: "void" },
		glEnd: { args: [], returns: "void" },
		glColor3f: { args: ["f32", "f32", "f32"], returns: "void" },
		glVertex3f: { args: ["f32", "f32", "f32"], returns: "void" },
	}).symbols;
}

/** Opens libX11, for the visual of a window. */
function openX11() {
	return dlopen("libX11.so.6", {
		XGetWindowAttributes: { args: ["ptr", "u64", "ptr"], returns: "i32" },
		XVisualIDFromVisual: { args: ["u64"], returns: "u64" },
		XGetVisualInfo: { args: ["ptr", "i64", "ptr", "ptr"], returns: "ptr" },
		XFree: { args: ["ptr"], returns: "i32" },
	}).symbols;
}

/** The OpenGL functions, for the scene. */
export type Gl = ReturnType<typeof openGl>;

/** An OpenGL context made current on the native window of a viewport. */
export class GlContext {
	private constructor(
		/** The functions of OpenGL. */
		readonly gl: Gl,
		private readonly display: Pointer,
		private readonly drawable: number,
		private readonly context: Pointer | bigint,
	) {}

	/**
	 * Makes a context on a window, with the visual the window was created with.
	 * @returns The context, or the reason why there is none.
	 */
	static create(native: raven.RNativeWindow): GlContext | string {
		const display = native.display;
		if (native.system !== raven.R_WINDOW_SYSTEM_X11 || !display) {
			return "This port only makes an OpenGL context on X11 (GLX). Start it with RAVEN_WINDOW_SYSTEM=x11.";
		}
		const drawable = native.window;
		let gl: ReturnType<typeof openGl>;
		let x11: ReturnType<typeof openX11>;
		try {
			gl = openGl();
			x11 = openX11();
		} catch (error) {
			return `Cannot load libGL or libX11: ${error instanceof Error ? error.message : String(error)}`;
		}

		const attributes = new Uint8Array(WINDOW_ATTRIBUTES_SIZE);
		if (!x11.XGetWindowAttributes(display, drawable, attributes)) {
			return "XGetWindowAttributes failed on the window of the viewport.";
		}
		const wanted = new Uint8Array(VISUAL_INFO_SIZE);
		const windowVisual = new DataView(attributes.buffer).getBigUint64(WINDOW_ATTRIBUTES_VISUAL, true);
		new DataView(wanted.buffer).setBigUint64(VISUAL_INFO_ID, x11.XVisualIDFromVisual(windowVisual), true);
		const visual = x11.XGetVisualInfo(display, VISUAL_ID_MASK, wanted, new Int32Array(1));
		if (!visual) {
			return "XGetVisualInfo found no visual for the window of the viewport.";
		}
		// (a visual without OpenGL would make glXCreateContext raise an X error, not return null)
		const usesGl = new Int32Array(1);
		if (gl.glXGetConfig(display, visual, GLX_USE_GL, usesGl) !== 0 || usesGl[0] === 0) {
			x11.XFree(visual);
			return "The window of the viewport has a visual that cannot render OpenGL.";
		}
		const context = gl.glXCreateContext(display, visual, null, 1);
		x11.XFree(visual);
		if (!context) {
			return "Cannot create an OpenGL context on the viewport.";
		}
		if (!gl.glXMakeCurrent(display, drawable, context)) {
			gl.glXDestroyContext(display, context);
			return "Cannot create an OpenGL context on the viewport.";
		}
		return new GlContext(gl, display, drawable, context);
	}

	/** The name of what renders: the driver says it, this is no claim of this example. */
	get renderer(): string {
		return this.gl.glGetString(GL_RENDERER)?.toString() ?? "";
	}

	/** Shows what was drawn. */
	swap(): void {
		this.gl.glXSwapBuffers(this.display, this.drawable);
	}

	/** Lets the context go. */
	destroy(): void {
		this.gl.glXMakeCurrent(this.display, 0, null);
		this.gl.glXDestroyContext(this.display, this.context);
	}
}
