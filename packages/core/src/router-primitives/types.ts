import type { SearchParams } from "../url/index.ts";

export type PrefetchStrategy = false | "intent" | "render" | "viewport";

export type RouteMetaClient = {
	cacheDeferred?: boolean;
	gcTime?: number;
	prefetch?: PrefetchStrategy;
	prefetchGcTime?: number;
	prefetchStaleTime?: number;
	staleTime?: number;
};

export type RouteMetaStatic = {
	defer?: "resolve" | "stream";
	dynamicParams?: boolean;
	mode: "isr" | "static";
	revalidate?: number;
};

export type RouteMeta = {
	authenticate?: boolean;
	authorize?: boolean;
	client?: RouteMetaClient;
	intercept?: { from: readonly string[]; render: string };
	static?: RouteMetaStatic;
	tags?: readonly string[];
};

export type RouteData = {
	e: string;
	f?: string;
	o: RouteMeta;
	p: () => Promise<{ default: unknown }>;
	t: "r" | "x";
	v: string;
	x: string;
};

export type TreeNode = {
	c?: TreeNode;
	n?: string;
	o?: TreeNode;
	p?: TreeNode;
	q?: TreeNode;
	r?: RouteData;
	s: Record<string, TreeNode>;
};

export type MatchResult = {
	params: Record<string, string | string[]>;
	route: RouteData;
};

export interface Location<TParams = Record<string, string | string[]>, TSearch = SearchParams, THash = string> {
	hash: THash;
	params: TParams;
	pathname: string;
	search: TSearch;
	url: URL;
	variablePath: string;
	virtualPath: string;
}

export interface ComputeMatchIdOptions {
	loaderDeps?: (ctx: { search: SearchParams }) => unknown[];
	params: Record<string, string | string[]>;
	routeId: string;
	search: SearchParams;
}

export interface ParsedMatchId {
	deps: unknown[];
	params: Record<string, string | string[]>;
	routeId: string;
}
