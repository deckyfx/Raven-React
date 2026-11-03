/** `with { type: "file" }`: the path of the file, inside the executable once compiled. */
declare module "*.so" {
	const path: string;
	export default path;
}
