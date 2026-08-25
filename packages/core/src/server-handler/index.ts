import clientEntryPath from "virtual:flare-client-entry";
import { layoutModuleIds } from "virtual:flare-generated";
import virtualIsDev from "virtual:flare-is-dev";
/* `__FLARE_IS_DEV__` is injected as a Vite `define` by Flare's virtual plugin — reliable across
   all environments including cf-vite-plugin's SSR worker (where `import.meta.env.DEV` is forced
   to false because the SSR env defaults to `mode: "production"` even during `vite serve`).
   Tests mock `virtual:flare-is-dev` and never get the define — fall back to that module. */
declare const __FLARE_IS_DEV__: boolean | undefined;
function readIsDev(): boolean {
	return typeof __FLARE_IS_DEV__ === "boolean" ? __FLARE_IS_DEV__ : virtualIsDev;
}
import { clientManifest, entryPreloads } from "virtual:flare-module-preloads";
import { sxManifest } from "virtual:flare-sx-manifest";
import serverFnsDefault from "virtual:flare-server-fn-map";
import { disableFetchDedupe, enableFetchDedupe } from "../dedupe/index.ts";
import { parseSeconds } from "../duration/index.ts";
import {
	isNotFoundError,
	isRedirectResponse,
	isServerFnValidationError,
	isUnauthenticatedError,
	isUnauthorizedError,
	NotFoundError,
	type RedirectResponse,
} from "../errors/index.ts";
import { registerFormActionContextGetter } from "../form/index.tsx";
import type { AuthenticateFn, AuthenticateFnContext, PipelineMatch, ResolvedRoute } from "../loader-pipeline/index.ts";
import { runPipeline } from "../loader-pipeline/index.ts";
import { error as logError, warn } from "../logger.ts";
import type { MiddlewareEntry, RequestType, ResponseHandler } from "../middleware/index.ts";
import { resolveMiddlewareEntries, runMiddlewares } from "../middleware/index.ts";
import { mergePreloads, resolveRoutePreloads, type ViteManifest } from "../module-graph/index.ts";
import { dispatchMount, type MountConfig, matchMount } from "../mount/index.ts";
import { setRewrite } from "../navigation/index.ts";
import {
	createNDJSONResponse,
	createRedirectNDJSONResponse,
	createStreamingNDJSONResponse,
} from "../ndjson-server/index.ts";
import { extractNonce, NONCE_PLACEHOLDER, replaceNonce } from "../prerender/index.ts";
import { createRevalidateFn } from "../revalidation/index.ts";
import { composeRewrites, executeRewriteInput, type LocationRewrite, rewriteBasePath } from "../rewrite/index.ts";
import type { CacheConfig, ResponseHeaders } from "../route-builder/types.ts";
import type { MarkedRouterConfig } from "../router-config/index.ts";
import type { RouteData } from "../router-primitives/index.ts";
import {
	deriveLayouts,
	isRootLayoutPath,
	matchRoute,
	matchRoutePartial,
	toLocaleMatch,
} from "../router-primitives/index.ts";
import { submitUrlsToBing } from "../search-engine/bing.ts";
import { submitSitemapToGoogle } from "../search-engine/google.ts";
import type { ServiceAccountCredentials } from "../search-engine/google-jwt.ts";
import { submitIndexNow } from "../search-engine/index-now.ts";
import type { SecurityConfig, SecurityContext } from "../security/index.ts";
import { buildSecurityHeaders } from "../security/index.ts";
import {
	background,
	generateNonce,
	getFormActionContext,
	getServerContext,
	getServerLogs,
	runWithServerContext,
	serverLog,
	setFormActionContext,
} from "@lovrozagar/flare/server-context";
import { formDataToObject, handleServerFnRequest } from "../server-fn/index.ts";
import { applyResponseHeaders, mergeResponseHeaders, renderToStream, type SSRConfig } from "../ssr/index.tsx";
import type { StaticEntryData } from "../store/index.ts";
import { noopTracer } from "../tracing/noop.ts";
import { buildServerTimingHeader, createTimingTracer, type TimingTracer } from "../tracing/timing.ts";
import type { FlareTracer } from "../tracing/types.ts";
import { computeEtag } from "./etag.ts";
import { FLARE_CACHE_HEADER, FLARE_RENDER_HEADER, type FlareCacheStatus, type FlareRenderMode } from "./headers.ts";
import type { CspDirectives, TracingConfig } from "./types.ts";
import { extractParamsFn, validateStaticParams } from "./validate-static-params.ts";

export { FLARE_CACHE_HEADER, FLARE_RENDER_HEADER };
export type { CspDirectives, FlareCacheStatus, FlareRenderMode, TracingConfig };

interface ResolvedQueryClient {
	provider: (props: { children: unknown; client: unknown }) => unknown;
	queryClient: unknown;
}

let _cachedQCProvider: ResolvedQueryClient["provider"] | undefined;

async function resolveQueryClient(router: MarkedRouterConfig): Promise<ResolvedQueryClient | undefined> {
	if (!router.queryClientGetter) return undefined;
	const queryClient = router.queryClientGetter();
	if (!_cachedQCProvider) {
		const mod = await import("../query-client");
		_cachedQCProvider = mod.QueryClientProvider as ResolvedQueryClient["provider"];
	}
	return { provider: _cachedQCProvider, queryClient };
}

export const SECURITY_HEADERS: Record<string, string> = {
	"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
};

export function normalizeUrl(url: URL, trailingSlash: "always" | "never" | "preserve" = "never"): Response | null {
	if (trailingSlash === "never" && url.pathname !== "/" && url.pathname.endsWith("/")) {
		const target = url.pathname.slice(0, -1) + url.search + url.hash;
		return new Response(null, {
			headers: { Location: target },
			status: 301,
		});
	}

	if (trailingSlash === "always" && url.pathname !== "/" && !url.pathname.endsWith("/")) {
		const target = `${url.pathname}/${url.search}${url.hash}`;
		return new Response(null, {
			headers: { Location: target },
			status: 301,
		});
	}

	return null;
}

/* 'strict-dynamic' is intentionally omitted from script-src.
 *
 * Chrome bug (crbug.com/702612): strict-dynamic prevents the browser
 * from setting isLinkPreload=true on <link rel="modulepreload"> fetches.
 * Without that flag, Lighthouse reports all JS in the critical request
 * chain ("Avoid chaining critical requests" warning). The root cause is
 * that strict-dynamic nullifies 'self' and host sources, and Chrome's
 * CSP nonce propagation is broken for <link> elements (only works on
 * <script>). The modulepreload fetch gets blocked or downgraded.
 *
 * 'nonce-xxx' + 'self' provides equivalent protection for SSR frameworks:
 *   - nonce: prevents XSS injection of inline scripts
 *   - 'self': restricts all script sources to same origin
 *   - object-src 'none': closes plugin-based XSS vectors
 * The only lost capability is trust propagation to dynamically-created
 * scripts, which Flare doesn't need (we control all script output). */
const CSP_DEFAULTS: Record<string, string[] | boolean> = {
	"base-uri": ["'self'"],
	"connect-src": ["'self'", "https:"],
	"default-src": ["'self'"],
	"img-src": ["'self'", "data:", "https:"],
	"object-src": ["'none'"],
	"script-src": ["'self'"],
	"style-src": ["'self'", "'unsafe-inline'"],
	"upgrade-insecure-requests": true,
};

export function buildCspHeader(nonce: string, overrides?: CspDirectives, isDev?: boolean): string {
	const directives: Record<string, string[] | boolean> = {};

	for (const [key, value] of Object.entries(CSP_DEFAULTS)) {
		directives[key] = Array.isArray(value) ? [...value] : value;
	}

	if (isDev) {
		const connectSrc = directives["connect-src"] as string[];
		connectSrc.push("ws://localhost:*", "http://localhost:*");

		const scriptSrc = directives["script-src"] as string[];
		scriptSrc.push("'unsafe-inline'", "'unsafe-eval'");
		directives["upgrade-insecure-requests"] = false;
	}

	if (overrides) {
		for (const [key, value] of Object.entries(overrides)) {
			if (value === undefined) continue;
			if (typeof value === "boolean") {
				directives[key] = value;
			} else if (Array.isArray(value)) {
				const existing = directives[key];
				if (Array.isArray(existing)) {
					existing.push(...value);
				} else {
					directives[key] = [...value];
				}
			}
		}
	}

	const scriptSrc = directives["script-src"];
	if (Array.isArray(scriptSrc)) {
		scriptSrc.push(`'nonce-${nonce}'`);
	}

	const parts: string[] = [];
	for (const [key, value] of Object.entries(directives)) {
		if (value === true) {
			parts.push(key);
		} else if (Array.isArray(value)) {
			parts.push(`${key} ${value.join(" ")}`);
		}
	}

	return parts.join("; ");
}

const SKIP_STATIC_HEADERS = new Set([
	"connection",
	"content-encoding",
	"content-length",
	"keep-alive",
	"transfer-encoding",
]);

function sanitizeStaticHeaders(headers: Record<string, string>): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (SKIP_STATIC_HEADERS.has(key.toLowerCase())) continue;
		result[key] = value;
	}
	return result;
}

function headersToStaticRecord(headers: Headers): Record<string, string> {
	const result: Record<string, string> = {};
	headers.forEach((value, key) => {
		if (SKIP_STATIC_HEADERS.has(key.toLowerCase())) return;
		result[key] = value;
	});
	return result;
}

/* ── Types ────────────────────────────────────────────────────────────── */

export interface ServerHandler<TEnv = unknown> {
	fetch(request: Request, env: TEnv): Promise<Response>;
}

export interface CdnPurgeAdapter {
	purgeByKeys?(keys: string[], callerData?: unknown): Promise<void>;
	purgeByTags(tags: string[], callerData?: unknown): Promise<void>;
}

export interface HandlerCacheConfig<TEnv = unknown> {
	cdn?: CdnPurgeAdapter | ((env: TEnv) => CdnPurgeAdapter);
	headers?: boolean;
	isr?: { revalidate?: import("../duration").Duration };
	revalidateSecret?: string | ((env: TEnv) => string);
	ssr?: import("../route-builder/types").SsrCacheConfig;
	store?: import("../store").FlareStore | ((env: TEnv) => import("../store").FlareStore);
}

export interface SitemapSubmitEngines<TEnv = unknown> {
	bing?: {
		apiKey: string | ((env: TEnv) => string);
		siteUrl: string;
	};
	google?: {
		credentials: ServiceAccountCredentials | ((env: TEnv) => ServiceAccountCredentials);
		siteUrl: string;
	};
	indexNow?: {
		host: string;
		key: string | ((env: TEnv) => string);
	};
}

export interface SitemapSubmitConfig<TEnv = unknown> {
	engines: SitemapSubmitEngines<TEnv>;
	secret: string | ((env: TEnv) => string);
	sitemapUrl: string;
}

export interface ServerHandlerConfig<
	TAuth = unknown,
	TEnv = unknown,
	TServerContext extends Record<string, unknown> = Record<string, unknown>,
> {
	authenticateFn?: (ctx: AuthenticateFnContext<TEnv>) => TAuth | null | Promise<TAuth | null>;
	cache?: HandlerCacheConfig<TEnv>;
	csp?: CspDirectives;
	dedupeFetch?: boolean;
	securityConfig?: SecurityConfig | ((ctx: SecurityContext) => SecurityConfig);
	middlewareEntries?: MiddlewareEntry<TEnv>[];
	mount?: MountConfig<TEnv> | MountConfig<TEnv>[];
	router: MarkedRouterConfig;
	serverContext?: (ctx: { env: TEnv; request: Request }) => TServerContext | Promise<TServerContext>;
	/** Forward server logs to browser devtools. Default: true in dev, false in prod. */
	serverLogs?: boolean;
	sitemap?: SitemapSubmitConfig<TEnv>;
	tracing?: import("./types").TracingConfig;
	/**
	 * Platform-agnostic background work adapter.
	 * Called with a promise that should outlive the current request.
	 * - Cloudflare Workers: `ctx.waitUntil`
	 * - Node/Bun: fire-and-forget (or custom tracking)
	 */
	waitUntil?: (promise: Promise<unknown>) => void;
}

/* ── Fallback pages ───────────────────────────────────────────────────── */

const FALLBACK_404 =
	'<!doctype html><html lang="en"><head><title>Not Found</title></head><body><h1>404</h1><p>Not Found</p></body></html>';
const FALLBACK_401 =
	'<!doctype html><html lang="en"><head><title>Unauthorized</title></head><body><h1>401</h1><p>Unauthorized</p></body></html>';
const FALLBACK_403 =
	'<!doctype html><html lang="en"><head><title>Forbidden</title></head><body><h1>403</h1><p>Forbidden</p></body></html>';
const FALLBACK_500 =
	'<!doctype html><html lang="en"><head><title>Server Error</title></head><body><h1>500</h1><p>Internal Server Error</p></body></html>';

function unmatchedNdjson404(): Response {
	const body = `${JSON.stringify({
		e: { message: "Not found", name: "NotFoundError" },
		t: "e",
	})}\n${JSON.stringify({ t: "r" })}\n${JSON.stringify({ t: "d" })}\n`;
	return new Response(body, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/x-ndjson",
		},
		status: 404,
	});
}

function fallbackHtmlResponse(html: string, status: number, secHeaders: Record<string, string>): Response {
	return new Response(html, {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			...secHeaders,
		},
		status,
	});
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#x27;");
}

function buildDevErrorHtml(error: unknown): string {
	if (error instanceof Error) {
		const msg = escapeHtml(error.message);
		const stack = escapeHtml(error.stack ?? "");
		return `<!doctype html><html lang="en"><head><title>Server Error</title></head><body><h1>500</h1><p>${msg}</p><pre>${stack}</pre></body></html>`;
	}
	return FALLBACK_500;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function addSecurityHeaders(response: Response, secHeaders: Record<string, string>): Response {
	const headers = new Headers(response.headers);

	for (const [key, value] of Object.entries(secHeaders)) {
		if (!headers.has(key)) {
			headers.set(key, value);
		}
	}

	/* Ensure Vary includes x-d — merge with any existing Vary from cdn.vary config */
	const existing = headers.get("Vary");
	if (existing) {
		const parts = existing.split(",").map((v) => v.trim());
		if (!parts.some((v) => v.toLowerCase() === "x-d")) {
			headers.set("Vary", `x-d, ${existing}`);
		}
	} else {
		headers.set("Vary", "x-d");
	}

	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}

async function applyResponseHandlers(response: Response, handlers: ResponseHandler[]): Promise<Response> {
	let result = response;
	for (const handler of handlers) {
		try {
			result = await handler(result);
		} catch (e) {
			warn("middleware", "onResponse handler failed", e);
		}
	}
	return result;
}

function findRedirectInMatches(matches: PipelineMatch[]): RedirectResponse | null {
	for (const match of matches) {
		if (match.error && isRedirectResponse(match.error)) {
			return match.error;
		}
	}
	return null;
}

async function loadRouteModules(
	route: RouteData,
	layouts: Record<string, () => Promise<{ default: unknown }>>,
): Promise<ResolvedRoute[]> {
	const layoutKeys = deriveLayouts(route.x);
	const loadedKeys: string[] = [];
	const loaders: Array<Promise<{ default: unknown }>> = [];

	for (const key of layoutKeys) {
		const loader = layouts[key];
		if (loader) {
			loadedKeys.push(key);
			loaders.push(loader());
		}
	}

	const pagePromise = route.p();
	const [pageModule, ...layoutModules] = await Promise.all([pagePromise, ...loaders]);

	const routes: ResolvedRoute[] = [];

	for (let i = 0; i < layoutModules.length; i++) {
		const mod = layoutModules[i] as { default: Record<string, unknown> } | undefined;
		const key = loadedKeys[i] ?? "";
		if (mod?.default) {
			const modDefault = mod.default;
			const resolvedType: "layout" | "root-layout" = key.split("/").some((s) => isRootLayoutPath(s))
				? "root-layout"
				: "layout";
			routes.push({
				_type: resolvedType,
				variablePath: key,
				virtualPath: key,
				...modDefault,
			} as ResolvedRoute);
		}
	}

	if (pageModule?.default) {
		routes.push({
			_type: route.t === "x" ? "response" : "render",
			variablePath: route.v,
			virtualPath: route.x,
			...(pageModule.default as Record<string, unknown>),
		} as ResolvedRoute);
	}

	return routes;
}

/**
 * Collect source module IDs for the page + all its layouts.
 * Used to populate sxRenderedModules so Show/Switch branch classes are
 * included in critical CSS even when their host elements aren't in the
 * initial SSR output.
 */
function collectRouteModuleIds(route: RouteData): string[] {
	const ids: string[] = [];
	if (route.f) ids.push(route.f);
	const layoutKeys = deriveLayouts(route.x);
	for (const key of layoutKeys) {
		const moduleId = (layoutModuleIds as Record<string, string>)[key];
		if (moduleId) ids.push(moduleId);
	}
	return ids;
}

/**
 * Compute modulepreload hints for a matched route chain.
 * Collects module IDs for the page + all its layouts, then resolves
 * their transitive chunk dependencies from the Vite client manifest.
 */
function computeRoutePreloads(route: RouteData): { css: string[]; js: string[] } | undefined {
	if (!clientManifest) return undefined;

	const moduleIds: string[] = [];

	/* Page module ID */
	if (route.f) {
		moduleIds.push(route.f);
	}

	/* Layout module IDs from the route chain */
	const layoutKeys = deriveLayouts(route.x);
	for (const key of layoutKeys) {
		const moduleId = (layoutModuleIds as Record<string, string>)[key];
		if (moduleId) {
			moduleIds.push(moduleId);
		}
	}

	if (moduleIds.length === 0) return undefined;

	const routePreloads = resolveRoutePreloads(
		clientManifest as ViteManifest,
		moduleIds,
		entryPreloads as { css: string[]; js: string[] },
	);

	return mergePreloads(entryPreloads as { css: string[]; js: string[] }, routePreloads);
}

/* ── Revalidation endpoint ────────────────────────────────────────────── */

const VALID_TIERS = new Set(["cdn", "ssr"]);

function constantTimeEqual(a: string, b: string): boolean {
	const len = Math.max(a.length, b.length);
	let mismatch = a.length ^ b.length;
	for (let i = 0; i < len; i++) {
		mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	}
	return mismatch === 0;
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
	return new Response(JSON.stringify(body), {
		headers: { "Content-Type": "application/json; charset=utf-8" },
		status,
	});
}

async function handleRevalidateRequest<TEnv>(
	request: Request,
	_url: URL,
	env: TEnv,
	cacheConfig: HandlerCacheConfig<TEnv>,
): Promise<Response> {
	/* Only POST allowed — GET leaks secret in URL (access logs, Referer, browser history) */
	if (request.method !== "POST") {
		return jsonResponse({ error: "Method not allowed" }, 405);
	}

	if (!cacheConfig.revalidateSecret) {
		return jsonResponse({ error: "Revalidation not configured" }, 500);
	}

	const expectedSecret =
		typeof cacheConfig.revalidateSecret === "function"
			? cacheConfig.revalidateSecret(env)
			: cacheConfig.revalidateSecret;

	const providedSecret = request.headers.get("x-revalidation-secret") ?? "";
	if (!providedSecret || !constantTimeEqual(providedSecret, expectedSecret)) {
		return jsonResponse({ error: "Unauthorized" }, 401);
	}

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return jsonResponse({ error: "Invalid JSON body" }, 400);
	}
	const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : undefined;
	const keys = Array.isArray(body.keys) ? body.keys.filter((k): k is string => typeof k === "string") : undefined;
	const tiers = Array.isArray(body.tiers) ? body.tiers.filter((t): t is string => typeof t === "string") : undefined;

	if (!tags?.length && !keys?.length) {
		return jsonResponse({ error: "Must provide tags or keys" }, 400);
	}

	if (!tiers?.length) {
		return jsonResponse({ error: "Must provide tiers" }, 400);
	}

	for (const tier of tiers) {
		if (!VALID_TIERS.has(tier)) {
			return jsonResponse({ error: `Invalid tier: ${tier}` }, 400);
		}
	}

	const resolvedStore = typeof cacheConfig.store === "function" ? cacheConfig.store(env) : cacheConfig.store;

	let resolvedCdn: CdnPurgeAdapter | undefined;
	if (cacheConfig.cdn) {
		resolvedCdn = typeof cacheConfig.cdn === "function" ? cacheConfig.cdn(env) : cacheConfig.cdn;
	}

	const revalidateFn = createRevalidateFn({
		cdnPurgeAdapter: resolvedCdn,
		store: resolvedStore,
	});

	await revalidateFn({
		keys,
		tags,
		tiers: tiers as Array<"cdn" | "ssr">,
	});

	return jsonResponse(
		{
			keys: keys ?? [],
			revalidated: true,
			tags: tags ?? [],
			tiers,
		},
		200,
	);
}

/* ── Sitemap submit endpoint ──────────────────────────────────────────── */

interface EngineResult {
	error?: string;
	ok: boolean;
}

async function handleSitemapSubmitRequest<TEnv>(
	request: Request,
	url: URL,
	env: TEnv,
	sitemapConfig: SitemapSubmitConfig<TEnv>,
): Promise<Response> {
	if (request.method !== "POST") {
		return jsonResponse({ error: "Method not allowed" }, 405);
	}

	const expectedSecret = typeof sitemapConfig.secret === "function" ? sitemapConfig.secret(env) : sitemapConfig.secret;

	const providedSecret = request.headers.get("x-sitemap-secret") ?? "";

	if (!providedSecret || !constantTimeEqual(providedSecret, expectedSecret)) {
		return jsonResponse({ error: "Unauthorized" }, 401);
	}

	/* Optional POST body with URLs for Bing/IndexNow */
	let urls: string[] | undefined;
	if (request.method === "POST") {
		try {
			const body = (await request.json()) as Record<string, unknown>;
			if (Array.isArray(body.urls)) {
				const allowedOrigin = new URL(sitemapConfig.sitemapUrl).origin;
				urls = body.urls
					.filter((u): u is string => typeof u === "string")
					.filter((u) => {
						try {
							return new URL(u).origin === allowedOrigin;
						} catch {
							return false;
						}
					});
			}
		} catch {
			/* no body or invalid JSON — fine, sitemap-only submission */
		}
	}

	const engines = sitemapConfig.engines;
	const results: Record<string, EngineResult> = {};

	/* Google: submit sitemap to Search Console */
	if (engines.google) {
		const credentials =
			typeof engines.google.credentials === "function" ? engines.google.credentials(env) : engines.google.credentials;
		try {
			results.google = await submitSitemapToGoogle({
				credentials,
				siteUrl: engines.google.siteUrl,
				sitemapUrl: sitemapConfig.sitemapUrl,
			});
		} catch (e: unknown) {
			results.google = {
				error: e instanceof Error ? e.message : "Unknown error",
				ok: false,
			};
		}
	}

	/* Bing: submit URLs if provided */
	if (engines.bing && urls && urls.length > 0) {
		const apiKey = typeof engines.bing.apiKey === "function" ? engines.bing.apiKey(env) : engines.bing.apiKey;
		try {
			results.bing = await submitUrlsToBing({
				apiKey,
				siteUrl: engines.bing.siteUrl,
				urls,
			});
		} catch (e: unknown) {
			results.bing = { error: e instanceof Error ? e.message : "Unknown error", ok: false };
		}
	}

	/* IndexNow: submit URLs if provided */
	if (engines.indexNow && urls && urls.length > 0) {
		const key = typeof engines.indexNow.key === "function" ? engines.indexNow.key(env) : engines.indexNow.key;
		try {
			results.indexNow = await submitIndexNow({
				host: engines.indexNow.host,
				key,
				urls,
			});
		} catch (e: unknown) {
			results.indexNow = { error: e instanceof Error ? e.message : "Unknown error", ok: false };
		}
	}

	return jsonResponse({ engines: results, submitted: true }, 200);
}

/* ── getStaticParams helpers ──────────────────────────────────────────── */

export type StaticParamsMap = Map<string, Record<string, string | string[]>[]>;

function collectDynamicRoutes(node: import("../router-primitives").TreeNode): RouteData[] {
	const results: RouteData[] = [];
	function walk(n: typeof node): void {
		if (n.r?.x.includes("[")) {
			results.push(n.r);
		}
		for (const child of Object.values(n.s)) {
			walk(child);
		}
		if (n.p) walk(n.p);
		if (n.q) walk(n.q);
		if (n.c) walk(n.c);
		if (n.o) walk(n.o);
	}
	walk(node);
	return results;
}

function expandLocaleParam(
	virtualPath: string,
	current: Record<string, string | string[]>[],
	locale: { locales: readonly string[]; paramName?: string } | undefined,
): Record<string, string | string[]>[] {
	if (!locale?.locales.length || current.length === 0) return current;
	const name = locale.paramName ?? "locale";
	if (!virtualPath.includes(`[${name}]`)) return current;
	if (current.every((p) => p[name] != null && p[name] !== "")) return current;

	const out: Record<string, string | string[]>[] = [];
	for (const parent of current) {
		if (parent[name] != null && parent[name] !== "") {
			out.push(parent);
			continue;
		}
		for (const loc of locale.locales) {
			out.push({ ...parent, [name]: loc });
		}
	}
	return out;
}

async function buildGetStaticParams(router: MarkedRouterConfig): Promise<StaticParamsMap> {
	const dynamicRoutes = collectDynamicRoutes(router.routeTree);
	if (dynamicRoutes.length === 0) return new Map();

	const resultMap: StaticParamsMap = new Map();

	for (const route of dynamicRoutes) {
		try {
			/* Load page + layout modules */
			const layoutKeys = deriveLayouts(route.x);
			const loadedKeys: string[] = [];
			const layoutPromises: Array<Promise<{ default: unknown }>> = [];

			for (const key of layoutKeys) {
				const loader = router.layouts[key];
				if (loader) {
					loadedKeys.push(key);
					layoutPromises.push(loader());
				}
			}

			const [pageModule, ...layoutModules] = await Promise.all([route.p(), ...layoutPromises]);

			/* Build chain: [root-layout, ...layouts, page] in order */
			const chain: Array<{
				mod: Record<string, unknown>;
				virtualPath: string;
			}> = [];

			for (let i = 0; i < layoutModules.length; i++) {
				const mod = layoutModules[i] as { default: Record<string, unknown> } | undefined;
				const key = loadedKeys[i] ?? "";
				if (mod?.default) {
					chain.push({ mod: mod.default, virtualPath: key });
				}
			}

			if (pageModule?.default) {
				chain.push({
					mod: pageModule.default as Record<string, unknown>,
					virtualPath: route.x,
				});
			}

			/* Compose params level-by-level */
			let currentParams: Record<string, string | string[]>[] = [{}];

			for (const link of chain) {
				const paramsFn = extractParamsFn(link.mod.cache as CacheConfig | undefined);
				if (!paramsFn) continue;

				const nextParams: Record<string, string | string[]>[] = [];
				for (const parentParams of currentParams) {
					const produced = await paramsFn({ params: parentParams });
					if (!Array.isArray(produced) || produced.length === 0) continue;
					for (const p of produced) {
						nextParams.push({ ...parentParams, ...p });
					}
				}

				if (nextParams.length === 0) {
					currentParams = [];
					break;
				}
				currentParams = nextParams;
			}

			currentParams = expandLocaleParam(route.x, currentParams, router.locale);

			if (currentParams.length > 0 && Object.keys(currentParams[0] ?? {}).length > 0) {
				resultMap.set(route.x, currentParams);
			}
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			warn("prerender", `getStaticParams failed for ${route.x}: ${msg}`);
		}
	}

	return resultMap;
}

/* ── createServerHandler ─────────────────────────────────────────────── */

const isrInFlight = new Set<string>();
const ISR_TIMEOUT = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	return Promise.race([
		promise.finally(() => clearTimeout(timer)),
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error("ISR timeout")), ms);
		}),
	]);
}

const MAX_REDIRECTS = 5;

export function createServerHandler<
	TAuth = unknown,
	TEnv = unknown,
	TServerContext extends Record<string, unknown> = Record<string, unknown>,
>(
	config: ServerHandlerConfig<TAuth, TEnv, TServerContext>,
): ServerHandler<TEnv> & {
	readonly authenticateFn?: ServerHandlerConfig<TAuth, TEnv, TServerContext>["authenticateFn"];
	readonly getStaticParams: () => Promise<StaticParamsMap>;
	readonly serverContext?: ServerHandlerConfig<TAuth, TEnv, TServerContext>["serverContext"];
} {
	registerFormActionContextGetter(getFormActionContext);

	const { dedupeFetch = true } = config;
	const isDev = readIsDev();
	const serverFns = serverFnsDefault;
	const enableServerLogs = config.serverLogs ?? isDev;
	let mounts: MountConfig<TEnv>[] = [];
	if (config.mount) {
		mounts = Array.isArray(config.mount) ? config.mount : [config.mount];
	}

	/* Resolve tracer tier: OTel provider > explicit timing > dev auto-timing > noop */
	function resolveTracer(tracingCfg?: TracingConfig): FlareTracer {
		if (tracingCfg?.provider) return tracingCfg.provider;
		if (tracingCfg?.timing || isDev) return createTimingTracer();
		return noopTracer;
	}

	const baseEntries: MiddlewareEntry<TEnv>[] = config.middlewareEntries ?? [];

	/* Build composed rewrite: basePath (if any) + user rewrite */
	let composedRewrite: LocationRewrite | undefined;
	const rewrites: LocationRewrite[] = [];
	if (config.router.basePath) {
		rewrites.push(
			rewriteBasePath({
				basePath: config.router.basePath,
				caseSensitive: config.router.caseSensitive,
			}),
		);
	}
	if (config.router.rewrite) {
		rewrites.push(config.router.rewrite);
	}
	if (rewrites.length === 1) {
		composedRewrite = rewrites[0];
	} else if (rewrites.length > 1) {
		composedRewrite = composeRewrites(rewrites);
	}

	const handler: ServerHandler<TEnv> = {
		async fetch(request: Request, env: TEnv): Promise<Response> {
			const nonce = generateNonce();
			const abortController = new AbortController();
			const url = new URL(request.url);

			const matchedMount = matchMount(mounts, url.pathname);
			if (!matchedMount) {
				const normalized = normalizeUrl(url, config.router.trailingSlash);
				if (normalized) return normalized;
			}

			const serverCtx = config.serverContext ? await config.serverContext({ env, request }) : {};

			const secCfg = config.securityConfig;
			const resolvedSecCfg =
				typeof secCfg === "function"
					? secCfg({ env, nonce, request, serverContext: serverCtx as Record<string, unknown> })
					: secCfg;
			/* Bridge legacy csp config into SecurityConfig when securityConfig omits CSP */
			const mergedSecCfg: SecurityConfig | undefined =
				config.csp && !resolvedSecCfg?.["Content-Security-Policy"]
					? { ...resolvedSecCfg, "Content-Security-Policy": config.csp }
					: resolvedSecCfg;
			const secHeaders = buildSecurityHeaders({ config: mergedSecCfg, isDev, nonce });
			const tracer = resolveTracer(config.tracing);

			let resolvedStore = typeof config.cache?.store === "function" ? config.cache.store(env) : config.cache?.store;
			if (isDev && !resolvedStore) {
				const { createFileSystemStore } = await import("../store/filesystem");
				resolvedStore = createFileSystemStore();
			}
			let resolvedCdnPurge: CdnPurgeAdapter | undefined;
			if (config.cache?.cdn) {
				resolvedCdnPurge = typeof config.cache.cdn === "function" ? config.cache.cdn(env) : config.cache.cdn;
			}

			const response = await runWithServerContext(
				{
					cdnPurgeAdapter: resolvedCdnPurge,
					isDev,
					nonce,
					request,
					serverContext: serverCtx,
					store: resolvedStore,
					waitUntil: config.waitUntil,
				},
				async () => {
					if (dedupeFetch) enableFetchDedupe();
					let redirectCount = 0;

					try {
						/* Determine request type for middleware context */
						let requestType: RequestType = "page";
						if (matchedMount) {
							requestType = "mount";
						} else if (url.pathname.startsWith("/_fn/")) {
							requestType = "server-fn";
						} else if (url.pathname.startsWith("/_flare/")) {
							requestType = "internal";
						}

						const middlewareCtx = {
							env,
							error: (...args: unknown[]) => serverLog("error", ...args),
							locale: config.router.locale,
							log: (...args: unknown[]) => serverLog("log", ...args),
							nonce,
							onResponse: () => {},
							request,
							requestType,
							routeTree: config.router.routeTree,
							serverContext: serverCtx,
							url,
							warn: (...args: unknown[]) => serverLog("warn", ...args),
						};

						/* Resolve path-filtered middleware from entries */
						const resolvedMiddlewares = resolveMiddlewareEntries(baseEntries, url.pathname);

						let responseHandlers: ResponseHandler[] = [];

						if (resolvedMiddlewares.length > 0) {
							const mwOutput = await runMiddlewares(resolvedMiddlewares, middlewareCtx, tracer);
							responseHandlers = mwOutput.responseHandlers;

							if (mwOutput.result.type === "bypass") {
								return mwOutput.result.response;
							}

							if (mwOutput.result.type === "respond") {
								let response = mwOutput.result.response;
								response = await applyResponseHandlers(response, responseHandlers);
								return addSecurityHeaders(response, secHeaders);
							}
						}

						if (matchedMount) {
							let response = await dispatchMount(request, env, matchedMount, url, {
								waitUntil: config.waitUntil,
							});
							response = await applyResponseHandlers(response, responseHandlers);
							return response;
						}

						const serverFnAuthFn = config.authenticateFn
							? (fnEnv: unknown, fnReq: Request) =>
									(config.authenticateFn as AuthenticateFn<TEnv>)({
										env: fnEnv as TEnv,
										request: fnReq,
										serverContext: getServerContext(),
										url: new URL(fnReq.url),
									})
							: undefined;

						if (url.pathname.startsWith("/_fn/")) {
							const fns = serverFns;
							let response = await handleServerFnRequest(request, env, fns, serverFnAuthFn);
							response = await applyResponseHandlers(response, responseHandlers);
							return addSecurityHeaders(response, secHeaders);
						}

						/* PE POST: no-JS <Form> submits to page URL with __flare_fn hidden field */
						if (
							request.method === "POST" &&
							!url.pathname.startsWith("/_fn/") &&
							!url.pathname.startsWith("/_flare/")
						) {
							const ct = request.headers.get("content-type") ?? "";
							if (ct.includes("form")) {
								let formData: FormData;
								try {
									formData = await request.formData();
								} catch {
									return addSecurityHeaders(new Response("Bad Request", { status: 400 }), secHeaders);
								}
								const flareFnId = formData.get("__flare_fn");
								if (typeof flareFnId === "string" && serverFns.has(flareFnId)) {
									const reg = serverFns.get(flareFnId);
									if (reg) {
										const fnUrl = `${url.origin}/_fn/${reg.id}/${reg.name}`;
										/* Forward headers but drop Content-Type so the runtime
										 * auto-sets the correct multipart boundary for FormData body. */
										const forwardHeaders = new Headers(request.headers);
										forwardHeaders.delete("content-type");
										const fnRequest = new Request(fnUrl, {
											body: formData,
											headers: forwardHeaders,
											method: "POST",
										});
										try {
											const fnResponse = await handleServerFnRequest(fnRequest, env, serverFns, serverFnAuthFn);
											if (fnResponse.ok) {
												return new Response(null, {
													headers: { Location: url.pathname + url.search },
													status: 303,
												});
											}
											/* CSRF rejection — hard 403, not a form error */
											if (fnResponse.status === 403) {
												return fnResponse;
											}
											/* Validation/auth error — store context for SSR re-render */
											const body: unknown = await fnResponse.json().catch(() => null);
											const formValues = formDataToObject(formData);
											if (typeof body === "object" && body !== null && "errors" in body) {
												const errors = (
													body as {
														errors: { fieldErrors: Record<string, string[]>; formErrors: string[] };
													}
												).errors;
												setFormActionContext(flareFnId, {
													fieldErrors: errors.fieldErrors ?? {},
													formErrors: errors.formErrors ?? [],
													message: "Validation error",
													values: formValues,
												});
											} else {
												const msg =
													typeof body === "object" && body !== null && "message" in body
														? String((body as Record<string, unknown>).message)
														: "Request failed";
												setFormActionContext(flareFnId, {
													fieldErrors: {},
													formErrors: [msg],
													message: msg,
													values: formValues,
												});
											}
											/* fall through to SSR render with error context */
										} catch (e: unknown) {
											if (isRedirectResponse(e)) {
												return new Response(null, {
													headers: { Location: e.url },
													status: e.status,
												});
											}
											throw e;
										}
									}
								}
							}
						}

						if (url.pathname === "/_flare/revalidate" && config.cache?.revalidateSecret) {
							/* Internal endpoints bypass middleware response handlers — only security headers */
							let revalResponse = await handleRevalidateRequest(request, url, env, config.cache);
							revalResponse = addSecurityHeaders(revalResponse, secHeaders);
							return revalResponse;
						}

						if (url.pathname === "/_flare/sitemap/submit" && config.sitemap) {
							/* Internal endpoints bypass middleware response handlers — only security headers */
							let sitemapResponse = await handleSitemapSubmitRequest(request, url, env, config.sitemap);
							sitemapResponse = addSecurityHeaders(sitemapResponse, secHeaders);
							return sitemapResponse;
						}

						const cs = config.router.caseSensitive;

						/* basePath guard: reject requests outside the mount point */
						if (config.router.basePath && !url.pathname.startsWith(config.router.basePath)) {
							return fallbackHtmlResponse(FALLBACK_404, 404, secHeaders);
						}

						const rewrittenUrl = composedRewrite ? executeRewriteInput(composedRewrite, url) : url;
						const matchPathname = rewrittenUrl.pathname;
						const match = matchRoute(config.router.routeTree, matchPathname, cs, toLocaleMatch(config.router.locale));

						if (!match) {
							const fuzzy = config.router.notFoundMode !== "root";
							if (fuzzy) {
								/* matchRoutePartial skips "/" when the first segment is neither
								 * a locale nor a static child (cross-worker guard). The request
								 * already arrived here, so fall back to the root index and
								 * render the app's notFound boundary instead of generic HTML. */
								const partial =
									matchRoutePartial(config.router.routeTree, matchPathname, cs, toLocaleMatch(config.router.locale)) ??
									matchRoute(config.router.routeTree, "/", cs, toLocaleMatch(config.router.locale));
								if (partial) {
									const resolvedRoutes = await loadRouteModules(partial.route, config.router.layouts);
									/* Keep layouts, replace page loader with one that throws notFound */
									const lastRoute = resolvedRoutes[resolvedRoutes.length - 1];
									if (lastRoute) {
										lastRoute.loader = () => {
											throw new NotFoundError();
										};
									}

									const pipelineResult = await runPipeline({
										abortController,
										authenticateFn: config.authenticateFn,
										cause: "enter",
										env,
										localeConfig: config.router.locale,
										params: partial.params,
										prefetch: false,
										request,
										routes: resolvedRoutes,
										ssrCacheDefaults: config.cache?.ssr,
										store: config.cache?.store,
										tracer,
										url,
									});

									const redirect404 = findRedirectInMatches(pipelineResult.matches);
									if (redirect404) {
										return new Response(null, {
											headers: { Location: redirect404.url },
											status: redirect404.status,
										});
									}

									const resolvedHead = pipelineResult.matches.findLast((m) => m.headConfig)?.headConfig ?? {};

									const fuzzyLogs = enableServerLogs ? getServerLogs() : undefined;
									if (request.headers.get("x-d") === "1") {
										const ndjson = createNDJSONResponse({
											deferContexts: pipelineResult.deferContexts,
											matches: pipelineResult.matches,
											serverLogs: fuzzyLogs && fuzzyLogs.length > 0 ? fuzzyLogs : undefined,
										});
										let data404 = new Response(ndjson.body, {
											headers: ndjson.headers,
											status: 404,
										});
										data404 = await applyResponseHandlers(data404, responseHandlers);
										return addSecurityHeaders(data404, secHeaders);
									}

									const fuzzyQC = await resolveQueryClient(config.router);
									let ssrResult: ReturnType<typeof renderToStream>;
									setRewrite(composedRewrite);
									try {
										ssrResult = renderToStream({
											auth: pipelineResult.auth,
											cause: "enter",
											deferContexts: pipelineResult.deferContexts.size > 0 ? pipelineResult.deferContexts : undefined,
											entryScript: clientEntryPath,
											matches: pipelineResult.matches,
											modulePreloads: computeRoutePreloads(partial.route),
											moduleScripts: [],
											nonce,
											params: partial.params,
											prefetch: false,
											queryClient: fuzzyQC?.queryClient,
											queryClientGetter: config.router.queryClientGetter,
											queryClientProvider: fuzzyQC?.provider as SSRConfig["queryClientProvider"],
											resolvedHead,
											router: config.router,
											serverLogs: fuzzyLogs && fuzzyLogs.length > 0 ? fuzzyLogs : undefined,
											sxCssManifest: sxManifest ?? undefined,
											sxRenderedModules: collectRouteModuleIds(partial.route),
											url,
										});
									} finally {
										setRewrite(undefined);
									}

									let response = new Response(ssrResult.body, {
										headers: ssrResult.headers,
										status: 404,
									});
									response = await applyResponseHandlers(response, responseHandlers);
									return addSecurityHeaders(response, secHeaders);
								}
							}
							if (request.headers.get("x-d") === "1") {
								let data404 = unmatchedNdjson404();
								data404 = await applyResponseHandlers(data404, responseHandlers);
								return addSecurityHeaders(data404, secHeaders);
							}
							return fallbackHtmlResponse(FALLBACK_404, 404, secHeaders);
						}

						const isDataRequest = request.headers.get("x-d") === "1";

						/* ── ISR / Static Store serving ─────────────────────── */
						const staticMeta = match.route.o.static;
						const isISRBgRequest = request.headers.get("x-isr-bg") === "1";
						const isPrerenderRequest = request.headers.get("x-flare-prerender") === "1";
						/* Skip the store on prerender: loadPrerenderArtifacts() rehydrates
						   the previous build's HTML into the same in-memory store the
						   prerender plugin then fetch()es, which would freeze stale
						   client hashes into the new artifacts. */
						if (staticMeta && resolvedStore && !isISRBgRequest && !isPrerenderRequest) {
							const storeKey = `static:${url.pathname}`;
							const entry = await resolvedStore.get(storeKey);

							if (entry) {
								const staticData = entry.data as StaticEntryData;
								const isrRevalidateRaw = staticMeta.revalidate ?? config.cache?.isr?.revalidate;
								const isrRevalidate = isrRevalidateRaw !== undefined ? parseSeconds(isrRevalidateRaw) : undefined;
								const isStale =
									staticMeta.mode === "isr" &&
									isrRevalidate !== undefined &&
									Date.now() - entry.storedAt > isrRevalidate * 1000;

								if (isStale && !request.headers.get("x-isr-bg") && !isrInFlight.has(storeKey)) {
									isrInFlight.add(storeKey);
									const revalidatePromise = (async () => {
										try {
											const reRenderResponse = await withTimeout(
												handler.fetch(
													new Request(request.url, {
														headers: { "x-isr-bg": "1" },
														method: "GET",
													}),
													env,
												),
												ISR_TIMEOUT,
											);
											const html = await reRenderResponse.text();
											const dataResponse = await withTimeout(
												handler.fetch(
													new Request(request.url, {
														headers: { "x-d": "1", "x-isr-bg": "1" },
														method: "GET",
													}),
													env,
												),
												ISR_TIMEOUT,
											);
											const ndjson = await dataResponse.text();
											const headers = headersToStaticRecord(reRenderResponse.headers);

											/* Replace real nonces with placeholder before storing */
											let storedHtml = html;
											const bgNonce = extractNonce(html) ?? extractNonce(headers["content-security-policy"] ?? "");
											if (bgNonce) {
												storedHtml = replaceNonce(html, bgNonce);
												for (const [k, v] of Object.entries(headers)) {
													if (v.includes(bgNonce)) {
														headers[k] = replaceNonce(v, bgNonce);
													}
												}
											}

											/* Extract fresh tags from re-render response */
											const surrogateKey = headers["surrogate-key"];
											const freshTags = surrogateKey ? surrogateKey.split(" ").filter(Boolean) : entry.tags;

											const etag = await computeEtag(storedHtml);
											await resolvedStore.set(storeKey, {
												data: { etag, headers, html: storedHtml, ndjson },
												storedAt: Date.now(),
												tags: freshTags,
											});
										} catch (e) {
											logError("isr", `background revalidation failed for ${storeKey}`, e);
										} finally {
											isrInFlight.delete(storeKey);
										}
									})();
									background(revalidatePromise);
								}

								const flareRender: FlareRenderMode = staticMeta.mode === "isr" ? "ISR" : "SSG";
								const flareCache: FlareCacheStatus = isStale ? "STALE" : "HIT";
								const headersEnabled = config.cache?.headers !== false;

								if (isDataRequest) {
									const dataHeaders: Record<string, string> = {
										"Content-Type": "application/x-ndjson",
									};
									if (headersEnabled) {
										dataHeaders[FLARE_CACHE_HEADER] = flareCache;
										dataHeaders[FLARE_RENDER_HEADER] = flareRender;
									}
									let response = new Response(staticData.ndjson, {
										headers: dataHeaders,
										status: 200,
									});
									response = await applyResponseHandlers(response, responseHandlers);
									return addSecurityHeaders(response, secHeaders);
								}

								/* Replace nonce placeholder */
								const entryHeaders: Record<string, string> = {};
								for (const [k, v] of Object.entries(sanitizeStaticHeaders(staticData.headers))) {
									entryHeaders[k] = v.replaceAll(NONCE_PLACEHOLDER, nonce);
								}

								/* Never 304 HTML that embeds a per-request CSP nonce. A 304 keeps the
								   cached body (old nonce="") and applies this response's new CSP, so
								   ThemeScript and every other inline script are blocked until a full
								   200 rewrite. ETag stays on the 200 for validators that only read it. */
								if (staticData.etag) {
									entryHeaders["ETag"] = staticData.etag;
								}

								const html = staticData.html.replaceAll(NONCE_PLACEHOLDER, nonce);

								let response = new Response(html, {
									headers: entryHeaders,
									status: 200,
								});
								if (headersEnabled) {
									response.headers.set(FLARE_CACHE_HEADER, flareCache);
									response.headers.set(FLARE_RENDER_HEADER, flareRender);
								}
								response = await applyResponseHandlers(response, responseHandlers);
								return addSecurityHeaders(response, secHeaders);
							}

							/* Cache miss — dynamicParams: false → 404, otherwise SSR.
							 * Prerender fetches set x-flare-prerender so listed slugs can
							 * be generated at build time before the store is populated. */
							if (staticMeta.mode === "isr") {
								const dynamicParams = staticMeta.dynamicParams ?? true;
								if (dynamicParams === false && request.headers.get("x-flare-prerender") !== "1") {
									const missResponse = fallbackHtmlResponse(FALLBACK_404, 404, secHeaders);
									if (config.cache?.headers !== false) {
										missResponse.headers.set(FLARE_CACHE_HEADER, "MISS");
										missResponse.headers.set(FLARE_RENDER_HEADER, "ISR");
									}
									return missResponse;
								}
								/* dynamicParams: true (default) → fall through to normal SSR */
							}
						}

						const isPrefetch = request.headers.get("x-p") === "1";
						const MAX_STALE_IDS = 100;
						const staleMatchIds = (request.headers.get("x-m")?.split(",") ?? []).slice(0, MAX_STALE_IDS);

						const cause = isPrefetch ? "prefetch" : ("enter" as const);

						const resolvedRoutes = await loadRouteModules(match.route, config.router.layouts);

						const paramsAllowed = await validateStaticParams(resolvedRoutes, match.params, isDev);
						if (!paramsAllowed) {
							return fallbackHtmlResponse(FALLBACK_404, 404, secHeaders);
						}

						/* Response routes: `.response()` returns raw Response, skip SSR entirely */
						const pageRoute = resolvedRoutes[resolvedRoutes.length - 1];
						if (pageRoute && pageRoute._type === "response" && pageRoute.response) {
							let response = await pageRoute.response({
								env,
								params: match.params,
								request,
								url,
							});
							response = await applyResponseHandlers(response, responseHandlers);
							return addSecurityHeaders(response, secHeaders);
						}

						if (isDataRequest && staleMatchIds.length > 0) {
							for (const route of resolvedRoutes) {
								const prefix = `${route.virtualPath}:`;
								const isStale = staleMatchIds.some((id) => id === route.virtualPath || id.startsWith(prefix));
								if (!isStale) {
									route.loader = undefined;
								}
							}
						}

						const pageQC = await resolveQueryClient(config.router);

						const pipelineResult = await runPipeline({
							abortController,
							authenticateFn: config.authenticateFn,
							cause,
							env,
							localeConfig: config.router.locale,
							params: match.params,
							prefetch: isPrefetch,
							queryClient: pageQC?.queryClient,
							request,
							routes: resolvedRoutes,
							ssrCacheDefaults: config.cache?.ssr,
							store: config.cache?.store,
							tracer,
							url,
						});

						const pipelineRedirect = findRedirectInMatches(pipelineResult.matches);
						if (pipelineRedirect) {
							redirectCount++;
							if (redirectCount > MAX_REDIRECTS) {
								throw new Error(
									`Redirect loop detected after ${redirectCount} redirects. Check route redirects for circular references.`,
								);
							}

							if (isDataRequest) {
								/* Data requests always get NDJSON redirect — even for external.
								 * Raw 3xx on data fetch would cause fetch() to follow cross-origin
								 * → CORS block → frozen UI. Client reads NDJSON and does hardNavigate(). */
								let response = createRedirectNDJSONResponse(pipelineRedirect);
								response = await applyResponseHandlers(response, responseHandlers);
								return addSecurityHeaders(response, secHeaders);
							}

							let response: Response = new Response(null, {
								headers: { Location: pipelineRedirect.url },
								status: pipelineRedirect.status,
							});
							/* middleware-pinned cookies (auth refresh, flash messages) must survive 3xx — without
							 * this, on-fly refresh + loader redirect drops Set-Cookie and the next request loops */
							response = await applyResponseHandlers(response, responseHandlers);
							return response;
						}

						let response: Response;
						const collectedLogs = enableServerLogs ? getServerLogs() : undefined;
						const logsForTransport = collectedLogs && collectedLogs.length > 0 ? collectedLogs : undefined;

						if (!isDataRequest) {
							const resolvedHead = pipelineResult.matches.findLast((m) => m.headConfig)?.headConfig ?? {};

							let ssrResult: ReturnType<typeof renderToStream>;
							setRewrite(composedRewrite);
							try {
								ssrResult = renderToStream({
									auth: pipelineResult.auth,
									cause,
									deferContexts: pipelineResult.deferContexts.size > 0 ? pipelineResult.deferContexts : undefined,
									entryScript: clientEntryPath,
									matches: pipelineResult.matches,
									modulePreloads: computeRoutePreloads(match.route),
									moduleScripts: [],
									nonce,
									params: match.params,
									prefetch: isPrefetch,
									queryClient: pageQC?.queryClient,
									queryClientGetter: config.router.queryClientGetter,
									queryClientProvider: pageQC?.provider as SSRConfig["queryClientProvider"],
									resolvedHead,
									router: config.router,
									serverLogs: logsForTransport,
									sxCssManifest: sxManifest ?? undefined,
									sxRenderedModules: collectRouteModuleIds(match.route),
									url,
								});
							} finally {
								setRewrite(undefined);
							}

							response = new Response(ssrResult.body, {
								headers: ssrResult.headers,
								status: ssrResult.status,
							});
						} else {
							let hasDeferreds = false;
							for (const dCtx of pipelineResult.deferContexts.values()) {
								if (dCtx.entries().length > 0) {
									hasDeferreds = true;
									break;
								}
							}

							if (hasDeferreds) {
								response = createStreamingNDJSONResponse({
									deferContexts: pipelineResult.deferContexts,
									matches: pipelineResult.matches,
									queryClient: pageQC?.queryClient,
									serverLogs: logsForTransport,
								});
							} else {
								response = createNDJSONResponse({
									deferContexts: pipelineResult.deferContexts,
									matches: pipelineResult.matches,
									serverLogs: logsForTransport,
								});
							}

							/* apply pipeline response headers to NDJSON response */
							let merged: ResponseHeaders = {};
							for (const m of pipelineResult.matches) {
								if (m.responseHeaders) {
									merged = mergeResponseHeaders(merged, m.responseHeaders);
								}
							}
							applyResponseHeaders(response.headers, merged);
						}

						response = await applyResponseHandlers(response, responseHandlers);

						/* Set Flare cache headers (skip ISR bg renders — internal only) */
						const ssrHeadersEnabled = config.cache?.headers !== false;
						if (!isISRBgRequest && ssrHeadersEnabled) {
							if (staticMeta) {
								response.headers.set(FLARE_CACHE_HEADER, "MISS");
								response.headers.set(FLARE_RENDER_HEADER, staticMeta.mode === "isr" ? "ISR" : "SSG");
							} else {
								response.headers.set(FLARE_RENDER_HEADER, "SSR");
								let hasCacheable = false;
								let allHit = true;
								for (const m of pipelineResult.matches) {
									if (m.cacheHit !== undefined) {
										hasCacheable = true;
										if (!m.cacheHit) allHit = false;
									}
								}
								if (hasCacheable) {
									response.headers.set(FLARE_CACHE_HEADER, allHit ? "HIT" : "MISS");
								}
							}
						}

						response = addSecurityHeaders(response, secHeaders);

						/*
						 * ISR on-demand: populate store after first SSR miss.
						 * Skip if x-isr-bg header present (prevents recursion from
						 * the background re-render itself triggering another populate).
						 */
						if (staticMeta?.mode === "isr" && resolvedStore && !isDataRequest && !request.headers.get("x-isr-bg")) {
							const isrStoreKey = `static:${url.pathname}`;
							if (!isrInFlight.has(isrStoreKey)) {
								isrInFlight.add(isrStoreKey);
								const isrPopulate = (async () => {
									try {
										const htmlRes = await withTimeout(
											handler.fetch(
												new Request(request.url, {
													headers: { "x-isr-bg": "1" },
													method: "GET",
												}),
												env,
											),
											ISR_TIMEOUT,
										);
										const html = await htmlRes.text();
										const dataRes = await withTimeout(
											handler.fetch(
												new Request(request.url, {
													headers: { "x-d": "1", "x-isr-bg": "1" },
													method: "GET",
												}),
												env,
											),
											ISR_TIMEOUT,
										);
										const ndjsonBody = await dataRes.text();
										const resHeaders = headersToStaticRecord(htmlRes.headers);

										/* Replace real nonces with placeholder before storing */
										let storedHtml = html;
										const populateNonce =
											extractNonce(html) ?? extractNonce(resHeaders["content-security-policy"] ?? "");
										if (populateNonce) {
											storedHtml = replaceNonce(html, populateNonce);
											for (const [k, v] of Object.entries(resHeaders)) {
												if (v.includes(populateNonce)) {
													resHeaders[k] = replaceNonce(v, populateNonce);
												}
											}
										}

										const etag = await computeEtag(storedHtml);
										await resolvedStore.set(isrStoreKey, {
											data: { etag, headers: resHeaders, html: storedHtml, ndjson: ndjsonBody },
											storedAt: Date.now(),
										});
									} catch (e) {
										logError("isr", `background ISR population failed for ${isrStoreKey}`, e);
									} finally {
										isrInFlight.delete(isrStoreKey);
									}
								})();
								background(isrPopulate);
							}
						}

						return response;
					} catch (e: unknown) {
						if (isRedirectResponse(e)) {
							redirectCount++;
							if (redirectCount > MAX_REDIRECTS) {
								return fallbackHtmlResponse(FALLBACK_500, 500, secHeaders);
							}
							/* Preloader `throw redirect()` never lands in match.error — same NDJSON
							   as loader redirects so fetch() does not follow a raw 3xx. */
							if (request.headers.get("x-d") === "1") {
								return addSecurityHeaders(createRedirectNDJSONResponse(e), secHeaders);
							}
							return new Response(null, {
								headers: { Location: e.url },
								status: e.status,
							});
						}

						if (isUnauthenticatedError(e)) {
							return fallbackHtmlResponse(FALLBACK_401, 401, secHeaders);
						}

						if (isUnauthorizedError(e)) {
							return fallbackHtmlResponse(FALLBACK_403, 403, secHeaders);
						}

						if (isNotFoundError(e)) {
							return fallbackHtmlResponse(FALLBACK_404, 404, secHeaders);
						}

						if (isServerFnValidationError(e)) {
							return addSecurityHeaders(
								new Response(e.message, {
									headers: { "Content-Type": "text/plain" },
									status: 400,
								}),
								secHeaders,
							);
						}

						logError("handler", "unhandled request error", e);
						const html = isDev ? buildDevErrorHtml(e) : FALLBACK_500;
						const errResponse = fallbackHtmlResponse(html, 500, secHeaders);
						if (request.headers.get("x-isr-bg") !== "1" && config.cache?.headers !== false) {
							errResponse.headers.set(FLARE_RENDER_HEADER, "SSR");
						}
						return errResponse;
					} finally {
						if (dedupeFetch) disableFetchDedupe();
					}
				},
			);

			/* Inject Server-Timing header from timing tracer (covers all response paths) */
			if ("getEntries" in tracer) {
				const entries = (tracer as TimingTracer).getEntries();
				if (entries.length > 0) {
					response.headers.set("Server-Timing", buildServerTimingHeader(entries));
				}
			}

			return response;
		},
	};

	return Object.assign(handler, {
		authenticateFn: config.authenticateFn,
		getStaticParams: () => buildGetStaticParams(config.router),
		serverContext: config.serverContext,
	}) as typeof handler & {
		readonly authenticateFn?: ServerHandlerConfig<TAuth, TEnv, TServerContext>["authenticateFn"];
		readonly getStaticParams: () => Promise<StaticParamsMap>;
		readonly serverContext?: ServerHandlerConfig<TAuth, TEnv, TServerContext>["serverContext"];
	};
}
