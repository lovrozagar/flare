import type { ChainRecord } from "../route-builder/chain.ts";

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
	const normalized = normalize(path, router.basePath);
	const page = normalized === undefined ? undefined : router.routeTree.find((route) => route.path === normalized);
	if (page) {
		const chain = [
			...layoutChain(router.layouts, page.id),
			{ id: page.id, kind: "page" as const, module: page.module },
		];
		return { id: page.id, chain };
	}
	const owner = notFoundOwner(router, normalized ?? path);
	return { notFoundRender: notFoundFor(router, owner), chain: layoutChain(router.layouts, owner) };
}

// Every layout whose id is the given id or a segment prefix of it, root first.
function layoutChain(layouts: RouterOptions["layouts"], id: string): ChainEntry[] {
	return Object.keys(layouts)
		.filter((layout) => id === layout || id.startsWith(`${layout}/`))
		.sort((left, right) => left.length - right.length)
		.map((layout) => ({ id: layout, kind: "layout" as const, module: layouts[layout] }));
}

function normalize(path: string, basePath: string): string | undefined {
	if (basePath === "/") return path;
	if (path === basePath || path === `${basePath}/`) return "/";
	return undefined;
}

// "root" is the root layout. "fuzzy" is the longest layout that owns the path (B73).
function notFoundOwner(router: Router, path: string): string {
	if (router.notFoundMode === "root") return "_root_";
	return longestLayout(path, router.layouts);
}

function notFoundFor(router: Router, owner: string): Handler | undefined {
	return router.layouts[owner].notFoundRender ?? router.layouts._root_.notFoundRender;
}

function longestLayout(path: string, layouts: RouterOptions["layouts"]): string {
	const ids = Object.keys(layouts).sort((left, right) => layoutPath(right).length - layoutPath(left).length);
	for (const id of ids) {
		if (owns(path, layoutPath(id))) return id;
	}
	return "_root_";
}

function layoutPath(id: string): string {
	const slash = id.indexOf("/");
	if (slash === -1) return "/";
	return `/${id.slice(slash + 1)}`;
}

function owns(path: string, prefix: string): boolean {
	if (path === prefix) return true;
	if (prefix === "/") return false;
	return path.startsWith(`${prefix}/`);
}
