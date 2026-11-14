/// <reference path="./babel-preset-solid.d.ts" />
/**
 * How Solid's TSX is compiled for this package, on Bun (`./plugin`) and on Node.js (`./register`):
 * Babel with `babel-preset-solid`, in its universal mode, for the renderer of
 * `@decky.fx/raven-tsx/solid/renderer`. Only the JSX is compiled: the types stay, for the runtime
 * to take away.
 */

import type { PluginItem, TransformOptions } from "@babel/core";

/** The files compiled by default: `.tsx` and `.jsx`, but those of node_modules, which come compiled. */
export const SOURCES = /^(?!.*[\\/]node_modules[\\/]).*\.[jt]sx$/;

/** Whether a file is TypeScript, whose types the runtime takes away after Babel. */
export const isTypeScript = (path: string): boolean => /\.tsx$/.test(path);

/** The options of Babel for a file, with the preset of Solid as the runtime loaded it. */
export function solidBabelOptions(path: string, solid: PluginItem): TransformOptions {
	return {
		filename: path,
		babelrc: false,
		configFile: false,
		// (an error says the line of the source: the runtimes do not read Babel's source maps)
		retainLines: true,
		parserOpts: { plugins: isTypeScript(path) ? ["jsx", "typescript"] : ["jsx"] },
		presets: [[solid, { generate: "universal", moduleName: "@decky.fx/raven-tsx/solid/renderer" }]],
	};
}
