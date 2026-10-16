import { FAILED_HEADER, type RequestKind } from "../../shared/protocol/index.ts"
import type { FlareStore } from "../cache/contract.ts"
import type { Capture } from "../cache/prerender.ts"
import type { Session } from "../context/ctx.ts"
import type { LoaderRun } from "../loaders/run.ts"
import type { MountContext } from "../mount/mount.ts"
import { projectError, type ErrorSink } from "../render/projector.ts"
import { applySecurity, type Secured, type SecurityConfig } from "../security/apply.ts"
import { finalize, type StageResult } from "./finalize.ts"
import { exitHeaders } from "./policies.ts"
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
// that failed, for a data answer the client paints (BUGS.md 134). A 500 that carries what was thrown, a throwing
// `authenticate` or a route whose validator is no validator, is projected and logged like any 500 (BUGS.md 157).
export async function bare(
	exchange: Answering & Pick<Exchange, "sink">,
	run: Pick<LoaderRun, "response" | "thrown">,
	failed?: string,
): Promise<Response> {
	if (run.response.status === 500 && run.thrown !== undefined && failed === undefined)
		projectError(run.thrown, exchange.sink)
	const headers = new Headers(exchange.secured.headers)
	run.response.headers.forEach((value, name) => headers.set(name, value))
	if (failed !== undefined) headers.set(FAILED_HEADER, failed)
	const body = await run.response.text()
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
	return secure(exchange, { status: response.status, body: response.body, headers: exitHeaders(response) })
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

// A stage's throw is a bug: projected, then the 500 every exit shares.
export function failed(exchange: Pick<Exchange, "request" | "secured" | "sink">): (error: unknown) => Response {
	return (error) => {
		projectError(error, exchange.sink)
		return answer(exchange, 500)
	}
}
