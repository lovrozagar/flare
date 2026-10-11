import { generateRoutes, type RouteGen } from "./routes.ts";

export function writeId(source: string, file: string): string {
	return source.replace(/createPage\("[^"]*"\)/, `createPage("${idFor(file)}")`);
}

export function assertId(source: string, file: string): void {
	const found = /createPage\("([^"]*)"\)/.exec(source);
	if (found === null || found[1] !== idFor(file)) throw new Error(file);
}

function idFor(file: string): string {
	const route: RouteGen | undefined = generateRoutes([file, "_root_/root.root-layout.tsx"]).routes[0];
	if (route === undefined) throw new Error(file);
	return route.id;
}
