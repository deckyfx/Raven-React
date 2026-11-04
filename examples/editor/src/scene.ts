/** The scene of the editor: plain data, with no widget and no Raven in it. */

/** How many objects a scene can hold. */
export const MAX_OBJECTS = 64;

/** The colors an object can have, as red, green and blue from 0 to 1. */
export const PALETTE: readonly (readonly [number, number, number])[] = [
	[1.0, 0.55, 0.15],
	[0.25, 0.55, 1.0],
	[0.3, 0.85, 0.45],
	[1.0, 0.4, 0.7],
];

/** The names of the palette, in its order. */
export const COLOR_NAMES: readonly string[] = ["Orange", "Blue", "Green", "Pink"];

/** A disc of the scene. Positions are fractions of the viewport. */
export interface SceneObject {
	readonly id: number;
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly radius: number;
	readonly speed: number;
	readonly phase: number;
	readonly color: number;
	readonly visible: boolean;
}

/** Makes the object number `created` of a session, the same one each time. */
export function makeObject(created: number, name?: string): SceneObject {
	return {
		id: created,
		name: name ?? `Object ${created}`,
		x: 0.2 + (0.6 * ((created * 37) % 100)) / 100,
		y: 0.25 + (0.5 * ((created * 61) % 100)) / 100,
		radius: 0.08 + 0.02 * (created % 4),
		speed: 1 + 0.25 * (created % 5),
		phase: created * 1.7,
		color: (created - 1) % 4,
		visible: true,
	};
}

/** The topmost visible object at a point of the viewport, or null. `aspect` is its width over its height. */
export function objectAt(objects: readonly SceneObject[], u: number, v: number, aspect: number): SceneObject | null {
	for (let i = objects.length - 1; i >= 0; i--) {
		const object = objects[i];
		if (object?.visible) {
			const dx = (u - object.x) * aspect;
			const dy = v - object.y;
			if (dx * dx + dy * dy < object.radius * object.radius * 1.5) {
				return object;
			}
		}
	}
	return null;
}
