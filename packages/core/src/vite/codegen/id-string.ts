import { pageId } from "./routes.ts";

export function writeId(source: string, file: string): string {
	return source.replace(/createPage\("[^"]*"\)/, `createPage("${idFor(file)}")`);
}

export function assertId(source: string, file: string): void {
	const found = /createPage\("([^"]*)"\)/.exec(source);
	if (found === null || found[1] !== idFor(file)) throw new Error(file);
}

function idFor(file: string): string {
	const id = pageId(file);
	if (id === undefined) throw new Error(file);
	return id;
}
