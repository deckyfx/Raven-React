// babel-preset-solid has no types of its own: the plugin only hands it to Babel.
declare module "babel-preset-solid" {
	import type { PluginItem } from "@babel/core";

	const preset: PluginItem;
	export default preset;
}
