import { idPattern, parseSegment, patternSegments, type Segment } from "../../shared/route-tree/index.ts";
import { escapeSource } from "./escape.ts";
import { scanRoute } from "./scan.ts";

const PAGE = ".page.tsx";
const LAYOUT = ".layout.tsx";
const ROOT_LAYOUT = ".root-layout.tsx";

type Item = { id: string; file: string };

// `path` is the bracket pattern the router matches. `urls` are display strings for errors and types.
export type RouteGen = { id: string; file: string; path: string; urls: string[]; params: Record<string, string> };

export type LayoutGen = { id: string; file: string };

export type GeneratedRoutes = { source: string; routes: RouteGen[]; layouts: LayoutGen[] };

export function defineRouteTree<T>(tree: T): T {
	return tree;
}

export function defineLayouts<T>(layouts: T): T {
	return layouts;
}

// The page id a file path gives, or undefined when the file is not a page.
export function pageId(file: string): string | undefined {
	return file.endsWith(PAGE) ? item(file, PAGE).id : undefined;
}

// `read` returns a route file's source. Each page and layout file must export `route` (dx/routes.md).
export function generateRoutes(files: readonly string[], read: (file: string) => string): GeneratedRoutes {
	const pages: Item[] = [];
	const layouts: LayoutGen[] = [];
	for (const file of files) {
		if (file.endsWith(PAGE)) pages.push(item(file, PAGE));
		else if (file.endsWith(ROOT_LAYOUT)) layouts.push(item(file, ROOT_LAYOUT));
		else if (file.endsWith(LAYOUT)) layouts.push(item(file, LAYOUT));
	}
	assertRoot(files, pages);
	assertExports([...pages, ...layouts], read);
	assertOne(pages);
	const routes = pages.map(toRoute);
	assertUnique(routes);
	assertShadow(routes);
	assertKinds(routes);
	return { source: render(routes, layouts), routes, layouts };
}

function item(file: string, suffix: string): Item {
	const stem = file.slice(0, -suffix.length);
	return { file, id: stem.slice(0, stem.lastIndexOf("/")) };
}

// The URL comes from idPattern, the same rule the router matches with, so the two cannot drift.
function toRoute(page: Item): RouteGen {
	const path = idPattern(page.id);
	const segments = patternSegments(path);
	const params: Record<string, string> = {};
	for (const segment of segments) {
		if (segment.kind === "static") continue;
		if (Object.hasOwn(params, segment.name)) throw new Error(`${page.file} repeated param ${segment.name}`);
		params[segment.name] = paramType(segment);
	}
	return { id: page.id, file: page.file, path, urls: urlsOf(segments), params };
}

function paramType(segment: Exclude<Segment, { kind: "static" }>): string {
	const base = segment.kind === "dynamic" ? "string" : "string[]";
	return segment.optional ? `${base} | undefined` : base;
}

// An optional segment gives two display URLs: without it, and with a `<tag>` or `<rest>` placeholder.
function urlsOf(segments: readonly Segment[]): string[] {
	const short = segments.flatMap((segment) => (isOptional(segment) ? [] : [display(segment)]));
	const long = segments.map(display);
	return segments.some(isOptional) ? [join(short), join(long)] : [join(long)];
}

function join(parts: readonly string[]): string {
	return `/${parts.join("/")}`;
}

function isOptional(segment: Segment): boolean {
	return segment.kind !== "static" && segment.optional;
}

function display(segment: Segment): string {
	if (segment.kind === "static") return segment.text;
	if (segment.optional) return segment.kind === "dynamic" ? "<tag>" : "<rest>";
	return segment.kind === "dynamic" ? `[${segment.name}]` : `[...${segment.name}]`;
}

function assertRoot(files: readonly string[], pages: readonly Item[]): void {
	if (pages.length === 0) return;
	if (files.some((file) => file.endsWith(".root-layout.tsx"))) return;
	throw new Error(`no root: ${pages.map((page) => page.file).join(", ")}`);
}

function assertExports(items: readonly Item[], read: (file: string) => string): void {
	for (const entry of items) {
		if (!scanRoute(entry.file, read(entry.file)).route) throw new Error(`${entry.file}: no route export`);
	}
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
		if (paramKind(last(route.id)) !== "catch-all") continue;
		const sibling = routes.find(
			(other) => other !== route && parent(other.id) === parent(route.id) && paramKind(last(other.id)) === undefined,
		);
		if (sibling) throw new Error(`shadow: ${route.file}, ${sibling.file}`);
	}
}

function assertKinds(routes: readonly RouteGen[]): void {
	const seen = new Map<string, string>();
	for (const route of routes) {
		const parts = route.id.split("/");
		for (const [index, folder] of parts.entries()) {
			const kind = paramKind(folder);
			if (kind === undefined) continue;
			const key = `${parts.slice(0, index).join("/")}:${kind}`;
			const prior = seen.get(key);
			if (prior !== undefined) throw new Error(`two params: ${prior}, ${route.file}`);
			seen.set(key, route.file);
		}
	}
}

// One bracket parser: a static folder, a group, and a root folder have no param kind.
function paramKind(folder: string): string | undefined {
	const segment = parseSegment(folder)[0];
	if (segment === undefined || segment.kind === "static") return undefined;
	return segment.optional ? `optional-${segment.kind}` : segment.kind;
}

function parent(id: string): string {
	return id.slice(0, id.lastIndexOf("/"));
}

function last(id: string): string {
	return id.slice(id.lastIndexOf("/") + 1);
}

function render(routes: readonly RouteGen[], layouts: readonly LayoutGen[]): string {
	const imports = [
		...routes.map((route, index) => `import { route as route${index} } from "./${escapeSource(route.file)}";`),
		...layouts.map((layout, index) => `import { route as layout${index} } from "./${escapeSource(layout.file)}";`),
	];
	const tree = routes.map(
		(route, index) => `{ id: "${escapeSource(route.id)}", path: "${escapeSource(route.path)}", module: route${index} }`,
	);
	const record = layouts.map((layout, index) => `"${escapeSource(layout.id)}": layout${index}`);
	return `${imports.join("\n")}\nexport const routeTree = [${tree.join(", ")}];\nexport const layouts = { ${record.join(", ")} };\n`;
}
