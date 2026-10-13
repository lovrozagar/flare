import type { BoundaryRecord, ClientCache, NotFoundRender, PrefetchTrigger } from "../route-builder/index.ts";
import type { ChainRecord, Intercept } from "../route-builder/chain.ts";
import type { Location, LocationRewrite } from "../url/index.ts";
import {
	idPattern,
	isRootFolder,
	matchParams,
	patternSegments,
	pickRoute,
	readParams,
	type RawParams,
} from "../route-tree/index.ts";

export type RouteModule = ChainRecord & {
	boundaries?: BoundaryRecord;
};

// A route module, or the lazy import codegen emits for it. loadChain awaits it (02-system step 10).
export type ModuleRef = RouteModule | (() => Promise<RouteModule>);

export type LayoutModule = ModuleRef;

// `response` marks a .response() page. Codegen sets it from the source, so routing knows it before the lazy module
// loads. A static record says so itself.
// `client` is the route's literal `cache.client`, which codegen copies onto the node so prefetch reads it before
// the lazy module loads (bit 12).
export type RouteNode = {
	id: string;
	path: string;
	response?: boolean;
	client?: ClientCache;
	intercept?: Intercept;
	module: ModuleRef;
};

export type ChainEntry = {
	id: string;
	kind: "layout" | "page";
	module: ModuleRef;
};

export type LoadedEntry = Omit<ChainEntry, "module"> & { module: RouteModule };

export type RouterCache = {
	client?: { staleTime: number; gcTime: string } | false;
};

// A view transition's direction comes from the history index delta. `info` is what an option function reads
// (dx/navigate.md).
export type TransitionDirection = "forward" | "back" | "same";
export type TransitionInfo = {
	direction: TransitionDirection;
	fromLocation: Location;
	toLocation: Location;
	pathChanged: boolean;
};
export type ViewTransitionOptions = {
	scope?: "auto" | "document" | ((info: TransitionInfo) => "auto" | "document");
	types?: string[] | ((info: TransitionInfo) => string[] | false);
};

// `modules: "all"` is legal only here (B64).
export type RouterPrefetch = PrefetchTrigger | { data?: PrefetchTrigger; modules?: PrefetchTrigger | "all" };

export type RouterOptions = {
	layouts: Record<string, LayoutModule>;
	routeTree: readonly RouteNode[];
	basePath?: string;
	notFoundMode?: "root" | "fuzzy";
	cache?: RouterCache;
	chunks?: Record<string, string>;
	prefetch?: RouterPrefetch;
	viewTransitions?: boolean | ViewTransitionOptions;
	rewrite?: LocationRewrite | undefined;
};

// `chain` is root-down: the layouts that own the match, then the page. An unknown path has no page, and its
// chain ends at the selected layout.
export type Match = {
	id?: string;
	params: RawParams;
	response?: boolean;
	client?: ClientCache;
	intercept?: Intercept;
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
	prefetch: { modules: PrefetchTrigger | "all"; data: PrefetchTrigger };
	cache: { client: { staleTime: number; gcTime: string } | false };
	viewTransitions: false | ViewTransitionOptions;
	chunks: Record<string, string>;
	rewrite?: LocationRewrite | undefined;
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
		prefetch: prefetchOf(options.prefetch),
		cache: { client: CLIENT_CACHE },
		viewTransitions: options.viewTransitions === true ? {} : (options.viewTransitions ?? false),
		chunks: options.chunks ?? {},
		rewrite: options.rewrite,
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
	if (page !== undefined && local !== undefined) return pageMatch(router, page, local);
	const owner = notFoundOwner(router, local ?? path);
	if (owner === undefined) return { params: {}, chain: [] };
	return { params: {}, chain: layoutChain(router.layouts, owner) };
}

// Awaits every lazy module of a chain, in parallel. A rejected import rejects the whole chain.
export function loadChain(chain: readonly ChainEntry[]): Promise<LoadedEntry[]> {
	return Promise.all(chain.map(async (entry) => ({ ...entry, module: await load(entry.module) })));
}

const imported = new WeakMap<() => Promise<RouteModule>, RouteModule>();

async function load(ref: ModuleRef): Promise<RouteModule> {
	if (typeof ref !== "function") return ref;
	const module = await ref();
	imported.set(ref, module);
	return module;
}

// The record behind a ModuleRef once loadChain imported it, so a later navigation reads its effects without
// waiting for the import again.
export function loadedModule(ref: ModuleRef): RouteModule | undefined {
	return typeof ref === "function" ? imported.get(ref) : ref;
}

// An unknown URL paints the selected layout's notFoundRender, else its root's (B77).
export function notFoundRenderOf(chain: readonly LoadedEntry[]): NotFoundRender | undefined {
	return chain.at(-1)?.module.boundaries?.notFoundRender ?? chain[0]?.module.boundaries?.notFoundRender;
}

// A string sets both fields. An object sets the fields it names and keeps the default for the other.
function prefetchOf(value: RouterPrefetch = {}): Router["prefetch"] {
	const fields = typeof value === "object" ? value : { data: value, modules: value };
	return { modules: fields.modules ?? "all", data: fields.data ?? false };
}

// The node's codegen literals win. A static record carries its own response, `cache.client`, and intercept.
function pageMatch(router: Router, page: RouteNode, local: string): Match {
	const chain = [...layoutChain(router.layouts, page.id), { id: page.id, kind: "page" as const, module: page.module }];
	const record = typeof page.module === "object" ? page.module : undefined;
	const response = page.response ?? record?.response !== undefined;
	const matched: Match = { id: page.id, params: readParams(page.path, local), response, chain };
	const client = page.client ?? record?.cache?.client;
	const intercept = page.intercept ?? record?.intercept;
	if (client !== undefined) matched.client = client;
	if (intercept !== undefined) matched.intercept = intercept;
	return matched;
}

function stripBase(path: string, basePath: string): string | undefined {
	if (basePath === "/") return path;
	if (path === basePath) return "/";
	if (path.startsWith(`${basePath}/`)) return path.slice(basePath.length);
	return undefined;
}

// Every layout whose id is the given id or a segment prefix of it, root first.
export function layoutChain(layouts: RouterOptions["layouts"], id: string): ChainEntry[] {
	return Object.entries(layouts)
		.filter(([layout]) => id === layout || id.startsWith(`${layout}/`))
		.sort(([left], [right]) => left.length - right.length)
		.map(([layout, module]) => ({ id: layout, kind: "layout" as const, module }));
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
