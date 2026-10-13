/// <reference types="vite/client" />
import { defined } from "../../shared/errors/index.ts";
import { PRERENDER } from "../../shared/protocol/prerender.ts";
import type { FlareRegister } from "../../shared/route-builder/register.ts";
import { loadChain, type Match } from "../../shared/router/create-router.ts";
import { withServerContext } from "../context/ctx.ts";
import { runLoaders } from "../loaders/run.ts";
import { devSink, projectError, type ErrorSink } from "../render/projector.ts";
import { applySecurity } from "../security/apply.ts";
import { applyCanonical } from "./canonical-redirect.ts";
import { dispatch } from "../server-fn/dispatch.ts";
import { classify, isServerFn } from "./classify.ts";
import { answer, background, bare, failed, passed, secure, type Exchange } from "./exchange.ts";
import { dispatchMount, mountTable } from "../mount/mount.ts";
import { runMiddleware } from "../middleware/run.ts";
import type { MiddlewareKind } from "../middleware/types.ts";
import { routeMethod, type MethodMatch } from "./methods.ts";
import { responseHeaders } from "./policies.ts";
import { effectiveAuth } from "../auth/effective.ts";
import type { FlareServer, RuntimeOptions, ServerOptions } from "./options.ts";
import { loaderInput, notFound, type Loaded } from "./answers.ts";
import { prerenderer, type Capture } from "../cache/prerender.ts";
import { checkSite } from "../cache/scrub.ts";
import { pageAnswer, requestStore } from "../cache/serve.ts";
import { storeTiming } from "../cache/write.ts";

export type { FlareServer, ServerOptions } from "./options.ts";

// The stages of order.ts, in that order: canonical, serverContext, match, method, then validate, the auth
// gate, and the loaders inside runLoaders, then render and finalize.
export function createServer<R extends FlareRegister = FlareRegister>(options: ServerOptions<R>): FlareServer;
export function createServer(options: RuntimeOptions): FlareServer {
	// Literal reads: Vite replaces only `import.meta.env.DEV`, and its runner rejects passing `import.meta` whole.
	return serveWith(options, devSink({ env: { DEV: import.meta.env.DEV }, hot: import.meta.hot }));
}

// The dev flag and the overlay sender come from Vite (B93). Tests pass their own sink. No entry exports this.
export function serveWith(options: RuntimeOptions, sink: ErrorSink): FlareServer {
	checkSite(options.site, { store: options.store !== undefined, dev: sink.dev });
	const { trailingSlash, caseSensitive } = options.router;
	const at: Serving = { options, sink, mounts: mountTable(options.mounts ?? [], { trailingSlash, caseSensitive }) };
	const server: FlareServer = { fetch: (request, env, ctx) => serveOne(at, { request, env, ctx }) };
	// The internal channel `vite build`'s prerender reads. It runs the same pipeline with a capture (bits/12).
	const prerender = prerenderer(options, (request, env, capture) => serveOne(at, { request, env, prerender: capture }));
	return Object.assign(server, { [PRERENDER]: prerender });
}

type Serving = { options: RuntimeOptions; sink: ErrorSink; mounts: ReturnType<typeof mountTable> };

type Call = {
	request: Request;
	env: unknown;
	ctx?: Parameters<FlareServer["fetch"]>[2] | undefined;
	prerender?: Capture | undefined;
};

// One request through the pipeline (02-system).
function serveOne(at: Serving, call: Call): Promise<Response> {
	const { options, sink } = at;
	const { request, env } = call;
	const secured = applySecurity({ url: request.url, headers: new Headers(), security: options.security });
	const internal = classify(new URL(request.url), options.router.basePath);
	const capture = call.prerender === undefined ? {} : { prerender: call.prerender };
	const outer = { options, request, env, secured, sink, kind: "document" as const, stale: null, ...capture };
	if (internal.status !== 200) return Promise.resolve(answer(outer, internal.status));
	// Rebuilt only when an internal param was removed: a new Request would take over the body stream.
	const inner = internal.url.href === request.url ? request : new Request(internal.url, request);
	const exchange = { ...outer, request: inner, kind: internal.kind, stale: internal.stale };
	const step = applyCanonical({
		method: request.method,
		url: request.url,
		basePath: options.router.basePath,
		trailingSlash: options.router.trailingSlash,
		caseSensitive: options.router.caseSensitive,
	});
	if (step.status !== 200) return Promise.resolve(answer(exchange, step.status, step.location));
	// serverContext runs once, before mounts (02-system step 2). A mount never calls authenticate.
	const ctx = { env, ctx: call.ctx ?? background(sink) };
	const waitUntil = (promise: Promise<unknown>): void => ctx.ctx.waitUntil(promise);
	const store = requestStore(options.store, env);
	const { serverContext, authenticate } = options;
	return withServerContext(
		{ request, env, serverContext, authenticate, store, waitUntil },
		(scope) => {
			// 02-system step 3. A mount's answer, or its throw as a 500, still leaves through finalize.
			const mounted = dispatchMount(at.mounts, inner, ctx);
			if (mounted !== undefined) return mounted.then((response) => passed(exchange, response), failed(exchange));
			const seeds = requestStore(options.static, env);
			return route({ ...exchange, session: scope.session, waitUntil, store, seeds });
		},
		() => answer(exchange, 500),
	);
}

// The method check runs on the match alone (02-system step 9). Route code loads only for the handler that runs
// (step 10), so an OPTIONS, a 405, or an unmatched method imports nothing.
// 02-system step 6: the middleware list wraps the server function and the router. Whatever answers, the router,
// a returned Response, or a stash, leaves through finalize with the security set (B34).
function route(exchange: Exchange): Promise<Response> {
	const url = new URL(exchange.request.url);
	const fn = isServerFn(url, exchange.options.router.basePath);
	const inner = (): Promise<Response> => (fn ? serverFn(exchange) : routed(exchange, url));
	const middleware = exchange.options.middleware ?? [];
	if (middleware.length === 0) return inner();
	const kind: MiddlewareKind = fn ? "serverFn" : "page";
	const input = { request: exchange.request, env: exchange.env, kind, fail: failed(exchange) };
	return runMiddleware(middleware, input, inner).then((response) => passed(exchange, response));
}

// 02-system steps 8 and 9: match, then the method rule.
function routed(exchange: Exchange, url: URL): Promise<Response> {
	const matched = exchange.options.router.match(url.pathname);
	const method = exchange.request.method;
	if (matched.id === undefined && (method === "GET" || method === "HEAD")) {
		// A data or prefetch request for an unknown URL is that status alone, with no frame (B73).
		if (exchange.kind !== "document") return Promise.resolve(answer(exchange, 404));
		return loaded(exchange, matched, (chain) => notFound(exchange, chain));
	}
	return routeMethod(exchange.request, {
		match: () => methodMatch(exchange, matched),
		headers: exchange.secured.headers,
	});
}

// A .response() page has no method list, so every method reaches it (02-system step 9).
function methodMatch(exchange: Exchange, matched: Match): MethodMatch | undefined {
	if (matched.id === undefined) return undefined;
	if (matched.response === true) {
		return { kind: "response", handle: () => loaded(exchange, matched, (chain) => answered(exchange, chain)) };
	}
	return { kind: "page", render: () => loaded(exchange, matched, (chain) => pageAnswer(exchange, chain)) };
}

// Awaits the chain's modules, then runs the handler. An import that fails on the server is a bug: projected,
// then 500.
async function loaded(
	exchange: Exchange,
	matched: Match,
	run: (chain: Loaded) => Promise<Response>,
): Promise<Response> {
	let chain: Loaded;
	try {
		chain = { ...matched, chain: await loadChain(matched.chain) };
		// A bad store timing is a bug of this page, found before any render (dx/cache.md).
		if (matched.id !== undefined) storeTiming(matched.id, chain.chain.at(-1)?.module.cache);
	} catch (error) {
		projectError(error, exchange.sink);
		return answer(exchange, 500);
	}
	return run(chain);
}

// The answer still passes through finalize, and the request's security set wins over its headers. A node
// flagged as .response() whose module has none is a codegen bug: projected, then 500.
async function answered(exchange: Exchange, matched: Loaded): Promise<Response> {
	const respond = defined(matched.chain.at(-1), "the .response() page").module.response;
	if (respond === undefined) {
		projectError(new Error(`${matched.id} is flagged as a .response() page but has no response`), exchange.sink);
		return answer(exchange, 500);
	}
	const run = await runLoaders({ ...loaderInput(exchange, matched), response: respond });
	if (run.answer === undefined) return bare(exchange, run);
	const headers = responseHeaders(run.answer.headers, effectiveAuth(matched.chain.map((entry) => entry.module)));
	return secure(exchange, { status: run.answer.status, body: run.answer.body, headers });
}

// Step 7: a server function is dispatched and never reaches the router (B42).
async function serverFn(exchange: Exchange): Promise<Response> {
	const { serverFns = {}, sameSite = [], bodyLimit, router } = exchange.options;
	const input = { request: exchange.request, serverFns, sameSite, sink: exchange.sink, basePath: router.basePath };
	return secure(exchange, await dispatch({ ...input, bodyLimit }));
}
