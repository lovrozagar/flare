import type { DeferContext } from "../defer/index.ts";
import { containsDeferred, createDeferContext } from "../defer/index.ts";
import { parseMilliseconds, parseSeconds } from "../duration/index.ts";
import {
	isNotFoundError,
	isRedirectResponse,
	isUnauthenticatedError,
	isUnauthorizedError,
	notFound,
	redirect,
	ServerFnValidationError,
	UnauthenticatedError,
	UnauthorizedError,
	unauthenticated,
	unauthorized,
} from "../errors/index.ts";
import { mergeHeadConfigs, mergeResponseHeaders } from "../internal.ts";
import { warn } from "../logger.ts";
import { serializeLoaderData } from "../ndjson-server/index.ts";
import type {
	AuthenticateMode,
	CacheConfig,
	CdnCacheConfig,
	EffectsConfig,
	HeadConfig,
	InputConfig,
	LoaderCause,
	ResponseHeaders,
} from "../route-builder/types.ts";
import { buildLocation } from "../router-primitives/location.ts";
import { computeMatchId } from "../router-primitives/match-id.ts";
import type { Location } from "../router-primitives/types.ts";
import { getServerContext, serverLog } from "@lovrozagar/flare/server-context";
import { buildVaryHeader } from "../server-handler/etag.ts";
import type { FlareStore } from "../store/index.ts";
import { noopTracer } from "../tracing/noop.ts";
import type { FlareTracer } from "../tracing/types.ts";
import { buildUrl, parseSearchParams, serializeSearchParams, type SearchParams } from "../url/index.ts";
import { isStandardSchema, issuesToFlattenedError } from "../validation/index.ts";

export type { LoaderCause };

export interface ResolvedRoute {
	_type: "layout" | "render" | "response" | "root-layout";
	authenticate?: unknown[];
	authenticateMode?: AuthenticateMode;
	authorize?: (ctx: Record<string, unknown>) => boolean | Promise<boolean>;
	effectsConfig?: EffectsConfig<SearchParams, SearchParams>;
	errorRender?: (props: Record<string, unknown>) => unknown;
	head?: (ctx: Record<string, unknown>) => HeadConfig;
	headReplace?: boolean;
	headers?: (ctx: Record<string, unknown>) => ResponseHeaders;
	inputConfig?: InputConfig<Record<string, string>, Record<string, string>>;
	loader?: (ctx: Record<string, unknown>) => unknown | Promise<unknown>;
	notFoundRender?: (props: Record<string, unknown>) => unknown;
	cache?: CacheConfig;
	preloader?: (ctx: Record<string, unknown>) => unknown | Promise<unknown>;
	render?: (props: Record<string, unknown>) => unknown;
	response?: (ctx: Record<string, unknown>) => Response | Promise<Response>;
	unauthenticatedRender?: (props: Record<string, unknown>) => unknown;
	unauthorizedRender?: (props: Record<string, unknown>) => unknown;
	variablePath: string;
	virtualPath: string;
}

export type AuthenticateFn<TEnv = unknown> = (
	ctx: AuthenticateFnContext<TEnv>,
) => unknown | null | Promise<unknown | null>;

export interface AuthenticateFnContext<TEnv = unknown> {
	callerData?: unknown[];
	env: TEnv;
	request: Request;
	serverContext: Record<string, unknown>;
	url: URL;
}

export interface PipelineConfig<TEnv = unknown> {
	abortController: AbortController;
	authenticateFn?: AuthenticateFn<TEnv>;
	cause: LoaderCause;
	env: TEnv;
	localeConfig?: { defaultLocale: string; locales?: readonly string[]; paramName?: string };
	params?: Record<string, string | string[]>;
	prefetch: boolean;
	queryClient?: unknown;
	request: Request;
	routes: ResolvedRoute[];
	ssrCacheDefaults?: import("../route-builder/types").SsrCacheConfig;
	store?: FlareStore | ((env: TEnv) => FlareStore);
	tracer?: FlareTracer;
	url: URL;
}

export interface PipelineResult {
	auth: unknown | null;
	deferContexts: Map<string, DeferContext>;
	matches: PipelineMatch[];
}

export interface PipelineMatch {
	cacheHit?: boolean;
	deferContext: DeferContext;
	error?: Error;
	headConfig?: HeadConfig;
	headError?: Error;
	headersError?: Error;
	loaderData: unknown;
	matchId: string;
	preloaderContext: Record<string, unknown>;
	responseHeaders?: ResponseHeaders;
	route: ResolvedRoute;
	status: "error" | "success";
}

/**
 * Build HTTP cache headers from CdnCacheConfig.
 * Returns `Cache-Control`, optionally `Surrogate-Key`, and `Vary` from user config.
 */
function buildCdnCacheHeaders(cdn: CdnCacheConfig, params: Record<string, string | string[]>): ResponseHeaders {
	const headers: ResponseHeaders = {};

	if (cdn.maxAge !== undefined) {
		const scope = cdn.private ? "private" : "public";
		let cc = `${scope}, max-age=${parseSeconds(cdn.maxAge)}`;
		if (cdn.swr !== undefined) {
			cc += `, stale-while-revalidate=${parseSeconds(cdn.swr)}`;
		}
		headers["Cache-Control"] = cc;
	}

	if (cdn.tags) {
		const tagList = typeof cdn.tags === "function" ? cdn.tags({ params }) : cdn.tags;
		if (tagList.length > 0) {
			headers["Surrogate-Key"] = tagList.join(" ");
		}
	}

	if (cdn.vary && cdn.vary.length > 0) {
		headers["Vary"] = buildVaryHeader(cdn.vary);
	}

	return headers;
}

interface InternalRoute {
	authenticateError?: Error;
	authorizeError?: Error;
	location: Location<Record<string, string | string[]>, SearchParams, string>;
	preloaderError?: Error;
	preloaderSnapshot: Record<string, unknown>;
	route: ResolvedRoute;
	validatedParams: Record<string, string | string[]>;
	validatedSearch: SearchParams;
}

function defaultSsrCacheKey(
	virtualPath: string,
	params: Record<string, string | string[]>,
	search: SearchParams,
): string {
	const base = `flare:${virtualPath}:${JSON.stringify(params)}`;
	const searchPart = serializeSearchParams(search);
	return searchPart.length > 0 ? `${base}:${searchPart}` : base;
}

function isRequiredAuth(route: ResolvedRoute): boolean {
	return route.authenticate !== undefined && route.authenticateMode !== "optional";
}

/** Store UnauthenticatedError on the first required-auth route and every subsequent match so loaders skip. */
function attachUnauthenticated(internalRoutes: InternalRoute[], err: UnauthenticatedError): void {
	let first = -1;
	for (let i = 0; i < internalRoutes.length; i++) {
		const ir = internalRoutes[i];
		if (ir && isRequiredAuth(ir.route)) {
			first = i;
			break;
		}
	}
	if (first < 0) return;
	for (let j = first; j < internalRoutes.length; j++) {
		const ir = internalRoutes[j];
		if (ir) ir.authenticateError = err;
	}
}

/** Phase 1: Validate route inputs (params + search) and build location objects. */
async function buildInternalRoutes(
	routes: ResolvedRoute[],
	url: URL,
	rawParams: Record<string, string | string[]>,
): Promise<InternalRoute[]> {
	const result: InternalRoute[] = [];

	for (const route of routes) {
		let validatedParams: Record<string, string | string[]> = rawParams;
		let validatedSearch: SearchParams = parseSearchParams(url.searchParams);

		if (route.inputConfig?.params) {
			const pv = route.inputConfig.params;
			if (isStandardSchema(pv)) {
				const result = await pv["~standard"].validate(rawParams);
				if (result.issues) throw new ServerFnValidationError(issuesToFlattenedError(result.issues));
				validatedParams = result.value;
			} else if (typeof pv === "function") {
				validatedParams = pv(rawParams);
			} else {
				validatedParams = pv.parse(rawParams);
			}
		}

		if (route.inputConfig?.searchParams) {
			const sv = route.inputConfig.searchParams;
			if (isStandardSchema(sv)) {
				const result = await sv["~standard"].validate(parseSearchParams(url.searchParams));
				if (result.issues) throw new ServerFnValidationError(issuesToFlattenedError(result.issues));
				validatedSearch = result.value;
			} else if (typeof sv === "function") {
				validatedSearch = sv(url.searchParams);
			} else {
				validatedSearch = sv.parse(url.searchParams);
			}
		}

		const location = buildLocation(url, validatedParams, route.virtualPath, route.variablePath, validatedSearch);

		result.push({
			location,
			preloaderSnapshot: {},
			route,
			validatedParams,
			validatedSearch,
		});
	}

	return result;
}

export async function runPipeline<TEnv = unknown>(config: PipelineConfig<TEnv>): Promise<PipelineResult> {
	const { abortController, cause, env, localeConfig, prefetch, request, routes, ssrCacheDefaults, url } = config;
	const tracer = config.tracer ?? noopTracer;
	const throwHelpers = { notFound, redirect, unauthenticated, unauthorized };
	const urlHelpers = {
		buildUrl: (options: {
			hash?: string;
			params?: Record<string, unknown>;
			search?: Record<string, unknown>;
			to: string;
		}) => buildUrl(options),
	};
	const logHelpers = {
		error: (...args: unknown[]) => serverLog("error", ...args),
		log: (...args: unknown[]) => serverLog("log", ...args),
		warn: (...args: unknown[]) => serverLog("warn", ...args),
	};
	const baseHelpers = { ...throwHelpers, ...urlHelpers, ...logHelpers };

	/* Phase 1: Input Validation */
	const validationSpan = tracer.startSpan("flare.pipeline.validation");
	const internalRoutes = await buildInternalRoutes(routes, url, config.params ?? {});
	validationSpan.end();

	/* Phase 2: Authentication */
	const authSpan = tracer.startSpan("flare.pipeline.authenticate");
	let auth: unknown | null = null;
	const hasAnyAuth = internalRoutes.some((r) => r.route.authenticate !== undefined);

	if (hasAnyAuth) {
		const hasRequired = internalRoutes.some((r) => isRequiredAuth(r.route));
		if (!config.authenticateFn) {
			if (hasRequired) {
				authSpan.setStatus("error");
				attachUnauthenticated(internalRoutes, new UnauthenticatedError());
			}
		} else {
			const firstAuthRoute = internalRoutes.find((r) => r.route.authenticate !== undefined);
			try {
				auth = await config.authenticateFn({
					callerData: firstAuthRoute?.route.authenticate as unknown[] | undefined,
					env,
					request,
					serverContext: getServerContext(),
					url,
				});
			} catch (e: unknown) {
				if (isRedirectResponse(e) || isNotFoundError(e)) {
					authSpan.setStatus("error");
					authSpan.end();
					throw e;
				}
				if (isUnauthenticatedError(e)) {
					authSpan.setStatus("error");
					attachUnauthenticated(internalRoutes, e);
					auth = null;
				} else {
					authSpan.setStatus("error");
					authSpan.end();
					throw e;
				}
			}

			if (!internalRoutes.some((r) => r.authenticateError) && (auth === null || auth === undefined) && hasRequired) {
				authSpan.setStatus("error");
				attachUnauthenticated(internalRoutes, new UnauthenticatedError());
			}
		}
	}
	authSpan.end();

	/* Eagerly validate locale param — invalid locale in [[locale]] → 404 */
	if (localeConfig?.locales && config.params) {
		const paramName = localeConfig.paramName ?? "locale";
		const val = config.params[paramName];
		if (typeof val === "string" && !localeConfig.locales.includes(val)) {
			throw notFound();
		}
	}

	/* Phase 3: Preloader + Authorize (sequential, interleaved per route) */
	const preloadAuthorizeSpan = tracer.startSpan("flare.pipeline.preload_authorize");
	let preloaderContext: Record<string, unknown> = {};

	const makeLocale = (params: Record<string, string | string[]>) => () => {
		if (!localeConfig) return "en";
		const paramName = localeConfig.paramName ?? "locale";
		const val = params[paramName];
		return (typeof val === "string" ? val : undefined) ?? localeConfig.defaultLocale;
	};

	for (const ir of internalRoutes) {
		if (ir.authenticateError) continue;

		/* 3a. Preloader */
		if (ir.route.preloader && !ir.preloaderError) {
			const preloaderSpan = tracer.startSpan(`flare.pipeline.preloader:${ir.route.virtualPath}`);
			try {
				const result = await ir.route.preloader({
					...baseHelpers,
					abortController,
					auth,
					env,
					locale: makeLocale(ir.validatedParams),
					location: ir.location,
					preloaderContext: { ...preloaderContext },
					request,
					serverContext: getServerContext(),
				});
				if (result && typeof result === "object") {
					preloaderContext = { ...preloaderContext, ...(result as Record<string, unknown>) };
				}
				preloaderSpan.end();
			} catch (e: unknown) {
				/* Control flow errors re-throw — redirect/notFound/auth are intentional */
				if (isRedirectResponse(e) || isNotFoundError(e) || isUnauthenticatedError(e) || isUnauthorizedError(e)) {
					preloaderSpan.setStatus("error");
					preloaderSpan.end();
					preloadAuthorizeSpan.setStatus("error");
					preloadAuthorizeSpan.end();
					throw e;
				}
				ir.preloaderError = e instanceof Error ? e : new Error(String(e));
				preloaderSpan.setStatus("error");
				preloaderSpan.end();
			}
		}

		ir.preloaderSnapshot = { ...preloaderContext };

		/* Cascade preloader error to descendants (layout/root-layout scope) */
		if (ir.preloaderError && (ir.route._type === "layout" || ir.route._type === "root-layout")) {
			const idx = internalRoutes.indexOf(ir);
			for (let j = idx + 1; j < internalRoutes.length; j++) {
				const sub = internalRoutes[j];
				if (sub?.route.virtualPath.startsWith(ir.route.virtualPath)) {
					sub.preloaderError = ir.preloaderError;
				}
			}
		}

		/* 3b. Authorize — failure stored per-route so unauthorizedRender boundary can render */
		if (ir.route.authorize && !ir.preloaderError) {
			const authorizeSpan = tracer.startSpan(`flare.pipeline.authorize:${ir.route.virtualPath}`);
			const allowed = await ir.route.authorize({
				...baseHelpers,
				abortController,
				auth,
				env,
				locale: makeLocale(ir.validatedParams),
				location: ir.location,
				preloaderContext: ir.preloaderSnapshot,
				request,
				serverContext: getServerContext(),
			});
			if (allowed === false) {
				ir.authorizeError = new UnauthorizedError();
				/* Propagate auth failure to all subsequent routes so their loaders don't run */
				const idx = internalRoutes.indexOf(ir);
				for (let j = idx + 1; j < internalRoutes.length; j++) {
					const subsequent = internalRoutes[j];
					if (subsequent) subsequent.authorizeError = new UnauthorizedError();
				}
				authorizeSpan.setStatus("error");
				authorizeSpan.end();
				break;
			}
			authorizeSpan.end();
		}
	}
	preloadAuthorizeSpan.end();

	/* Resolve store (factory or direct) */
	let resolvedStore: FlareStore | undefined;
	if (config.store) {
		resolvedStore = typeof config.store === "function" ? config.store(env) : config.store;
	}

	/* Phase 4: Loaders (parallel) */
	const loadersSpan = tracer.startSpan("flare.pipeline.loaders");
	const deferContexts = new Map<string, DeferContext>();
	const matchPromises = internalRoutes.map(async (ir): Promise<PipelineMatch> => {
		const search = ir.validatedSearch;
		const matchId = computeMatchId({
			loaderDeps: ir.route.effectsConfig?.loaderDeps as ((opts: { search: SearchParams }) => unknown[]) | undefined,
			params: ir.validatedParams,
			routeId: ir.route.virtualPath,
			search,
		});

		const deferContext = createDeferContext(matchId, { prefetch: config.prefetch });
		deferContexts.set(matchId, deferContext);

		if (ir.authenticateError) {
			return {
				deferContext,
				error: ir.authenticateError,
				loaderData: undefined,
				matchId,
				preloaderContext: ir.preloaderSnapshot,
				route: ir.route,
				status: "error",
			};
		}

		/* Authorize failure stored in phase 3b — skip loader, produce error match */
		if (ir.authorizeError) {
			return {
				deferContext,
				error: ir.authorizeError,
				loaderData: undefined,
				matchId,
				preloaderContext: ir.preloaderSnapshot,
				route: ir.route,
				status: "error",
			};
		}

		/* Preloader failure stored in phase 3a — skip loader, produce error match */
		if (ir.preloaderError) {
			return {
				deferContext,
				error: ir.preloaderError,
				loaderData: undefined,
				matchId,
				preloaderContext: ir.preloaderSnapshot,
				route: ir.route,
				status: "error",
			};
		}

		if (!ir.route.loader) {
			return {
				deferContext,
				loaderData: undefined,
				matchId,
				preloaderContext: ir.preloaderSnapshot,
				route: ir.route,
				status: "success",
			};
		}

		const loaderSpan = tracer.startSpan(`flare.pipeline.loader:${ir.route.virtualPath}`);

		/* Store cache intercept — before calling loader (per-route overrides server defaults) */
		const ssrConfig = ir.route.cache?.ssr ?? ssrCacheDefaults;
		let cacheKey: string | undefined;
		if (ssrConfig && resolvedStore) {
			cacheKey = ssrConfig.key
				? ssrConfig.key({ params: ir.validatedParams, search })
				: defaultSsrCacheKey(ir.route.virtualPath, ir.validatedParams, search);
		}
		if (ssrConfig && resolvedStore && cacheKey) {
			try {
				const cached = await resolvedStore.get(cacheKey);
				if (cached && !containsDeferred(cached.data)) {
					const isFresh =
						ssrConfig.staleTime === undefined || Date.now() - cached.storedAt < parseMilliseconds(ssrConfig.staleTime);
					if (isFresh) {
						loaderSpan.setAttribute("cache", true);
						loaderSpan.end();
						return {
							cacheHit: true,
							deferContext,
							loaderData: cached.data,
							matchId,
							preloaderContext: ir.preloaderSnapshot,
							route: ir.route,
							status: "success",
						};
					}
				}
			} catch (e: unknown) {
				warn("cache", "Store get failed — treating as miss", e);
			}
		}

		const deps = ir.route.effectsConfig?.loaderDeps
			? (ir.route.effectsConfig.loaderDeps as (opts: { search: SearchParams }) => unknown[])({
					search,
				})
			: [];

		try {
			const loaderCtx: Record<string, unknown> = {
				...baseHelpers,
				abortController,
				auth,
				cause,
				defer: deferContext.defer,
				deps,
				env,
				locale: makeLocale(ir.validatedParams),
				location: ir.location,
				prefetch,
				preloaderContext: ir.preloaderSnapshot,
				request,
				serverContext: getServerContext(),
			};
			if (config.queryClient) {
				loaderCtx.queryClient = config.queryClient;
			}
			const loaderData = await ir.route.loader(loaderCtx);

			/* Store cache write-back — skip deferred trees (markers have no live promises) */
			if (ssrConfig && resolvedStore && cacheKey && !containsDeferred(loaderData)) {
				let tags: string[] | undefined;
				if (ssrConfig.tags) {
					tags = typeof ssrConfig.tags === "function" ? ssrConfig.tags({ params: ir.validatedParams }) : ssrConfig.tags;
				}
				try {
					await resolvedStore.set(
						cacheKey,
						{ data: serializeLoaderData(loaderData), storedAt: Date.now(), tags },
						ssrConfig.ttl !== undefined ? parseSeconds(ssrConfig.ttl) : undefined,
					);
				} catch (e: unknown) {
					warn("cache", "Store set failed", e);
				}
			}

			loaderSpan.end();
			return {
				cacheHit: ssrConfig && resolvedStore ? false : undefined,
				deferContext,
				loaderData,
				matchId,
				preloaderContext: ir.preloaderSnapshot,
				route: ir.route,
				status: "success",
			};
		} catch (e) {
			loaderSpan.setStatus("error");
			loaderSpan.end();
			return {
				cacheHit: ssrConfig && resolvedStore ? false : undefined,
				deferContext,
				error: e instanceof Error ? e : new Error(String(e)),
				loaderData: undefined,
				matchId,
				preloaderContext: ir.preloaderSnapshot,
				route: ir.route,
				status: "error",
			};
		}
	});

	const matches = await Promise.all(matchPromises);
	loadersSpan.end();

	/* Pre-index route → location for O(1) lookup in phases 5+6 */
	const routeLocationMap = new Map<ResolvedRoute, Location<Record<string, string | string[]>, SearchParams, string>>();
	for (const ir of internalRoutes) {
		routeLocationMap.set(ir.route, ir.location);
	}

	/* Phase 5: Head Chain (sequential) */
	const headSpan = tracer.startSpan("flare.pipeline.head");
	let mergedHead: HeadConfig | undefined;

	for (const match of matches) {
		if (match.route.head && match.status === "success") {
			const location = routeLocationMap.get(match.route);
			if (location) {
				try {
					const routeHead = match.route.head({
						...urlHelpers,
						cause,
						loaderData: match.loaderData,
						location,
						parentHead: mergedHead,
						prefetch,
						preloaderContext: match.preloaderContext,
						serverContext: getServerContext(),
					});
					if (match.route.headReplace) {
						mergedHead = routeHead;
						/* replace mode: clear previous matches so ph won't re-apply their tags */
						for (const prev of matches) {
							if (prev === match) break;
							prev.headConfig = undefined;
						}
					} else {
						mergedHead = mergeHeadConfigs(mergedHead, routeHead);
					}
				} catch (e: unknown) {
					match.headError = e instanceof Error ? e : new Error(String(e));
				}
			}
		}
		match.headConfig = mergedHead;
	}
	headSpan.end();

	/* Phase 6: Headers Chain (sequential) + CDN cache headers */
	const headersSpan = tracer.startSpan("flare.pipeline.headers");
	let mergedHeaders: ResponseHeaders | undefined;
	let userSetCacheControl = false;

	for (const match of matches) {
		if (match.route.headers && match.status === "success") {
			const location = routeLocationMap.get(match.route);
			if (location) {
				try {
					const routeHeaders = match.route.headers({
						...urlHelpers,
						cause,
						env,
						loaderData: match.loaderData,
						location,
						parentHeaders: mergedHeaders,
						prefetch,
						preloaderContext: match.preloaderContext,
						request,
						serverContext: getServerContext(),
					});
					for (const k in routeHeaders) {
						if (Object.hasOwn(routeHeaders, k) && k.toLowerCase() === "cache-control") {
							userSetCacheControl = true;
							break;
						}
					}
					mergedHeaders = mergeResponseHeaders(mergedHeaders, routeHeaders);
				} catch (e: unknown) {
					match.headersError = e instanceof Error ? e : new Error(String(e));
				}
			}
		}

		/* Auto-generate CDN headers from cache.cdn config (skip Cache-Control if user already set it) */
		const cdn = match.route.cache?.cdn;
		if (cdn) {
			const validatedParams = routeLocationMap.get(match.route)?.params ?? config.params ?? {};
			const cdnHeaders = buildCdnCacheHeaders(cdn, validatedParams);
			if (userSetCacheControl) {
				const nonConflicting: ResponseHeaders = {};
				for (const [k, v] of Object.entries(cdnHeaders)) {
					if (k.toLowerCase() !== "cache-control") nonConflicting[k] = v;
				}
				mergedHeaders = mergeResponseHeaders(mergedHeaders, nonConflicting);
			} else {
				mergedHeaders = mergeResponseHeaders(mergedHeaders, cdnHeaders);
			}
		}

		match.responseHeaders = mergedHeaders;
	}
	headersSpan.end();

	return { auth, deferContexts, matches };
}
