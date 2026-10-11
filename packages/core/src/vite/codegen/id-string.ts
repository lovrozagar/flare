import { generateRoutes } from "./routes.ts";

export function writeId(source: string, file: string): string {
	return source.replace(/createPage\("[^"]*"\)/, `createPage("${idFor(file)}")`);
}

export function assertId(source: string, file: string): void {
	const found = /createPage\("([^"]*)"\)/.exec(source) as RegExpExecArray;
	if (found[1] !== idFor(file)) throw new Error(file);
}

function idFor(file: string): string {
	return (generateRoutes([file]).routes[0] as { id: string }).id;
}
