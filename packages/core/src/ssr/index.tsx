import { getNextChildId, getOwner } from "solid-js";
import type { JSX } from "@solidjs/web";
import { createComponent, Hydration, renderToStream as solidRenderToStream } from "@solidjs/web";
import type { GlobalBoundaries } from "../boundaries/index.ts";
import { BroadcastProvider } from "../broadcast/provider.tsx";
import { createMatchCache, createPrefetchCache } from "../caches/index.ts";
import { SSRContextProvider } from "../components/ssr-context.tsx";
import type { DeferContext, DeferredEntry } from "../defer/index.ts";
import { isDeferred } from "../defer/index.ts";
import { DirectionProvider } from "../direction.ts";
import { isNotFoundError, isUnauthenticatedError, isUnauthorizedError } from "../errors/index.ts";
import { applyResponseHeaders, isRenderFn } from "../internal.ts";
import type { PipelineMatch } from "../loader-pipeline/index.ts";
import { FlareProvider, Outlet, useRouter } from "../outlet/index.tsx";
import type {
	ClientErrorRenderProps,
	ClientMatch,
	ClientNotFoundRenderProps,
	ClientUnauthenticatedRenderProps,
	ClientUnauthorizedRenderProps,
	ProviderLocation,
	RenderProps,
} from "../outlet/types.ts";
import { dk as getDynamicKeys } from "../registry/index.ts";
import type { HeadConfig } from "../route-builder/types.ts";
import { extractSerializable, type MarkedRouterConfig } from "../router-config/index.ts";
import { createTreeNode } from "../router-primitives/index.ts";
import type { ServerLogEntry } from "@lovrozagar/flare/server-context";
import { clearScopedStyles, getScopedStyles, RUNTIME_SHEET_ID } from "../styles/index.ts";
import { CRITICAL_SHEET_ID, injectCriticalAppend, type SxCssManifest } from "./critical-css.ts";
import { ThemeProvider } from "../theme.ts";
import { GLOBAL_DEFER, GLOBAL_QUERIES } from "../protocol.ts";
import { parseSearchParams, type SearchParams } from "../url/index.ts";
import { renderHeadToHtml } from "./head.ts";
import { hoistHydrationHeadMarkers } from "./hoist-head-markers.ts";
import { buildHeadPrefix } from "./head-prefix.ts";

export { mergeHeadConfigs } from "../internal.ts";
export { renderHeadToHtml } from "./head.ts";
export { buildHeadPrefix } from "./head-prefix.ts";

export const MAX_STREAM_BUFFER_SIZE = 2 * 1024 * 1024;

export interface FlareState {
	c: ContextState;
	dk?: string[];
	e?: DevError[];
	g?: ServerLogEntry[];
	m: FlareMatchState[];
	p: string;
	ph?: PerRouteHead[];
	q?: QueryState[];
	r: Record<string, string | string[]>;
	s: SearchParams;
}

export interface FlareMatchState {
	d: unknown;
	h?: HeadConfig;
	i: string;
	p?: Record<string, unknown>;
	v: string;
	x?: string;
}

export interface ContextState {
	dir?: string;
	locale?: string;
	router?: Record<string, unknown>;
	theme?: string;
}

export interface DevError {
	message: string;
	name: string;
	source: string;
	stack?: string;
}

export interface PerRouteHead {
	head: HeadConfig;
	matchId: string;
}

export interface QueryState {
	data: unknown;
	key: unknown[];
	staleTime?: number;
}

export interface ModulePreloads {
	css: string[];
	js: string[];
}

export interface SSRConfig {
	auth: unknown | null;
	cause: string;
	deferContexts?: Map<string, DeferContext>;
	entryScript?: string;
	matches: PipelineMatch[];
	modulePreloads?: ModulePreloads;
	moduleScripts: string[];
	nonce: string;
	params?: Record<string, string | string[]>;
	prefetch: boolean;
	queryClient?: unknown;
	queryClientGetter?: () => unknown;
	queryClientProvider?: (props: { children: JSX.Element; client: unknown }) => JSX.Element;
	resolvedHead: HeadConfig;
	router?: MarkedRouterConfig;
	serverLogs?: ServerLogEntry[];
	/** Loaded from flare-sx-manifest.json at server startup. Enables critical-CSS injection. */
	sxCssManifest?: SxCssManifest;
	/** Module IDs in the rendered route's dependency graph. Used to union Show/Switch branch classes. */
	sxRenderedModules?: string[];
	url: URL;
}

export interface SSRResult {
	body: ReadableStream<Uint8Array>;
	headers: Headers;
	status: number;
}

function escapeAttr(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Walk value tree, strip `promise` from Deferred markers.
 * Returns a JSON-safe clone.
 * Uses ancestry-based cycle detection: tracks objects on the current
 * recursion stack (add before recurse, delete after) so shared references
 * (diamonds) are allowed but true cycles return null.
 */
function stripDeferredPromises(value: unknown, ancestors?: WeakSet<object>): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value !== "object") return value;

	const a = ancestors ?? new WeakSet<object>();
	if (a.has(value as object)) return null;
	a.add(value as object);

	let result: unknown;
	if (Array.isArray(value)) {
		result = value.map((v) => stripDeferredPromises(v, a));
	} else {
		const obj = value as Record<string, unknown>;
		if (isDeferred(obj)) {
			result = { __deferred: true, key: obj.key };
		} else {
			const out: Record<string, unknown> = {};
			for (const key of Object.keys(obj)) {
				out[key] = stripDeferredPromises(obj[key], a);
			}
			result = out;
		}
	}

	a.delete(value as object);
	return result;
}

export function serializeFlareState(state: FlareState): string {
	const cleaned = stripDeferredPromises(state);
	/* Strip error info entirely — never serialize to client (security) */
	delete (cleaned as { e?: unknown }).e;
	const json = JSON.stringify(cleaned);
	return json.replace(/</g, "\\u003c");
}

const FLARE_STATE_MARKER = "data-flare-state";

export function buildFlareStateScript(state: FlareState, nonce: string): string {
	return `<script ${FLARE_STATE_MARKER} nonce="${escapeAttr(nonce)}">self.flare=${serializeFlareState(state)};</script>`;
}

export { applyResponseHeaders, mergeResponseHeaders } from "../internal.ts";

/**
 * Derive HTTP status from pipeline match errors.
 * Priority: 401 > 403 > 404 > 500 > 200
 */
export function deriveStatus(matches: Array<{ error?: Error }>): number {
	let status = 200;

	for (const match of matches) {
		if (!match.error) continue;

		if (isUnauthenticatedError(match.error)) return 401;

		if (isUnauthorizedError(match.error)) {
			if (status !== 401) status = 403;
		} else if (isNotFoundError(match.error)) {
			if (status !== 401 && status !== 403) status = 404;
		} else {
			if (status === 200) status = 500;
		}
	}

	return status;
}

/* ── renderToStream ────────────────────────────────────────────────── */

function buildFlareState(config: SSRConfig): FlareState {
	const matchStates: FlareMatchState[] = config.matches.map((m) => {
		const state: FlareMatchState = {
			d: stripDeferredPromises(m.loaderData),
			i: m.matchId,
			v: m.route.virtualPath,
		};
		if (m.preloaderContext) {
			for (const k in m.preloaderContext) {
				if (Object.hasOwn(m.preloaderContext, k)) {
					state.p = m.preloaderContext;
					break;
				}
			}
		}
		if (m.headConfig) {
			state.h = m.headConfig;
		}
		if (m.error) {
			state.x = m.error.name;
		}
		return state;
	});

	const contextState: ContextState = {};
	if (config.router) {
		contextState.router = extractSerializable(config.router) as Record<string, unknown>;
	}

	const state: FlareState = {
		c: contextState,
		m: matchStates,
		p: config.url.pathname,
		r: config.params ?? {},
		s: parseSearchParams(config.url.searchParams),
	};

	/* per-route heads for client initRouteHierarchy */
	const perRouteHeads: PerRouteHead[] = [];
	for (const m of config.matches) {
		if (m.headConfig) {
			perRouteHeads.push({ head: m.headConfig as HeadConfig, matchId: m.matchId });
		}
	}
	if (perRouteHeads.length > 0) {
		state.ph = perRouteHeads;
	}

	/* dynamic registry keys for client preloading (spec 18) */
	const dynamicKeys = getDynamicKeys();
	if (dynamicKeys.length > 0) {
		state.dk = dynamicKeys;
	}

	/* dev-only SSR errors for client overlay (spec 37) */
	const devErrors: DevError[] = config.matches
		.filter((m) => m.error)
		.map((m) => ({
			message: m.error?.message ?? "Unknown error",
			name: m.error?.name ?? "Error",
			source: m.route.virtualPath,
			stack: m.error?.stack,
		}));
	for (const m of config.matches) {
		if (m.headError) {
			devErrors.push({
				message: m.headError.message,
				name: `HeadError(${m.route.virtualPath})`,
				source: m.route.virtualPath,
				stack: m.headError.stack,
			});
		}
		if (m.headersError) {
			devErrors.push({
				message: m.headersError.message,
				name: `HeadersError(${m.route.virtualPath})`,
				source: m.route.virtualPath,
				stack: m.headersError.stack,
			});
		}
	}
	if (devErrors.length > 0) {
		state.e = devErrors;
	}

	/* query client hydration handled post-render in renderToStream (spec 33) */

	/* dev-only server logs for client console forwarding */
	if (config.serverLogs && config.serverLogs.length > 0) {
		state.g = config.serverLogs;
	}

	return state;
}

/**
 * Build script tags injected before </body>.
 *
 * Entry and module scripts use inline `import()` rather than `src="..."` so
 * the <script> tag itself has no network request. The actual JS is fetched
 * via <link rel="modulepreload"> in <head> (injected by injectHeadContent),
 * which Chrome can schedule at High priority with isLinkPreload=true.
 * A <script type="module" src="..."> would create a second parser-driven
 * fetch that competes with the modulepreload and appears in the critical chain.
 */
function buildScriptTags(config: SSRConfig, flareState: FlareState): string {
	const parts: string[] = [];
	const escapedNonce = escapeAttr(config.nonce);

	parts.push(buildFlareStateScript(flareState, config.nonce));

	if (config.entryScript) {
		parts.push(
			`<script nonce="${escapedNonce}" type="module" async>import(${JSON.stringify(config.entryScript).replace(/</g, "\\u003c")})</script>`,
		);
	}

	for (const src of config.moduleScripts) {
		parts.push(
			`<script nonce="${escapedNonce}" type="module" async>import(${JSON.stringify(src).replace(/</g, "\\u003c")})</script>`,
		);
	}

	return parts.join("");
}

/**
 * Convert PipelineMatch[] → ClientMatch[] for FlareProvider.
 * Pipeline uses generic fn types (Record<string, unknown> => unknown),
 * client uses JSX types. Wrappers bridge with single casts (not banned double-cast).
 */
function pipelineMatchesToClientMatches(matches: PipelineMatch[]): ClientMatch[] {
	return matches.map((m) => {
		const er = m.route.errorRender;
		const nfr = m.route.notFoundRender;
		const uar = m.route.unauthenticatedRender;
		const ur = m.route.unauthorizedRender;
		const r = m.route.render;

		return {
			_type: m.route._type as "layout" | "render",
			error: m.error,
			errorRender: isRenderFn(er)
				? (((p: ClientErrorRenderProps) => er(p) as JSX.Element) as ClientMatch["errorRender"])
				: undefined,
			loaderData: m.loaderData,
			notFoundRender: isRenderFn(nfr)
				? (((p: ClientNotFoundRenderProps) => nfr(p) as JSX.Element) as ClientMatch["notFoundRender"])
				: undefined,
			preloaderContext: m.preloaderContext,
			render: isRenderFn(r)
				? (((p: RenderProps) => r(p) as JSX.Element) as ClientMatch["render"])
				: ((() => null) as ClientMatch["render"]),
			unauthenticatedRender: isRenderFn(uar)
				? (((p: ClientUnauthenticatedRenderProps) => uar(p) as JSX.Element) as ClientMatch["unauthenticatedRender"])
				: undefined,
			unauthorizedRender: isRenderFn(ur)
				? (((p: ClientUnauthorizedRenderProps) => ur(p) as JSX.Element) as ClientMatch["unauthorizedRender"])
				: undefined,
			variablePath: m.route.variablePath,
			virtualPath: m.route.virtualPath,
		};
	});
}

/**
 * Extract root layout boundary renders as GlobalBoundaries.
 * Root layout boundaries are passed separately to FlareProvider
 * for global error/notFound/auth boundary resolution.
 */
function extractRootBoundaries(rootMatch: PipelineMatch | undefined): GlobalBoundaries {
	const boundaries: GlobalBoundaries = {};
	if (rootMatch?.route.errorRender && isRenderFn(rootMatch.route.errorRender)) {
		boundaries.error = rootMatch.route.errorRender as GlobalBoundaries["error"];
	}
	if (rootMatch?.route.notFoundRender && isRenderFn(rootMatch.route.notFoundRender)) {
		boundaries.notFound = rootMatch.route.notFoundRender as GlobalBoundaries["notFound"];
	}
	if (rootMatch?.route.unauthenticatedRender && isRenderFn(rootMatch.route.unauthenticatedRender)) {
		boundaries.unauthenticated = rootMatch.route.unauthenticatedRender as GlobalBoundaries["unauthenticated"];
	}
	if (rootMatch?.route.unauthorizedRender && isRenderFn(rootMatch.route.unauthorizedRender)) {
		boundaries.unauthorized = rootMatch.route.unauthorizedRender as GlobalBoundaries["unauthorized"];
	}
	return boundaries;
}

function RootRenderer(props: {
	data: unknown;
	location: ProviderLocation;
	preloaderContext: Record<string, unknown> | undefined;
	renderFn: (p: RenderProps) => JSX.Element;
}): JSX.Element {
	/*
	 * Client `createContext` children() consumes one hydration id in this
	 * owner before the layout runs; the server's children() memos do not.
	 * Advance the server counter so <html> `_hk` matches hydrate.
	 */
	const owner = getOwner();
	if (owner?.id != null) getNextChildId(owner);
	const router = useRouter();
	/* Getter so <Outlet> does not consume hydration child ids before <html>. */
	return props.renderFn({
		get children() {
			return <Outlet />;
		},
		loaderData: props.data,
		location: props.location,
		preloaderContext: props.preloaderContext,
		router,
	});
}

/**
 * Build component tree for SSR rendering.
 *
 * Full-document hydration: Hydration wraps entire tree including root layout.
 * Client hydrates `document` (not just #app), so root layout render fn runs
 * on both SSR and client — enabling reactive components (NavigationProgress)
 * inside root layout.
 *
 * Head components (ThemeScript, DirectionScript, etc.) use their own
 * <NoHydration> internally so their innerHTML-injected content stays inert.
 */
function buildComponentTree(config: SSRConfig, flareStateScript: string): () => JSX.Element {
	const matches = config.matches;

	return () => {
		const ssrCtxValue = {
			direction: config.router?.direction,
			entryScript: config.entryScript,
			flareStateScript,
			isServer: true,
			nonce: config.nonce,
			resolvedHead: config.resolvedHead,
			theme: config.router?.theme,
		};

		const lastMatch = matches[matches.length - 1];
		const location: ProviderLocation = {
			hash: "",
			params: config.params ?? ({} as Record<string, string | string[]>),
			pathname: config.url.pathname,
			search: parseSearchParams(config.url.searchParams),
			url: config.url,
			variablePath: lastMatch?.route.variablePath ?? "",
			virtualPath: lastMatch?.route.virtualPath ?? "",
		};

		const rootMatch = matches.find((m) => m.route._type === "root-layout");
		const nonRootMatches = matches.filter((m) => m.route._type !== "root-layout");

		const clientMatches = pipelineMatchesToClientMatches(nonRootMatches);
		const rootBoundaries = extractRootBoundaries(rootMatch);
		const matchCache = createMatchCache();
		const prefetchCache = createPrefetchCache();

		/*
		 * Full-document hydration: providers wrap root layout so components
		 * inside the root layout (e.g. NavigationProgress) have RouterContext.
		 *
		 * SSR and client: Hydration > QCP? > SSRContextProvider > Theme >
		 * Direction > Broadcast > FlareProvider > rootRenderFn({children: Outlet})
		 *
		 * All JSX inside the Hydration boundary — no pre-evaluated constants outside.
		 */
		let rootRenderFn: ((props: RenderProps) => JSX.Element) | undefined;
		if (rootMatch?.error) {
			rootRenderFn = rootMatch.route.errorRender
				? (props: RenderProps) =>
						(rootMatch.route.errorRender as (p: Record<string, unknown>) => JSX.Element)({
							...props,
							error: rootMatch.error,
							reset: () => {},
						})
				: undefined;
		} else {
			rootRenderFn = rootMatch?.route.render as typeof rootRenderFn;
		}

		const QCP = config.queryClientProvider;
		const qc = config.queryClient;

		/*
		 * Inner tree factory — must be lazy so that when QCP wraps it,
		 * component functions (useSuspenseQuery → useQueryClient) execute
		 * inside the Provider's context scope during Solid SSR.
		 */
		const renderInner = () => (
			<SSRContextProvider value={ssrCtxValue}>
				<ThemeProvider config={config.router?.theme}>
					<DirectionProvider config={config.router?.direction}>
						<BroadcastProvider>
							<FlareProvider
								boundaries={rootBoundaries}
								caseSensitive={config.router?.caseSensitive}
								initialLocation={location}
								layouts={config.router?.layouts ?? {}}
								localeConfig={config.router?.locale}
								matchCache={matchCache}
								matches={clientMatches}
								params={location.params}
								prefetchCache={prefetchCache}
								resolvers={new Map()}
								routeTree={config.router?.routeTree ?? createTreeNode()}
								search={location.search}
							>
								{rootRenderFn ? (
									RootRenderer({
										data: rootMatch?.loaderData,
										location,
										preloaderContext: rootMatch?.preloaderContext,
										renderFn: rootRenderFn,
									})
								) : (
									<Outlet />
								)}
							</FlareProvider>
						</BroadcastProvider>
					</DirectionProvider>
				</ThemeProvider>
			</SSRContextProvider>
		);

		return (
			<Hydration>
				{QCP && qc
					? createComponent(QCP, {
							get children() {
								return renderInner();
							},
							client: qc,
						})
					: renderInner()}
			</Hydration>
		) as JSX.Element;
	};
}

/**
 * Inject resolved head tags, CSP nonce meta, and scoped styles before </head>.
 * Returns updated buffer with head content injected, or original buffer if </head> not found.
 *
 * Head structure:
 *   1. Solid's hydratable head children (`<!--$-->` first — required for Solid 2)
 *   2. CSP nonce / viewport / theme / direction / locale scripts (headPrefix)
 *   3. modulepreload + stylesheets
 *   4. Resolved <head> tags (title, meta, etc.)
 *   5. Scoped styles
 *
 * Prefix is appended (not prepended) so hydrate can walk Solid's markers.
 * Theme scripts still run in `<head>` before `<body>` is parsed.
 */
function injectHeadContent(
	buffer: string,
	config: SSRConfig,
	scopedStyles: string,
	extraSuffix = "",
	devSxCss = "",
	devSxClasses: string[] = [],
): string {
	const escapedNonce = escapeAttr(config.nonce);
	const headPrefix = buildHeadPrefix({
		direction: config.router?.direction,
		locale: config.router?.locale,
		modulePreloads: config.modulePreloads,
		nonce: config.nonce,
		resolvedHead: config.resolvedHead,
		theme: config.router?.theme,
	});

	let headSuffix = "";
	const headHtml = renderHeadToHtml(config.resolvedHead, config.nonce);
	/* Runtime scoped sheet first so route `head().custom.styles` win at equal specificity. */
	if (scopedStyles) {
		const safeStyles = scopedStyles.replace(/<\/style\b/gi, "<\\/style");
		headSuffix += `<style id="${RUNTIME_SHEET_ID}" nonce="${escapedNonce}">${safeStyles}</style>`;
	}
	if (headHtml) headSuffix += headHtml;
	/* Critical-CSS placeholder — body not known yet; late-inject populates it near </body>. */
	if (config.sxCssManifest) {
		const nonceAttr = config.nonce ? ` nonce="${escapedNonce}"` : "";
		headSuffix += `<style id="${CRITICAL_SHEET_ID}"${nonceAttr}></style>`;
		const href = config.sxCssManifest.bundleHref;
		if (href) {
			const escapedHref = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
			/* Direct stylesheet — inline `onload="this.rel='stylesheet'"` preload trick violates
			 * CSP `script-src` (inline event handler). Critical CSS already ships in the head
			 * placeholder above, so the bundle link can resolve synchronously without the swap. */
			headSuffix += `<link rel="stylesheet" href="${escapedHref}"${nonceAttr}/>`;
		}
	}
	/*
	 * Dev-mode sx CSS inlined directly — CF Workers SSR bypasses transformIndexHtml so the
	 * placeholder <style id="flare-sx-dev"> is never in the template HTML. Inlining here
	 * ensures styles land in the SSR response before any JS runs.
	 */
	if (devSxCss) {
		const nonceAttr = config.nonce ? ` nonce="${escapedNonce}"` : "";
		const safeCss = devSxCss.replace(/<\/style\b/gi, "<\\/style");
		headSuffix += `<style id="flare-sx-dev"${nonceAttr}>${safeCss}</style>`;
		if (devSxClasses && devSxClasses.length > 0) {
			/* Seed window.__flare_sx_classes__ with the full SSR class-pool before any module
			 * runs. Per-module client inject snippets dedupe against this Set — stops duplicate
			 * @layer app rules from stacking and flipping source-order cascade (breaks combos
			 * like `hidden md:flex`). */
			const seedJson = JSON.stringify(devSxClasses).replace(/</g, "\\u003c");
			headSuffix += `<script${nonceAttr}>window.__flare_sx_classes__=new Set(${seedJson})</script>`;
		}
	}

	/*
	 * CSP with nonce-based style-src blocks inline style="" attributes.
	 * Extract <body style="..."> and promote to a nonce'd <style> tag so
	 * critical body styles (font-family, background, color) apply on first paint.
	 */
	const bodyStyleMatch = buffer.match(/<body\b[^>]*?\sstyle="([^"]*)"/);
	if (bodyStyleMatch) {
		const cssText = bodyStyleMatch[1]
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">");
		headSuffix += `<style nonce="${escapedNonce}">body{${cssText}}</style>`;
	}

	const result = buffer.replace("</head>", `${headPrefix}${headSuffix}${extraSuffix}</head>`);
	return hoistHydrationHeadMarkers(result);
}

/**
 * Inject hydration scripts (flare state + entry) before </body>.
 * Automatic — no component needed in root layout.
 */
export function serializeQueryClientCache(qc: unknown, nonce: string): string {
	const typed = qc as
		| {
				getQueryCache?: () => {
					getAll?: () => Array<{
						options?: { staleTime?: number };
						queryKey: unknown[];
						state: { data: unknown };
					}>;
				};
		  }
		| undefined;
	const queries = typed?.getQueryCache?.()?.getAll?.();
	if (!queries || queries.length === 0) return "";
	const entries: QueryState[] = queries.map((q) => {
		const qs: QueryState = { data: q.state.data, key: q.queryKey };
		if (q.options?.staleTime !== undefined) {
			qs.staleTime = q.options.staleTime;
		}
		return qs;
	});
	const json = JSON.stringify(entries).replace(/</g, "\\u003c");
	return `<script nonce="${escapeAttr(nonce)}">self.flare.q=${json};</script>`;
}

function injectBodyContent(buffer: string, config: SSRConfig, flareState: FlareState, qcScript: string): string {
	/* Late-inject critical CSS computed from final rendered body + module manifest. */
	let result = config.sxCssManifest
		? injectCriticalAppend(buffer, config.sxRenderedModules ?? [], config.sxCssManifest, config.nonce)
		: buffer;

	let scripts = buildScriptTags(config, flareState);
	if (qcScript) scripts = scripts.replace(/<\/script>/, `</script>${qcScript}`);
	if (scripts) result = result.replace("</body>", `${scripts}</body>`);
	return result;
}

export function renderToStream(config: SSRConfig): SSRResult {
	clearScopedStyles();

	/* Resolve queryClient from getter if not provided directly */
	if (!config.queryClient && config.queryClientGetter) {
		config.queryClient = config.queryClientGetter();
	}

	const flareState = buildFlareState(config);
	const flareStateScript = buildFlareStateScript(flareState, config.nonce);
	const treeFactory = buildComponentTree(config, flareStateScript);

	const solidStream = solidRenderToStream(treeFactory, { nonce: config.nonce });

	/*
	 * Capture scoped styles immediately after sync render completes.
	 * Components register styles during solidRenderToStream (synchronous).
	 * Reading eagerly prevents a concurrent SSR render from clearing the
	 * registry before our stream transform runs injectHeadContent.
	 */
	const capturedStyles = getScopedStyles();

	const encoder = new TextEncoder();
	const decoder = new TextDecoder();

	/*
	 * Solid only injects _$HY when async work exists (Loading, deferred data).
	 * For sync-only rendering, _$HY is never set, but client `hydrate()` always
	 * reads `globalThis._$HY.done`. Inject a minimal _$HY init unconditionally.
	 */
	const hyInit = `<script nonce="${escapeAttr(config.nonce)}">window._$HY||(window._$HY={events:[],completed:new WeakSet,r:{},fe(){},done:false})</script>`;

	let streamBuffer = "";
	let streamDoctypeInjected = false;
	let streamHeadInjected = false;
	let streamBodyInjected = false;
	let hyInjected = false;

	/* Solid's pipeTo writes Uint8Array chunks despite the typing */
	const { readable, writable } = new TransformStream();
	/* Prevent unhandled rejection — Solid's pipeTo returns Promise at runtime despite void typing */
	void Promise.resolve(solidStream.pipeTo(writable)).catch(() => {});

	const reader = readable.getReader();

	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				/*
				 * Resolve dev sx CSS before the read loop so both injectHeadContent call sites
				 * (in-loop and flush) get the same snapshot. Dynamic import re-runs the virtual
				 * module's load hook each time — no caching — so HMR additions are reflected.
				 * Guarded by import.meta.env.DEV so prod builds tree-shake this entirely.
				 */
				let resolvedDevSxCss = "";
				let resolvedDevSxClasses: string[] = [];
				if (import.meta.env.DEV) {
					try {
						const mod = await import("virtual:flare-sx-dev-css");
						resolvedDevSxCss = mod.getDevSxCss();
						resolvedDevSxClasses = mod.getDevSxClasses();
					} catch {
						/* virtual module absent (sx plugin not enabled) — silently skip */
					}
				}

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const chunk = value instanceof Uint8Array ? decoder.decode(value, { stream: true }) : String(value);
					streamBuffer += chunk;

					if (streamBuffer.length > MAX_STREAM_BUFFER_SIZE) {
						controller.enqueue(encoder.encode("<!-- flare: stream buffer limit exceeded, aborting render -->"));
						controller.close();
						return;
					}

					if (!streamDoctypeInjected && streamBuffer.includes("<html")) {
						streamDoctypeInjected = true;
						streamBuffer = streamBuffer.replace("<html", "<!DOCTYPE html><html");
					}

					if (!streamHeadInjected && streamBuffer.includes("</head>")) {
						streamHeadInjected = true;
						/*
						 * Inject _$HY init at end of <head> so it runs before body content.
						 * Must NOT be after <body> tag — full-document hydration walks body.firstChild,
						 * and an injected script there would break the DOM traversal.
						 * Passed as extraSuffix to avoid scanning buffer for </head> twice.
						 */
						const hySuffix = hyInjected ? "" : hyInit;
						hyInjected = true;
						streamBuffer = injectHeadContent(
							streamBuffer,
							config,
							capturedStyles,
							hySuffix,
							resolvedDevSxCss,
							resolvedDevSxClasses,
						);
					}

					if (!streamBodyInjected && streamBuffer.includes("</body>")) {
						streamBodyInjected = true;
						/* QC serialization deferred to here — queries populate during stream render */
						const qcScript = config.queryClient ? serializeQueryClientCache(config.queryClient, config.nonce) : "";
						streamBuffer = injectBodyContent(streamBuffer, config, flareState, qcScript);
					}

					if (streamHeadInjected && streamBodyInjected) {
						controller.enqueue(encoder.encode(streamBuffer));
						streamBuffer = "";
					} else {
						const safeLen = streamBuffer.length - 20;
						if (safeLen > 0) {
							controller.enqueue(encoder.encode(streamBuffer.slice(0, safeLen)));
							streamBuffer = streamBuffer.slice(safeLen);
						}
					}
				}

				/* Flush remaining — use same helpers as loop to avoid duplication */
				if (!streamHeadInjected) {
					streamBuffer = injectHeadContent(
						streamBuffer,
						config,
						capturedStyles,
						"",
						resolvedDevSxCss,
						resolvedDevSxClasses,
					);
				}
				if (!streamBodyInjected) {
					const qcFlush = config.queryClient ? serializeQueryClientCache(config.queryClient, config.nonce) : "";
					streamBuffer = injectBodyContent(streamBuffer, config, flareState, qcFlush);
				}
				if (streamBuffer.length > 0) {
					controller.enqueue(encoder.encode(streamBuffer));
				}

				/* Stream deferred resolution scripts after HTML */
				if (config.deferContexts && config.deferContexts.size > 0) {
					/* Install QC tracking so deferred callbacks' setQueryData calls are captured */
					let trackedQC:
						| { drain(): Array<{ data: unknown; key: unknown[]; staleTime?: number }>; release(): void }
						| undefined;
					if (config.queryClient) {
						const { createTrackedQueryClient } = await import("../query-client");
						const typed = config.queryClient as Parameters<typeof createTrackedQueryClient>[0];
						trackedQC = createTrackedQueryClient(typed);
					}

					const entries: DeferredEntry[] = [];
					for (const ctx of config.deferContexts.values()) {
						for (const e of ctx.entries()) {
							entries.push(e);
						}
					}
					const escapedNonce = escapeAttr(config.nonce);
					const esc = (s: string) => JSON.stringify(s).replace(/</g, "\\u003c");
					await Promise.allSettled(
						entries.map(async (entry) => {
							const resolverKey = esc(`${entry.matchId}:${entry.key}`);
							try {
								const data = await entry.promise;
								const json = JSON.stringify(data).replace(/</g, "\\u003c");
								controller.enqueue(
									encoder.encode(
										`<script nonce="${escapedNonce}">(self.${GLOBAL_DEFER}=self.${GLOBAL_DEFER}||[]).push([${resolverKey},${json}])</script>`,
									),
								);
							} catch (err) {
								const msg = err instanceof Error ? err.message : String(err);
								const safeMsg = esc(msg);
								controller.enqueue(
									encoder.encode(
										`<script nonce="${escapedNonce}">(self.${GLOBAL_DEFER}=self.${GLOBAL_DEFER}||[]).push([${resolverKey},${safeMsg},true])</script>`,
									),
								);
							}

							/* Stream QC delta entries accumulated during this deferred resolve */
							if (trackedQC) {
								const qcEntries = trackedQC.drain();
								for (const qcEntry of qcEntries) {
									const qcJson = JSON.stringify(qcEntry).replace(/</g, "\\u003c");
									controller.enqueue(
										encoder.encode(
											`<script nonce="${escapedNonce}">(self.${GLOBAL_QUERIES}=self.${GLOBAL_QUERIES}||[]).push([${qcJson}])</script>`,
										),
									);
								}
							}
						}),
					);
					trackedQC?.release();
				}

				controller.close();
			} catch (e) {
				controller.error(e);
			} finally {
				reader.releaseLock();
			}
		},
	});

	const status = deriveStatus(config.matches);

	const lastMatch = config.matches[config.matches.length - 1];
	const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
	if (lastMatch?.responseHeaders) {
		applyResponseHeaders(headers, lastMatch.responseHeaders);
	}

	return { body, headers, status };
}
