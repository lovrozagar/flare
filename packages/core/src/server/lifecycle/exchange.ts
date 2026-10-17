import { FAILED_HEADER, type RequestKind } from "../../shared/protocol/index.ts"
import type { FlareStore } from "../cache/contract.ts"
import type { Capture } from "../cache/prerender.ts"
import type { Session } from "../context/ctx.ts"
import type { LoaderRun } from "../loaders/run.ts"
import type { MountContext } from "../mount/mount.ts"
import { projectError, type ErrorSink } from "../render/projector.ts"
import { applySecurity, type Secured, type SecurityConfig } from "../security/apply.ts"
import { carryMark, finalize, keptAs, type StageResult } from "./finalize.ts"
import { NDJSON, redirectBody } from "../navigation/response.ts"
import { exitHeaders, NO_STORE } from "./policies.ts"
import { RedirectError } from "../../shared/errors/redirect.ts"
import { fnPrefix } from "../../shared/protocol/internal-params.ts"
import { redirectLocation } from "../redirect/index.ts"
import { errorEnvelope } from "../server-fn/envelope.ts"
import { isServerFn } from "./classify.ts"
import type { RuntimeOptions } from "./options.ts"

// `secured` is resolved once per request, before the status is known, so every answer carries the same
// security set (bit 03).
// `request` carries the URL the router and the loaders see: both internal params are removed (bit 06).
// `session` is the request's one authenticate, shared by the gate and every server function it calls.
// `waitUntil` keeps background work alive after the answer, a store write or a refresh. `store` is the request's
// mutable store and `seeds` its `static` one, each resolved on its first read.
export type Exchange = {
	options: RuntimeOptions
	request: Request
	env: unknown
	secured: Secured
	sink: ErrorSink
	kind: RequestKind
	stale: string | null
	session: Session
	waitUntil: (promise: Promise<unknown>) => void
	store: () => FlareStore | undefined
	seeds: () => FlareStore | undefined
	// A prerender request's capture: the stored miss's entry goes here, not to a store (bits/12).
	prerender?: Capture | undefined
	// The set the router's answer was built under, one slot per request. routeSecured fills it, so the middleware and
	// locale exits keep the route's set and its nonce on whatever Response leaves (BUGS.md B12, B13).
	built: Built
}

export type Built = { secured?: Secured | undefined }

// Every answer here carries the request's resolved security set, which already holds the defaults, so finalize
// gets no `url` and does not add them again: a `false` in that set stays removed.
type Answering = Pick<Exchange, "request" | "secured">

// A status alone, with the request's security set.
export function answer(exchange: Answering, status: number, location?: string): Response {
	return finalize({ status, body: "", location, headers: exchange.secured.headers })
}

// A loader run that answered without a render: validation, a gate status, or a named failure. `failed` names the match
// that failed, for a data answer the client paints (BUGS.md 134), and `kept` is the NDJSON of the matches above it, so
// those layouts show their data for this URL (plan 21 12.5). A 500 that carries what was thrown, a throwing
// `authenticate` or a route whose validator is no validator, is projected and logged like any 500 (BUGS.md 157).
export async function bare(
	exchange: Answering & Pick<Exchange, "sink">,
	run: Pick<LoaderRun, "response" | "thrown">,
	{ failed, kept }: { failed?: string | undefined; kept?: BodyInit | undefined } = {},
): Promise<Response> {
	if (run.response.status === 500 && run.thrown !== undefined && failed === undefined)
		projectError(run.thrown, exchange.sink)
	const headers = new Headers(exchange.secured.headers)
	run.response.headers.forEach((value, name) => headers.set(name, value))
	if (failed !== undefined) headers.set(FAILED_HEADER, failed)
	if (kept !== undefined) headers.set("content-type", NDJSON)
	const body = kept ?? (await run.response.text())
	return finalize({ status: run.response.status, body, headers })
}

// The request's headers with the body's media type. A document is HTML, a data response NDJSON.
// A route's `.security()` rebuilds the request's set before the body is written, so the nonce the render stamps and
// the header agree (B68). It merges onto the server's resolved config and keeps the request's nonce candidate, so the
// server callback runs once and its `ctx.nonce` stays the one sent. A route that sets none keeps the set.
export function routeSecured<E extends Pick<Exchange, "request" | "secured" | "sink" | "built">>(
	exchange: E,
	security: SecurityConfig,
): E {
	if (Object.keys(security).length === 0) return exchange
	const secured = applySecurity({
		url: exchange.request.url,
		headers: new Headers(),
		dev: exchange.sink.dev,
		security: exchange.secured.config,
		route: security,
		candidate: exchange.secured.candidate,
	})
	exchange.built.secured = secured
	return { ...exchange, secured }
}

// The cacheability decision writes these on a rendered page. `.headers()` cannot (dx/cache.md).
const DECIDED = new Set(["cache-control", "cdn-cache-control", "cache-tag"])

// The route's merged `.headers()` come first, so the security set and the media type win over them.
export function typed(
	exchange: Answering,
	type: string,
	route: Readonly<Record<string, string | string[]>> = {},
): Headers {
	const headers = new Headers()
	for (const [name, value] of Object.entries(route)) {
		if (DECIDED.has(name)) continue
		for (const item of [value].flat()) headers.append(name, item)
	}
	exchange.secured.headers.forEach((value, name) => headers.set(name, value))
	headers.set("content-type", type)
	return headers
}

// A whole Response from a mount or a middleware passes through finalize the same way: the security set wins, and a
// late cookie takes a shared answer's cache headers away.
export function passed(exchange: Answering, response: Response): Response {
	return answerFrom(exchange, response, exitHeaders(response))
}

// The app's own Response with the request's security set, its status kept. One that names no type leaves as itself, so
// the runtime keeps the type it knows for the body (finalize.ts `keptAs`, plan 21 12.7); any other is built anew.
export function answerFrom(exchange: Answering, response: Response, headers: Headers): Response {
	const status = response.status
	const kept = response.headers.has("content-type")
		? undefined
		: keptAs(response, secure(exchange, { status, body: null, headers }))
	return kept ?? carryMark(response, secure(exchange, { status, body: response.body, headers }))
}

// An answer the app built, a `.response()` page or a server function, still passes through finalize, and the
// request's security set wins over its headers.
export function secure(exchange: Answering, result: StageResult): Response {
	const headers = new Headers(result.headers)
	exchange.secured.headers.forEach((value, name) => headers.set(name, value))
	return finalize({ ...result, headers })
}

// Without an adapter context, background work still runs, and a rejection is projected like any bug.
export function background(sink: ErrorSink): MountContext {
	return { waitUntil: (promise) => void promise.catch((error: unknown) => projectError(error, sink)) }
}

// The one boundary at server.fetch: whatever an app callback threw that no stage caught, sync or async, is projected,
// so it is logged once, and answered as the 500 every exit shares, with the default security headers. server.fetch
// never rejects, so Node never sends a bare unlogged 500 and Workers never shows error 1101 (plan 21 9.1).
export function bounded(request: Request, sink: ErrorSink, run: () => Promise<Response>): Promise<Response> {
	const fail = (error: unknown): Response => {
		projectError(error, sink)
		return finalize({ status: 500, body: "", url: request.url })
	}
	try {
		return run().catch(fail)
	} catch (error) {
		return Promise.resolve(fail(error))
	}
}

// A stage's throw is a bug: projected, then the 500 every exit shares.
export function failed(
	exchange: Pick<Exchange, "request" | "secured" | "sink" | "kind" | "options">,
): (error: unknown) => Response {
	return (error) => {
		// A redirect() thrown outside a route, by a global middleware, answers as a loader's does (BUGS.md 281).
		if (error instanceof RedirectError) return thrownRedirect(exchange, error)
		projectError(error, exchange.sink)
		return answer(exchange, 500)
	}
}

// A document gets the 3xx. A data request gets HTTP 200 with the one `x` frame to the same target, as a loader
// redirect does, replacing the history entry unless `replace` is false. A prefetch never redirects, so it is a 404 with
// no frames. None is stored (B73).
export function redirectAnswer(
	exchange: Pick<Exchange, "secured" | "kind">,
	to: { status: number; location: string; replace?: boolean },
	cookie?: string,
): Response {
	const headers = new Headers(exchange.secured.headers)
	headers.set("cache-control", NO_STORE)
	if (exchange.kind === "prefetch") return finalize({ status: 404, body: "", headers })
	if (cookie !== undefined) headers.append("set-cookie", cookie)
	if (exchange.kind === "document") return finalize({ status: to.status, body: "", location: to.location, headers })
	headers.set("content-type", NDJSON)
	return finalize({ status: 200, body: redirectBody({ s: to.status, u: to.location, r: to.replace ?? true }), headers })
}

// A server function's caller reads the envelope's redirect and follows it; a page request takes `redirectAnswer`'s.
function thrownRedirect(
	exchange: Pick<Exchange, "request" | "secured" | "sink" | "kind" | "options">,
	error: RedirectError,
): Response {
	const router = exchange.options.router
	const url = new URL(exchange.request.url)
	if (!isServerFn(url, router.basePath)) {
		const location = redirectLocation(error, router)
		return redirectAnswer(exchange, { status: error.status, location, replace: error.replace })
	}
	const id = url.pathname.slice(fnPrefix(router.basePath).length)
	const { envelope } = errorEnvelope(id, error, {
		sink: exchange.sink,
		basePath: router.basePath,
		trailingSlash: router.trailingSlash,
	})
	const headers = new Headers(exchange.secured.headers)
	headers.set("content-type", "application/json")
	headers.set("cache-control", NO_STORE)
	return finalize({ status: 200, body: JSON.stringify(envelope), headers })
}
