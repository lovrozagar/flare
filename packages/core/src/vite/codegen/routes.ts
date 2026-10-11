import { escapeSource } from "./escape.ts";

const PAGE = ".page.tsx";
const LAYOUT = ".layout.tsx";

type Item = { id: string; file: string };

export type RouteGen = { id: string; file: string; urls: string[]; params: Record<string, string> };

export type LayoutGen = { id: string; file: string };

export type GeneratedRoutes = { source: string; routes: RouteGen[]; layouts: LayoutGen[] };

type Part = { text?: string; optional?: string; params: Record<string, string> };

export function generateRoutes(files: readonly string[]): GeneratedRoutes {
	const pages: Item[] = [];
	const layouts: LayoutGen[] = [];
	for (const file of files) {
		if (file.endsWith(PAGE)) pages.push(item(file, PAGE));
		else if (file.endsWith(LAYOUT)) layouts.push(item(file, LAYOUT));
	}
	assertOne(pages);
	const routes = pages.map(toRoute);
	assertUnique(routes);
	assertShadow(routes);
	return { source: render(routes, layouts), routes, layouts };
}

function item(file: string, suffix: string): Item {
	const stem = file.slice(0, -suffix.length);
	return { file, id: stem.slice(0, stem.lastIndexOf("/")) };
}

function toRoute(page: Item): RouteGen {
	const segments: string[] = [];
	const params: Record<string, string> = {};
	let optional = "";
	for (const part of page.id.split("/")) {
		const read = readPart(part);
		if (read.text) segments.push(read.text);
		if (read.optional) optional = read.optional;
		Object.assign(params, read.params);
	}
	const base = segments.length === 0 ? "/" : `/${segments.join("/")}`;
	const urls = optional === "" ? [base] : [base, `${base === "/" ? "" : base}/${optional}`];
	return { id: page.id, file: page.file, urls, params };
}

function readPart(part: string): Part {
	if (isRoot(part) || part.startsWith("(")) return { params: {} };
	if (part.startsWith("[[...")) return { optional: "<rest>", params: { [part.slice(5, -2)]: "string[] | undefined" } };
	if (part.startsWith("[...")) return { text: part, params: { [part.slice(4, -1)]: "string[]" } };
	if (part.startsWith("[[")) return { optional: "<tag>", params: { [part.slice(2, -2)]: "string | undefined" } };
	if (part.startsWith("[_]")) return { text: `[${part.slice(3, -1)}]`, params: {} };
	if (part.startsWith("[")) return { text: part, params: { [part.slice(1, -1)]: "string" } };
	return { text: part, params: {} };
}

function isRoot(part: string): boolean {
	return part === "_root_" || part === "_admin_";
}

function assertOne(pages: readonly Item[]): void {
	const seen = new Map<string, Item>();
	for (const page of pages) {
		const prior = seen.get(page.id);
		if (prior) throw new Error(`two pages: ${prior.file}, ${page.file}`);
		seen.set(page.id, page);
	}
}

function assertUnique(routes: readonly RouteGen[]): void {
	const seen = new Map<string, RouteGen>();
	for (const route of routes) {
		for (const url of route.urls) {
			const prior = seen.get(url);
			if (prior) throw new Error(`duplicate url: ${prior.file}, ${route.file}`);
			seen.set(url, route);
		}
	}
}

function assertShadow(routes: readonly RouteGen[]): void {
	for (const route of routes) {
		const leaf = last(route.id);
		if (!leaf.startsWith("[...")) continue;
		const sibling = routes.find(
			(other) => other !== route && parent(other.id) === parent(route.id) && !last(other.id).startsWith("["),
		);
		if (sibling) throw new Error(`shadow: ${route.file}, ${sibling.file}`);
	}
}

function parent(id: string): string {
	return id.slice(0, id.lastIndexOf("/"));
}

function last(id: string): string {
	return id.slice(id.lastIndexOf("/") + 1);
}

function render(routes: readonly RouteGen[], layouts: readonly LayoutGen[]): string {
	const imports = [
		...routes.map((route, index) => `import * as route${index} from "./${escapeSource(route.file)}";`),
		...layouts.map((layout, index) => `import * as layout${index} from "./${escapeSource(layout.file)}";`),
	];
	const tree = routes.map((route, index) => `{ id: "${escapeSource(route.id)}", module: route${index} }`);
	const layoutList = layouts.map((layout, index) => `{ id: "${escapeSource(layout.id)}", module: layout${index} }`);
	return `${imports.join("\n")}\nexport const routeTree = [${tree.join(", ")}];\nexport const layouts = [${layoutList.join(", ")}];\n`;
}
