import { idPattern, isRootFolder, parseSegment, patternSegments, type Segment } from "../../shared/route-tree/index.ts";
import { escapeSource } from "./escape.ts";
import { scanRoute } from "./scan.ts";

const PAGE = ".page.tsx";
const LAYOUT = ".layout.tsx";
const ROOT_LAYOUT = ".root-layout.tsx";
const SEGMENT = ".segment.ts";

type Item = { id: string; file: string };

// `path` is the bracket pattern the router matches. `urls` are display strings for errors and types.
export type RouteGen = {
	id: string;
	file: string;
	path: string;
	urls: string[];
	params: Record<string, string>;
	response: boolean;
};

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
	return file.endsWith(PAGE) ? pageItem(file).id : undefined;
}

// `read` returns a route file's source. Each page and layout file must export `route` (dx/routes.md).
export function generateRoutes(
	files: readonly string[],
	read: (file: string) => string,
	options: { routesDir?: string } = {},
): GeneratedRoutes {
	const pages: Item[] = [];
	const layouts: LayoutGen[] = [];
	for (const file of files) {
		if (file.endsWith(PAGE)) pages.push(pageItem(file));
		else if (file.endsWith(ROOT_LAYOUT)) layouts.push(item(file, ROOT_LAYOUT));
		else if (file.endsWith(LAYOUT)) layouts.push(item(file, LAYOUT));
	}
	assertRoot(files, pages);
	assertApart(files);
	const scans = assertExports([...pages, ...layouts], read);
	assertOne(pages);
	const routes = pages.map((page) => toRoute(page, scans.get(page.file) === true));
	assertUnique(routes);
	assertShadow(routes);
	assertKinds(routes);
	return { source: render(routes, layouts, options.routesDir ?? "src/routes"), routes, layouts };
}

// A root's home page shares its folder with the root layout, so its id ends in "/": `_root_/` (dx/routes.md).
function pageItem(file: string): Item {
	const page = item(file, PAGE);
	const folder = page.id.slice(page.id.lastIndexOf("/") + 1);
	return isRootFolder(folder) ? { ...page, id: `${page.id}/` } : page;
}

function item(file: string, suffix: string): Item {
	const stem = file.slice(0, -suffix.length);
	return { file, id: stem.slice(0, stem.lastIndexOf("/")) };
}

// The URL comes from idPattern, the same rule the router matches with, so the two cannot drift.
function toRoute(page: Item, response: boolean): RouteGen {
	const path = idPattern(page.id);
	const segments = patternSegments(path);
	const params: Record<string, string> = {};
	for (const segment of segments) {
		if (segment.kind === "static") continue;
		if (Object.hasOwn(params, segment.name)) throw new Error(`${page.file} repeated param ${segment.name}`);
		params[segment.name] = paramType(segment);
	}
	return { id: page.id, file: page.file, path, urls: urlsOf(segments), params, response };
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

// A layout in the folder of a page or a segment would share its id. Only a root folder holds both.
function assertApart(files: readonly string[]): void {
	for (const layout of files) {
		if (!layout.endsWith(LAYOUT) || layout.endsWith(ROOT_LAYOUT)) continue;
		const folder = layout.slice(0, layout.lastIndexOf("/") + 1);
		const beside = files.find(
			(file) =>
				file.startsWith(folder) &&
				!file.slice(folder.length).includes("/") &&
				(file.endsWith(PAGE) || file.endsWith(SEGMENT)),
		);
		if (beside !== undefined) throw new Error(`layout beside page: ${layout}, ${beside}`);
	}
}

// Each file is parsed once. The result maps a file to whether its chain calls .response().
function assertExports(items: readonly Item[], read: (file: string) => string): Map<string, boolean> {
	const responses = new Map<string, boolean>();
	for (const entry of items) {
		const scan = scanRoute(entry.file, read(entry.file));
		if (!scan.route) throw new Error(`${entry.file}: no route export`);
		responses.set(entry.file, scan.response);
	}
	return responses;
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

// Every route module is a lazy import that resolves its `route` export, so a route's code loads only when a
// match needs it. `chunks` maps each id to that module's project-relative source path, the dev chunk URL that
// bit 12 rewrites to the hashed file (02-system).
function render(routes: readonly RouteGen[], layouts: readonly LayoutGen[], routesDir: string): string {
	const tree = routes.map(
		(route) =>
			`{ id: "${escapeSource(route.id)}", path: "${escapeSource(route.path)}", ${route.response ? "response: true, " : ""}module: ${lazy(route.file)} }`,
	);
	const record = layouts.map((layout) => `"${escapeSource(layout.id)}": ${lazy(layout.file)}`);
	const chunks = [...routes, ...layouts].map(
		(item) => `"${escapeSource(item.id)}": "/${escapeSource(`${routesDir}/${item.file}`)}"`,
	);
	return `export const routeTree = [${tree.join(", ")}];\nexport const layouts = { ${record.join(", ")} };\nexport const chunks = { ${chunks.join(", ")} };\n`;
}

function lazy(file: string): string {
	return `() => import("./${escapeSource(file)}").then((loaded) => loaded.route)`;
}
