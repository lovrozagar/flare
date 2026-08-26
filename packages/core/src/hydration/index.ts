import type { GlobalBoundaries } from "../boundaries/index.ts";
import { resolveCacheTags, type CachedMatch, type MatchCache } from "../caches/index.ts";
import { applyPerRouteHeads, initRouteHierarchy } from "../head-client/index.ts";
import { isRenderFn, retryImport } from "../internal.ts";
import type { LoadedRouteModule, LoadedRouteModules } from "../navigation/types.ts";
import type { ClientMatch, FlareProviderContext } from "../outlet/types.ts";
import type { HeadConfig } from "../route-builder/types.ts";
import { computeMatchId, deriveLayouts, matchRoute, toLocaleMatch } from "../router-primitives/index.ts";
import type { MatchResult, TreeNode } from "../router-primitives/types.ts";
import type { LocaleConfig } from "../locale.ts";
import { parseSearchParams, type SearchParams } from "../url/index.ts";

export async function loadRouteModules(
	pathname: string,
	routeTree: TreeNode,
	layouts: Record<string, () => Promise<{ default: unknown }>>,
	caseSensitive?: boolean,
	localeConfig?: LocaleConfig,
): Promise<LoadedRouteModules | null> {
	const match: MatchResult | null = matchRoute(routeTree, pathname, caseSensitive, toLocaleMatch(localeConfig));
	if (!match) return null;

	const layoutKeys = deriveLayouts(match.route.x);

	const promises: Promise<{ default: unknown } | null>[] = [
		retryImport(() => match.route.p() as Promise<{ default: unknown }>),
		...layoutKeys.map((key) => {
			const loader = layouts[key];
			if (!loader) return Promise.resolve(null);
			return retryImport(() => loader());
		}),
	];

	const [pageResult, ...layoutResults] = await Promise.all(promises);

	const rawPage = (pageResult?.default ?? pageResult) as LoadedRouteModule;
	const page: LoadedRouteModule = { ...rawPage, variablePath: match.route.v };
	const loadedLayouts: LoadedRouteModule[] = layoutResults
		.filter((r): r is { default: unknown } => r !== null)
		.map((r) => {
			const raw = (r.default ?? r) as LoadedRouteModule;
			return { ...raw, variablePath: "" };
		});

	return {
		layouts: loadedLayouts,
		page,
		params: match.params,
	};
}

export function buildMatches(ctx: FlareProviderContext, modules: LoadedRouteModules): void {
	const search: SearchParams =
		typeof window !== "undefined" ? parseSearchParams(new URL(window.location.href).searchParams) : {};
	const allModules: LoadedRouteModule[] = [...modules.layouts, modules.page];

	const clientMatches: ClientMatch[] = allModules.map((mod) => {
		const deps = mod.effectsConfig?.loaderDeps?.({ search }) ?? [];
		const matchId = computeMatchId({
			loaderDeps: () => deps,
			params: modules.params,
			routeId: mod.virtualPath,
			search,
		});
		const cached: CachedMatch | undefined = ctx.matchCache.get(matchId);

		return {
			_type: mod._type,
			error: cached?.error,
			errorRender: isRenderFn(mod.errorRender) ? mod.errorRender : undefined,
			loaderData: cached?.data,
			notFoundRender: isRenderFn(mod.notFoundRender) ? mod.notFoundRender : undefined,
			preloaderContext: cached?.preloaderContext,
			render: mod.render,
			unauthenticatedRender: isRenderFn(mod.unauthenticatedRender) ? mod.unauthenticatedRender : undefined,
			unauthorizedRender: isRenderFn(mod.unauthorizedRender) ? mod.unauthorizedRender : undefined,
			variablePath: mod.variablePath,
			virtualPath: mod.virtualPath,
		};
	});

	ctx.setMatches(clientMatches);
	ctx.setParams(modules.params);
}

export function extractRootBoundaries(rootLayout: LoadedRouteModule | undefined): GlobalBoundaries {
	const boundaries: GlobalBoundaries = {};
	if (!rootLayout) return boundaries;
	if (isRenderFn(rootLayout.errorRender)) boundaries.error = rootLayout.errorRender;
	if (isRenderFn(rootLayout.notFoundRender)) boundaries.notFound = rootLayout.notFoundRender;
	if (isRenderFn(rootLayout.unauthenticatedRender)) {
		boundaries.unauthenticated = rootLayout.unauthenticatedRender;
	}
	if (isRenderFn(rootLayout.unauthorizedRender)) {
		boundaries.unauthorized = rootLayout.unauthorizedRender;
	}
	return boundaries;
}

export function buildInitialMatches(
	modules: LoadedRouteModule[],
	matchCache: MatchCache,
	params: Record<string, string | string[]>,
	search: SearchParams,
	errorMap?: Map<string, Error>,
): ClientMatch[] {
	return modules.map((mod) => {
		const deps = mod.effectsConfig?.loaderDeps?.({ search }) ?? [];
		const matchId = computeMatchId({
			loaderDeps: () => deps,
			params,
			routeId: mod.virtualPath,
			search,
		});
		const cached = matchCache.get(matchId);
		return {
			_type: mod._type,
			error: errorMap?.get(mod.virtualPath),
			errorRender: isRenderFn(mod.errorRender) ? mod.errorRender : undefined,
			loaderData: cached?.data,
			notFoundRender: isRenderFn(mod.notFoundRender) ? mod.notFoundRender : undefined,
			preloaderContext: cached?.preloaderContext,
			render: mod.render,
			unauthenticatedRender: isRenderFn(mod.unauthenticatedRender) ? mod.unauthenticatedRender : undefined,
			unauthorizedRender: isRenderFn(mod.unauthorizedRender) ? mod.unauthorizedRender : undefined,
			variablePath: mod.variablePath,
			virtualPath: mod.virtualPath,
		};
	});
}

export interface HydrationState {
	e?: Array<{ message: string; name: string; source?: string; stack?: string }>;
	matches: Array<{
		loaderData: unknown;
		matchId: string;
		preloaderContext?: Record<string, unknown>;
	}>;
	params: Record<string, string | string[]>;
	pathname: string;
	ph?: Array<{ head: HeadConfig; matchId: string }>;
	q?: Array<{ data: unknown; key: unknown[]; staleTime?: number }>;
	resolvers: Map<string, { reject: (e: Error) => void; resolve: (d: unknown) => void }>;
	search: SearchParams;
}

export function populateMatchCache(
	matchCache: MatchCache,
	matches: HydrationState["matches"],
	perRouteHeads?: HydrationState["ph"],
): void {
	const headMap = new Map<string, HeadConfig>();
	if (perRouteHeads) {
		for (const h of perRouteHeads) {
			headMap.set(h.matchId, h.head);
		}
	}
	const now = Date.now();
	for (const m of matches) {
		matchCache.set({
			data: m.loaderData,
			headConfig: headMap.get(m.matchId),
			invalid: false,
			matchId: m.matchId,
			preloaderContext: m.preloaderContext,
			updatedAt: now,
		});
	}
}

export function applyMatchCacheTags(
	matchCache: MatchCache,
	modules: LoadedRouteModule[],
	params: Record<string, string | string[]>,
	search: SearchParams,
): void {
	for (const mod of modules) {
		const deps = mod.effectsConfig?.loaderDeps?.({ search }) ?? [];
		const matchId = computeMatchId({
			loaderDeps: () => deps,
			params,
			routeId: mod.virtualPath,
			search,
		});
		const entry = matchCache.get(matchId);
		if (!entry) continue;
		const tags = resolveCacheTags(mod.cache, params);
		if (!tags) continue;
		entry.tags = tags;
		matchCache.set(entry);
	}
}

export function hydrateHeadState(state: Pick<HydrationState, "ph">): void {
	if (state.ph) {
		/* First entry is root layout — its title is the fallback when pages don't define .head() */
		const rootTitle = state.ph[0]?.head.title;
		const matchIds: string[] = [];
		const headEntries: Array<{ head: (typeof state.ph)[number]["head"]; matchId: string }> = [];
		for (const h of state.ph) {
			matchIds.push(h.matchId);
			headEntries.push({ head: h.head, matchId: h.matchId });
		}
		initRouteHierarchy(matchIds, rootTitle);
		applyPerRouteHeads(headEntries);
	}
}
