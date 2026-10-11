type Handler = () => unknown;

export type LayoutModule = {
	notFoundRender?: Handler;
};

export type RouteNode = {
	id: string;
	path: string;
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

export type Match = {
	id?: string;
	notFoundRender?: Handler;
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
	if (normalized === undefined) return { notFoundRender: notFoundFor(router, path) };
	const page = router.routeTree.find((route) => route.path === normalized);
	if (page) return { id: page.id };
	return { notFoundRender: notFoundFor(router, normalized) };
}

function normalize(path: string, basePath: string): string | undefined {
	if (basePath === "/") return path;
	if (path === basePath || path === `${basePath}/`) return "/";
	return undefined;
}

function notFoundFor(router: Router, path: string): Handler | undefined {
	const root = router.layouts._root_;
	if (router.notFoundMode === "root") return root.notFoundRender;
	const chosen = router.layouts[longestLayout(path, router.layouts)];
	return chosen.notFoundRender ?? root.notFoundRender;
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
