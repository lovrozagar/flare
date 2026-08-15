import {
	compilePattern,
	type FlareMiddleware,
	isPathMatcher,
	type MiddlewareEntry,
	type PathMatcher,
} from "../middleware/index.ts";
import type { MountConfig } from "../mount/index.ts";
import type { MarkedRouterConfig } from "../router-config/index.ts";
import type { SecurityConfig } from "../security/index.ts";
import type {
	HandlerCacheConfig,
	ServerHandler,
	ServerHandlerConfig,
	SitemapSubmitConfig,
	StaticParamsMap,
	TracingConfig,
} from "../server-handler/index.ts";

export type { SecurityConfig } from "../security/index.ts";
export { background } from "@lovrozagar/flare/server-context";
export type { CdnPurgeAdapter, HandlerCacheConfig } from "../server-handler/index.ts";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface KeepaliveConfig {
	handler?: (ctx: import("../middleware").MiddlewareContext) => Promise<void> | void;
	interval: number;
}

export type MountTarget =
	| {
			fetch: (
				request: Request,
				env: unknown,
				ctx: { waitUntil(p: Promise<unknown>): void },
			) => Response | Promise<Response>;
	  }
	| ((request: Request, env: unknown, ctx: { waitUntil(p: Promise<unknown>): void }) => Response | Promise<Response>);

export interface ServerBuilder<TExcluded extends string = never> {
	authenticateFn: "authenticateFn" extends TExcluded
		? never
		: <TAuth>(
				fn: (ctx: {
					callerData?: unknown[];
					env: unknown;
					request: Request;
					serverContext: Record<string, unknown>;
					url: URL;
				}) => TAuth | null | Promise<TAuth | null>,
			) => ServerBuilder<TExcluded | "authenticateFn">;
	cache: "cache" extends TExcluded ? never : (config: HandlerCacheConfig) => ServerBuilder<TExcluded | "cache">;
	fetch(request: Request, env?: unknown, ctx?: { waitUntil?: (p: Promise<unknown>) => void }): Promise<Response>;
	getStaticParams(): Promise<StaticParamsMap>;
	keepalive: "keepalive" extends TExcluded
		? never
		: (config: KeepaliveConfig) => ServerBuilder<TExcluded | "keepalive">;
	mount(prefix: string, target: MountTarget): ServerBuilder<TExcluded>;
	security: "security" extends TExcluded
		? never
		: (
				config:
					| SecurityConfig
					| ((ctx: {
							env: unknown;
							nonce: string;
							request: Request;
							serverContext: Record<string, unknown>;
					  }) => SecurityConfig),
			) => ServerBuilder<TExcluded | "security">;
	serverContext: "serverContext" extends TExcluded
		? never
		: <T extends Record<string, unknown>>(
				fn: (ctx: { env: unknown; request: Request }) => T | Promise<T>,
			) => ServerBuilder<TExcluded | "serverContext">;
	sitemap: "sitemap" extends TExcluded ? never : (config: SitemapSubmitConfig) => ServerBuilder<TExcluded | "sitemap">;
	tracing: "tracing" extends TExcluded ? never : (config: TracingConfig) => ServerBuilder<TExcluded | "tracing">;
	use(...args: (FlareMiddleware | PathMatcher | string)[]): ServerBuilder<TExcluded>;
}

/* Internal implementation type — no exclusion tracking */
interface ServerBuilderImpl {
	authenticateFn(fn: ServerHandlerConfig["authenticateFn"]): ServerBuilderImpl;
	cache(config: HandlerCacheConfig): ServerBuilderImpl;
	fetch(request: Request, env?: unknown, ctx?: { waitUntil?: (p: Promise<unknown>) => void }): Promise<Response>;
	getStaticParams(): Promise<StaticParamsMap>;
	keepalive(config: KeepaliveConfig): ServerBuilderImpl;
	mount(prefix: string, target: MountTarget): ServerBuilderImpl;
	security(
		config:
			| SecurityConfig
			| ((ctx: {
					env: unknown;
					nonce: string;
					request: Request;
					serverContext: Record<string, unknown>;
			  }) => SecurityConfig),
	): ServerBuilderImpl;
	serverContext(
		fn: (ctx: { env: unknown; request: Request }) => Record<string, unknown> | Promise<Record<string, unknown>>,
	): ServerBuilderImpl;
	sitemap(config: SitemapSubmitConfig): ServerBuilderImpl;
	tracing(config: TracingConfig): ServerBuilderImpl;
	use(...args: (FlareMiddleware | PathMatcher | string)[]): ServerBuilderImpl;
}

/* ── Builder ───────────────────────────────────────────────────────────── */

const KEEPALIVE_PATH = "/_flare/keepalive";

/*
 * server-handler/index.ts imports virtual modules (virtual:flare-client-entry, etc.)
 * that only exist inside Vite's module graph. Lazy-importing it in fetch() keeps the
 * builder module free of those dependencies at evaluation time — this is the correct
 * boundary: config collection is static, handler creation is runtime.
 */
let resolvedCreateServerHandler: typeof import("../server-handler").createServerHandler | undefined;

async function getCreateServerHandler() {
	if (!resolvedCreateServerHandler) {
		const mod = await import("../server-handler");
		resolvedCreateServerHandler = mod.createServerHandler;
	}
	return resolvedCreateServerHandler;
}

function normalizeMountTarget(target: MountTarget): MountConfig["fetch"] {
	if (typeof target === "function") return target;
	return (req, env, ctx) => target.fetch(req, env, ctx);
}

/**
 * Cloudflare ExecutionContext.waitUntil must be invoked as a method.
 * Passing the extracted function loses `this` and throws Illegal invocation,
 * which previously turned a finished SSR into a 500.
 */
function bindWaitUntil(ctx?: {
	waitUntil?: (p: Promise<unknown>) => void;
}): ((p: Promise<unknown>) => void) | undefined {
	if (!ctx?.waitUntil) return undefined;
	return (p) => {
		ctx.waitUntil!(p);
	};
}

export function createServer(router: MarkedRouterConfig): ServerBuilder {
	const middlewareEntries: MiddlewareEntry[] = [];
	const mountConfigs: MountConfig[] = [];
	let authenticateFn: ServerHandlerConfig["authenticateFn"];
	let serverContextFn: ServerHandlerConfig["serverContext"];
	let cacheConfig: HandlerCacheConfig | undefined;
	let keepaliveConfig: KeepaliveConfig | undefined;
	let securityCfg: ServerHandlerConfig["securityConfig"];
	let sitemapConfig: SitemapSubmitConfig | undefined;
	let tracingConfig: TracingConfig | undefined;

	type ResolvedHandler = ServerHandler & {
		getStaticParams(): Promise<StaticParamsMap>;
	};

	let cachedHandler: ResolvedHandler | undefined;
	let handlerConfig: ServerHandlerConfig | undefined;

	async function getHandler(waitUntil?: (p: Promise<unknown>) => void): Promise<ResolvedHandler> {
		if (cachedHandler && handlerConfig) {
			handlerConfig.waitUntil = waitUntil;
			return cachedHandler;
		}

		const allEntries = [...middlewareEntries];

		if (keepaliveConfig) {
			const { handler: keepaliveHandler } = keepaliveConfig;
			const keepaliveMw: FlareMiddleware = async (ctx) => {
				if (ctx.url.pathname !== KEEPALIVE_PATH || ctx.request.method !== "GET") {
					return ctx.next();
				}
				if (keepaliveHandler) {
					try {
						await keepaliveHandler(ctx);
					} catch {
						/* swallow keepalive handler errors */
					}
				}
				return ctx.bypass(new Response(null, { status: 204 }));
			};
			allEntries.unshift({ middlewares: [keepaliveMw] });
		}

		/* Inject keepalive interval into router so it serializes to client via FlareState */
		const routerWithKeepalive = keepaliveConfig
			? Object.assign({}, router, { keepalive: keepaliveConfig.interval })
			: router;

		const config: ServerHandlerConfig = {
			authenticateFn,
			cache: cacheConfig,
			middlewareEntries: allEntries,
			mount: mountConfigs.length > 0 ? mountConfigs : undefined,
			router: routerWithKeepalive,
			securityConfig: securityCfg,
			serverContext: serverContextFn,
			sitemap: sitemapConfig,
			tracing: tracingConfig,
			waitUntil,
		};

		const create = await getCreateServerHandler();
		handlerConfig = config;
		cachedHandler = create(config);
		return cachedHandler;
	}

	const builder: ServerBuilderImpl = {
		authenticateFn(fn) {
			authenticateFn = fn;
			return builder;
		},
		cache(config) {
			cacheConfig = config;
			return builder;
		},
		async fetch(request, env, ctx) {
			const h = await getHandler(bindWaitUntil(ctx));
			return h.fetch(request, env);
		},
		async getStaticParams() {
			const h = await getHandler();
			return h.getStaticParams();
		},
		keepalive(config) {
			keepaliveConfig = config;
			return builder;
		},
		mount(prefix, target) {
			mountConfigs.push({
				fetch: normalizeMountTarget(target),
				prefix,
			});
			return builder;
		},
		security(config) {
			securityCfg = config;
			return builder;
		},
		serverContext(fn) {
			serverContextFn = fn;
			return builder;
		},
		sitemap(config) {
			sitemapConfig = config;
			return builder;
		},
		tracing(config) {
			tracingConfig = config;
			return builder;
		},
		use(...args) {
			const matchers: Array<(path: string) => boolean> = [];
			const middlewares: FlareMiddleware[] = [];

			for (const arg of args) {
				if (typeof arg === "string") {
					matchers.push(compilePattern(arg));
				} else if (isPathMatcher(arg)) {
					matchers.push(arg);
				} else {
					middlewares.push(arg);
				}
			}

			if (middlewares.length > 0) {
				const entry: MiddlewareEntry = { middlewares };
				if (matchers.length > 0) {
					entry.matchers = matchers;
				}
				middlewareEntries.push(entry);
			}

			return builder;
		},
	};

	return builder as ServerBuilder;
}
