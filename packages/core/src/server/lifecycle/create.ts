/// <reference types="vite/client" />
import { defined } from "../../shared/errors/index.ts"
import { RedirectError } from "../../shared/errors/redirect.ts"
import { redirectLocation } from "../redirect/index.ts"
import { PRERENDER } from "../../shared/protocol/prerender.ts"
import type { FlareRegister } from "../../shared/route-builder/register.ts"
import type { Match } from "../../shared/router/create-router.ts"
import { loadChain } from "../../shared/router/load-chain.ts"
import { serverCtx, withoutIdentity, withServerContext } from "../context/ctx.ts"
import { runLoaders } from "../loaders/run.ts"
import { devDocument, devToken } from "../render/dev-document.ts"
import { devSink, devStyles, projectError, requestSink, type ErrorSink } from "../render/projector.ts"
import { applySecurity, type SecurityContext } from "../security/apply.ts"
import { canonicalStep, type CanonicalStep } from "./canonical-redirect.ts"
import { dispatch } from "../server-fn/dispatch.ts"
import { routeCsrf } from "../server-fn/csrf.ts"
import { bodyLimitOf } from "../server-fn/input.ts"
import { classify, isServerFn } from "./classify.ts"
import { answer, answerFrom, background, bare, bounded, failed, passed, secure, type Exchange } from "./exchange.ts"
import { mountFor, mountTable } from "../mount/mount.ts"
import { checkLocale, withLocale } from "./locale-slot.ts"
import { runMiddleware } from "../middleware/run.ts"
import type { MiddlewareKind } from "../middleware/types.ts"
import { checkResponseMethods, refusedChannel, routeMethod, type MethodMatch } from "./methods.ts"
import { decodedHeaders, responseHeaders } from "./policies.ts"
import { effectiveAuth } from "../auth/effective.ts"
import type { FlareServer, RuntimeOptions, ServerOptions } from "./options.ts"
import { loaderInput, notFound, type Loaded } from "./answers.ts"
import { prerenderer, type Capture } from "../cache/prerender.ts"
import { checkSite } from "../cache/scrub.ts"
import { pageAnswer, requestStore } from "../cache/serve.ts"
import { storeTiming } from "../cache/write.ts"
import { buildId, devHead } from "./build-info.ts"
import { markUnmatched, rewrapWatch } from "./finalize.ts"
import { routeKey } from "../cache/key.ts"
import type { BuildInput } from "../../shared/url/href.ts"
import { checkRetired, isRetired, retiredWorker } from "./retire-worker.ts"

export type { FlareServer, ServerOptions } from "./options.ts"

// The stages of order.ts, in that order: canonical, serverContext, match, method, then validate, the auth
// gate, and the loaders inside runLoaders, then render and finalize.
export function createServer<R extends FlareRegister = FlareRegister>(options: ServerOptions<R>): FlareServer
export function createServer(options: RuntimeOptions): FlareServer {
	// Literal reads: Vite replaces only `import.meta.env.DEV`, and its runner rejects passing `import.meta` whole. Outside
	// Vite, as when Node loads the packed `dist`, `import.meta.env` is absent, and that is production.
	return serveWith(options, devSink({ env: { DEV: import.meta.env?.DEV }, hot: import.meta.hot }, STYLES))
}

// One dev styles client per evaluation of this module, made as it evaluates: a full reload's new hot context drops the
// previous evaluation's listeners and this one's listens from the same turn, so no reply falls between (BUGS.md 86).
const STYLES = devStyles(import.meta.hot)

// The dev flag and the overlay sender come from Vite (B93). Tests pass their own sink. No entry exports this.
export function serveWith(options: RuntimeOptions, sink: ErrorSink): FlareServer {
	checkSite(options.site, { store: options.store !== undefined, dev: sink.dev })
	checkLocale(options.locale, options.router)
	checkResponseMethods(options.router)
	checkPlanned(options)
	checkRetired(options.retireServiceWorker)
	const { trailingSlash, caseSensitive } = options.router
	const bodyLimit = bodyLimitOf(options.bodyLimit)
	const mounts = mountTable(options.mounts ?? [], { trailingSlash, caseSensitive })
	const at: Serving = { options: { ...options, bodyLimit }, sink, mounts }
	// The Bun adapter reads `bodyLimit` here, so its platform cap and the server-function cap agree (dx/adapters.md).
	const fetch: FlareServer["fetch"] = (request, env, ctx) => serveOne(at, { request, env, ctx })
	const cache = { key: (target: BuildInput) => routeKey(options.router, target) }
	const server: FlareServer = { fetch, bodyLimit, buildId, cache }
	// The internal channel `vite build`'s prerender reads. It runs the same pipeline with a capture (bits/12).
	const prerender = prerenderer(options, (request, env, capture) => serveOne(at, { request, env, prerender: capture }))
	const refused = refusedChannel(at, (request) => canonicalStep(at, request))
	return Object.assign(server, { [PRERENDER]: prerender }, refused)
}

// The observability options dx/observability.md plans, which v1 does not have: one passed from JavaScript, or through
// a cast past `ServerOptions`, throws instead of being ignored (plan 21 13.14).
const PLANNED = ["logger", "onError", "requestLog", "tracer"]

function checkPlanned(options: object): void {
	const given = PLANNED.find((key) => Object.hasOwn(options, key))
	if (given !== undefined) throw new Error(`createServer: ${given} is planned (dx/observability.md) and not in v1`)
}

type Serving = { options: RuntimeOptions; sink: ErrorSink; mounts: ReturnType<typeof mountTable> }

type Call = {
	request: Request
	env: unknown
	ctx?: Parameters<FlareServer["fetch"]>[2] | undefined
	prerender?: Capture | undefined
}

// One request through the pipeline (02-system). Under Vite's dev server, the sink's channel exists: the request names
// its tab or a document gets a fresh token, and a document gets the dev tags at this boundary (B42, B95 (b)).
function serveOne(at: Serving, call: Call): Promise<Response> {
	const token = at.sink.toTab === undefined ? undefined : devToken(call.request)
	const sink = requestSink(at.sink, token)
	return bounded(call.request, sink, () => {
		const answered = answerOne(at, call, sink)
		if (token === undefined) return answered
		return answered.then((response) => devDocument(response, { head: devHead, token }))
	})
}

// The server's security callback runs once serverContext has, with the request, its env, its nonce, and that value
// (dx/server.md SecurityConfig); the set built before it, for a 400 or a canonical redirect, carries the defaults. A
// throw is a projected 500.
function serverSecured<E extends Pick<Exchange, "request" | "env" | "secured" | "sink" | "options" | "kind">>(
	exchange: E,
	serverContext: SecurityContext["serverContext"],
): E | Response {
	if (typeof exchange.options.security !== "function") return exchange
	try {
		const secured = applySecurity({
			url: exchange.request.url,
			headers: new Headers(),
			dev: exchange.sink.dev,
			security: exchange.options.security,
			context: { request: exchange.request, env: exchange.env, serverContext },
			candidate: exchange.secured.candidate,
		})
		return { ...exchange, secured }
	} catch (error) {
		return failed(exchange)(error)
	}
}

function answerOne(at: Serving, call: Call, sink: ErrorSink): Promise<Response> {
	const { request, env } = call
	const options = at.options
	const secured = applySecurity({
		url: request.url,
		headers: new Headers(),
		dev: sink.dev,
		security: options.security,
	})
	const internal = classify(new URL(request.url), options.router.basePath)
	const capture = call.prerender === undefined ? {} : { prerender: call.prerender }
	const built = {}
	const outer = { options, request, env, secured, built, sink, kind: "document" as const, stale: null, ...capture }
	if (internal.status !== 200) return Promise.resolve(answer(outer, internal.status))
	// Rebuilt only when an internal param was removed: a new Request would take over the body stream.
	const inner = internal.url.href === request.url ? request : new Request(internal.url, request)
	const exchange = { ...outer, request: inner, kind: internal.kind, stale: internal.stale }
	let step: CanonicalStep
	try {
		step = canonicalStep(at, request)
	} catch (error) {
		return Promise.resolve(failed(exchange)(error))
	}
	if (step.status !== 200) return Promise.resolve(answer(exchange, step.status, step.location))
	// serverContext runs once, before mounts (02-system step 2). A mount never calls authenticate.
	const ctx = { env, ctx: call.ctx ?? background(sink) }
	const waitUntil = (promise: Promise<unknown>): void => ctx.ctx.waitUntil(promise)
	const store = requestStore(options.store, env)
	const { serverContext, authenticate } = options
	return withServerContext(
		{ request, env, serverContext, authenticate, store, waitUntil },
		(scope) => {
			const scoped = serverSecured(exchange, serverCtx())
			if (scoped instanceof Response) return Promise.resolve(scoped)
			// 02-system step 3. A mount answers inside the middleware list, as any route does (plan 21 4.2), and its answer,
			// or its throw as a 500, still leaves through finalize.
			const call = mountFor(at.mounts, inner, ctx)
			const mounted = call && (() => call().then((response) => passed(scoped, response), failed(scoped)))
			const seeds = requestStore(options.static, env)
			return route({ ...scoped, session: scope.session, waitUntil, store, seeds }, mounted)
		},
		failed(exchange),
	)
}

// The method check runs on the match alone (02-system step 9). Route code loads only for the handler that runs
// (step 10), so an OPTIONS, a 405, or an unmatched method imports nothing.
// 02-system step 6: the middleware list wraps the server function and the router. Whatever answers, the router,
// a returned Response, or a stash, leaves through finalize with the security set (B34).
// Step 5, the locale slot, wraps that list for a page; not for a server function or a retired worker (BUGS.md 270).
// A mount's prefix is canonical and comes before the server-function path; it answers inside the list, outside the
// locale slot (02-system step 3).
function route(exchange: Exchange, mounted: (() => Promise<Response>) | undefined): Promise<Response> {
	const url = new URL(exchange.request.url)
	const fn = isServerFn(url, exchange.options.router.basePath)
	const kind: MiddlewareKind = mounted === undefined ? (fn ? "serverFn" : "page") : "mount"
	const inner = (): Promise<Response> => mounted?.() ?? (fn ? serverFn(exchange) : routed(exchange, url))
	const chain = (): Promise<Response> => withMiddleware(exchange, kind, inner)
	const localized = kind === "page" && !isRetired(exchange.options.retireServiceWorker, url.pathname)
	return localized ? withLocale(exchange, chain) : chain()
}

// Once the router ran, its answer's set, and its no-route mark on a rewrap, leave on whatever Response the middleware
// returns. A middleware that answers without the router leaves with the server's set.
function withMiddleware(exchange: Exchange, kind: MiddlewareKind, inner: () => Promise<Response>): Promise<Response> {
	const middleware = exchange.options.middleware ?? []
	if (middleware.length === 0) return inner()
	const router = { basePath: exchange.options.router.basePath, locales: exchange.options.router.locale?.locales }
	const input = { request: exchange.request, env: exchange.env, kind, fail: failed(exchange), router }
	const watch = rewrapWatch(inner)
	return runMiddleware(middleware, input, watch.inner).then((response) =>
		passed({ ...exchange, secured: exchange.built.secured ?? exchange.secured }, watch.carried(response)),
	)
}

// 02-system steps 8 and 9: match, then the method rule.
function routed(exchange: Exchange, url: URL): Promise<Response> {
	const method = exchange.request.method
	const retired = isRetired(exchange.options.retireServiceWorker, url.pathname)
	const worker = retired ? retiredWorker(exchange.secured.headers, method) : undefined
	if (worker !== undefined) return Promise.resolve(worker)
	const matched = exchange.options.router.match(url.pathname)
	if (matched.id === undefined && (method === "GET" || method === "HEAD")) {
		// A data or prefetch request for an unknown URL is that status alone, with no frame (B73).
		if (exchange.kind !== "document") return Promise.resolve(answer(exchange, 404))
		return loaded(exchange, matched, (chain) => notFound(exchange, chain)).then(markUnmatched)
	}
	return routeMethod(exchange.request, {
		match: () => methodMatch(exchange, matched),
		headers: exchange.secured.headers,
	})
}

// A .response() page has no method list, so every method reaches it (02-system step 9).
function methodMatch(exchange: Exchange, matched: Match): MethodMatch | undefined {
	if (matched.id === undefined) return undefined
	if (matched.response === true) {
		const handle = () => loaded(exchange, matched, (chain) => answered(exchange, chain))
		return { kind: "response", methods: matched.methods, handle }
	}
	return { kind: "page", render: () => loaded(exchange, matched, (chain) => pageAnswer(exchange, chain)) }
}

// Awaits the chain's modules, then runs the handler. An import that fails on the server is a bug: projected,
// then 500.
async function loaded(
	exchange: Exchange,
	matched: Match,
	run: (chain: Loaded) => Promise<Response>,
): Promise<Response> {
	let chain: Loaded
	try {
		chain = { ...matched, chain: await loadChain(matched.chain) }
		// A bad store timing is a bug of this page, found before any render (dx/cache.md).
		if (matched.id !== undefined) storeTiming(matched.id, chain.chain.at(-1)?.module.cache)
	} catch (error) {
		projectError(error, exchange.sink)
		return answer(exchange, 500)
	}
	return run(chain)
}

// The answer still passes through finalize, and the request's security set wins over its headers. A fetched answer
// drops the encoding its decoded body no longer has. A node flagged as .response() whose module has none is a codegen
// bug: projected, then 500.
async function answered(exchange: Exchange, matched: Loaded): Promise<Response> {
	const { response: respond, responseOptions } = defined(matched.chain.at(-1), "the .response() page").module
	if (respond === undefined) {
		projectError(new Error(`${matched.id} is flagged as a .response() page but has no response`), exchange.sink)
		return answer(exchange, 500)
	}
	const auth = effectiveAuth(matched.chain.map((entry) => entry.module))
	const csrf = { auth, crossOrigin: responseOptions?.crossOrigin, id: String(matched.id) }
	if (routeCsrf(exchange.request, { ...csrf, sameSite: exchange.options.sameSite ?? [] }) === 403)
		return answer(exchange, 403)
	const load = () => runLoaders({ ...loaderInput(exchange, matched), response: respond })
	// The identity-less scope's own failure, a serverContext throw, answers as any route's does (BUGS.md 287).
	const run = await (csrf.crossOrigin === true
		? withoutIdentity(exchange, csrf.id, load).catch(failed(exchange))
		: load())
	if (run instanceof Response) return run
	if (run.thrown instanceof RedirectError) {
		return answer(exchange, run.thrown.status, redirectLocation(run.thrown, exchange.options.router))
	}
	if (run.thrown !== undefined && run.response.status === 500) {
		return answer(exchange, projectError(run.thrown, exchange.sink).status)
	}
	if (run.answer === undefined) return bare(exchange, run)
	const headers = responseHeaders(decodedHeaders(run.answer), auth)
	return answerFrom(exchange, run.answer, headers)
}

// Step 7: a server function is dispatched and never reaches the router (B42).
async function serverFn(exchange: Exchange): Promise<Response> {
	const { serverFns = {}, sameSite = [], bodyLimit, router } = exchange.options
	const { basePath, trailingSlash } = router
	const input = { request: exchange.request, serverFns, sameSite, sink: exchange.sink, basePath, trailingSlash }
	return secure(exchange, await dispatch({ ...input, bodyLimit }))
}
