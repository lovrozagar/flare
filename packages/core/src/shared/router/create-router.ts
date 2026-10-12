import type { ChainRecord } from "../route-builder/chain.ts";
import {
	idPattern,
	isRootFolder,
	matchParams,
	patternSegments,
	pickRoute,
	readParams,
	type RawParams,
} from "../route-tree/index.ts";

type Handler = () => unknown;

export type RouteModule = ChainRecord & {
	notFoundRender?: Handler;
};

export type LayoutModule = RouteModule;

export type RouteNode = {
	id: string;
	path: string;
	module: RouteModule;
};

export type ChainEntry = {
	id: string;
	kind: "layout" | "page";
	module: RouteModule;
};

export type RouterCache = {
	client?: { staleTime: number; gcTime: string } | false;
};

export type RouterOptions = {
	layouts: Record<string, LayoutModule>;
	routeTree: readonly RouteNode[];
	basePath?: string;
	notFoundMode?: "root" | "fuzzy";
	cache?: RouterCache;
};

// `chain` is root-down: the layouts that own the match, then the page. An unknown path has no page.
export type Match = {
	id?: string;
	params: RawParams;
	notFoundRender?: Handler;
	chain: readonly ChainEntry[];
};

export type Router = {
	layouts: RouterOptions["layouts"];
	routeTree: RouterOptions["routeTree"];
	basePath: string;
	caseSensitive: boolean;
	trailingSlash: "preserve" | "always" | "never";
	notFoundMode: "root" | "fuzzy";
	scrollRestoration: boolean;
	scrollRestorationBehavior: "instant" | "auto" | "smooth";
	scrollRestorationMaxEntries: number;
	routeCacheMaxEntries: number;
	prefetch: { modules: "all" | boolean; data: boolean };
	cache: { client: { staleTime: number; gcTime: string } | false };
	viewTransitions: boolean;
	match: (path: string) => Match;
};

const CLIENT_CACHE = { staleTime: 0, gcTime: "5m" } as const;

export function createRouter(options: RouterOptions): Router {
	const router: Router = {
		layouts: options.layouts,
		routeTree: options.routeTree,
		basePath: options.basePath ?? "/",
		caseSensitive: false,
		trailingSlash: "preserve",
		notFoundMode: options.notFoundMode ?? "root",
		scrollRestoration: true,
		scrollRestorationBehavior: "instant",
		scrollRestorationMaxEntries: 50,
		routeCacheMaxEntries: 100,
		prefetch: { modules: "all", data: false },
		cache: { client: CLIENT_CACHE },
		viewTransitions: false,
		match(path) {
			return resolve(router, path);
		},
	};
	return router;
}

function resolve(router: Router, path: string): Match {
	const options = { caseSensitive: router.caseSensitive };
	const local = stripBase(path, router.basePath);
	const picked =
		local === undefined
			? undefined
			: pickRoute(
					router.routeTree.map((node) => node.path),
					local,
					options,
				);
	const page = router.routeTree.find((node) => node.path === picked);
	if (page !== undefined && local !== undefined) {
		const params = readParams(page.path, local);
		const chain = [
			...layoutChain(router.layouts, page.id),
			{ id: page.id, kind: "page" as const, module: page.module },
		];
		return { id: page.id, params, chain };
	}
	const owner = notFoundOwner(router, local ?? path);
	if (owner === undefined) return { params: {}, chain: [] };
	const chain = layoutChain(router.layouts, owner);
	return { params: {}, notFoundRender: router.layouts[owner].notFoundRender ?? chain[0].module.notFoundRender, chain };
}

function stripBase(path: string, basePath: string): string | undefined {
	if (basePath === "/") return path;
	if (path === basePath) return "/";
	if (path.startsWith(`${basePath}/`)) return path.slice(basePath.length);
	return undefined;
}

// Every layout whose id is the given id or a segment prefix of it, root first.
function layoutChain(layouts: RouterOptions["layouts"], id: string): ChainEntry[] {
	return Object.keys(layouts)
		.filter((layout) => id === layout || id.startsWith(`${layout}/`))
		.sort((left, right) => left.length - right.length)
		.map((layout) => ({ id: layout, kind: "layout" as const, module: layouts[layout] }));
}

// "root" is the root layout that owns the path. "fuzzy" is the longest layout that owns it (B73). A layout's
// URL prefix is idPattern of its id, the same rule codegen uses for a page.
function notFoundOwner(router: Router, path: string): string | undefined {
	const candidates = Object.keys(router.layouts).filter((id) => router.notFoundMode === "fuzzy" || isRoot(id));
	const owners = candidates.filter((id) => owns(id, path, router.caseSensitive));
	return owners.toSorted(specific)[0];
}

function isRoot(id: string): boolean {
	return isRootFolder(id.slice(id.lastIndexOf("/") + 1));
}

function owns(id: string, path: string, caseSensitive: boolean): boolean {
	return matchParams(`${idPattern(id)}/[[...flareTail]]`, path, { caseSensitive }) !== undefined;
}

// More URL segments first, then the deeper id (a group inside its parent), then `_root_` over another root.
function specific(left: string, right: string): number {
	const segments = patternSegments(idPattern(right)).length - patternSegments(idPattern(left)).length;
	if (segments !== 0) return segments;
	const depth = right.split("/").length - left.split("/").length;
	if (depth !== 0) return depth;
	return Number(right.endsWith("_root_")) - Number(left.endsWith("_root_"));
}
