import { statusOf } from "../../shared/errors/status.ts"
import { BUILD_HEADER, CACHE_HEADER, RENDER_HEADER } from "../../shared/protocol/index.ts"
import { buildCsp, randomNonce } from "../security/csp.ts"
import { buildId } from "./build-info.ts"
import { NO_STORE, recordCookies } from "./policies.ts"

// `body` may be a stream or bytes: a .response() answer passes through unread (dx/server.md).
export type StageResult = {
	status: number
	body: BodyInit | null
	render?: "ssr" | "isr" | "ssg"
	// A stored page's verdict, `flare-cache`.
	cache?: "hit" | "miss"
	url?: string
	build?: string
	location?: string | undefined
	run?: () => void
	headers?: Headers | undefined
}

export function finalize(stage: StageResult): Response {
	const settled = settle(stage)
	const headers = new Headers({ "cache-control": NO_STORE })
	if (settled.location !== undefined) headers.set("location", settled.location)
	if (settled.url !== undefined) copySecurity(headers, settled.url)
	if (settled.headers !== undefined) copyHeaders(headers, settled.headers)
	// Flare's own headers are set last, so an answer's, an upstream Flare app's say, never stands in for them (BUGS.md
	// 337). Every pipeline response names the build that answered it (B84).
	headers.set(BUILD_HEADER, settled.build ?? buildId)
	own(headers, RENDER_HEADER, settled.render)
	own(headers, CACHE_HEADER, settled.cache)
	const response = recordCookies(
		new Response(settled.body === "" ? null : settled.body, { status: settled.status, headers }),
	)
	if (settled.body instanceof ReadableStream) markStream(response)
	ours.set(response, ownOf(settled))
	return response
}

// The answers whose body is a stream the app or Flare built, which can fail after its headers. The mark is a registered
// symbol on the Response, so a second copy of Flare in the process, a server bundle beside an adapter imported from
// the package, reads it too; a module's own WeakSet missed every answer of the other copy (BUGS.md 382). Only an
// adapter that cannot tell a stream from a fixed body by itself reads it: the Workers handler.
const STREAM = Symbol.for("flare.stream-body")

function markStream(response: Response): void {
	Object.defineProperty(response, STREAM, { value: true })
}

export function streamsBody(response: Response): response is Response & { body: ReadableStream<Uint8Array> } {
	return Reflect.get(response, STREAM) === true && response.body !== null
}

type Own = Pick<StageResult, "render" | "cache">

// The answers finalize built, with the render mode and cache verdict it wrote. One passing out through finalize again,
// a middleware's `next()` answer say, keeps them; an answer the app built drops any it brings (BUGS.md 337).
const ours = new WeakMap<Response, Own>()

function ownOf(stage: StageResult): Own {
	return {
		...(stage.render !== undefined && { render: stage.render }),
		...(stage.cache !== undefined && { cache: stage.cache }),
	}
}

export function ownStage(response: Response): Own {
	return ours.get(response) ?? {}
}

// The not-found document of a request no route matched. Only it may fall through to a platform's static files, as
// Workers' assets binding does: a page's own notFound(), a server function's 404, and a navigation's 404 are the app's
// answers and stay (plan 21 13.4). A rewrap of a marked answer, by a middleware or the dev tags, keeps the mark.
const unmatched = new WeakSet<Response>()

export function markUnmatched(response: Response): Response {
	unmatched.add(response)
	return response
}

export function isUnmatched(response: Response): boolean {
	return unmatched.has(response)
}

// The rewrap of `from` carries its mark.
export function carryMark(from: Response, to: Response): Response {
	const kept = ours.get(from)
	if (kept !== undefined) ours.set(to, kept)
	return isUnmatched(from) ? markUnmatched(to) : to
}

// The router's answer as the middleware chain gets it, so the chain's own answer keeps the mark when it rewraps that
// one: a new Response over the same body, `new Response(response.body, response)` as bits/08 shows. A body is read only
// on a marked answer, never on another, whose Blob body Bun types only while nothing reads it (BUGS.md 238, 272).
export function rewrapWatch(inner: () => Promise<Response>): {
	inner: () => Promise<Response>
	carried: (answer: Response) => Response
} {
	let routed: Response | undefined
	return {
		inner: () => inner().then((response) => (routed = response)),
		carried: (answer) => {
			const rewrap = routed !== undefined && isUnmatched(routed) && routed.body !== null && answer.body === routed.body
			return rewrap ? markUnmatched(answer) : answer
		},
	}
}

// A finished answer with its body replaced and its status and headers kept: an adapter that watches the body as it is
// sent.
export function rebodied(response: Response, body: ReadableStream<Uint8Array>): Response {
	return new Response(body, response)
}

function settle(stage: StageResult): StageResult {
	if (stage.run === undefined) return stage
	try {
		stage.run()
		return stage
	} catch (error) {
		return { ...stage, status: statusOf(error), body: "" }
	}
}

// Every Set-Cookie value is kept. Any other header replaces.
function copyHeaders(target: Headers, extra: Headers): void {
	extra.forEach((value, name) => {
		if (name !== "set-cookie") target.set(name, value)
	})
	for (const cookie of extra.getSetCookie()) target.append("set-cookie", cookie)
}

function own(headers: Headers, name: string, value: string | undefined): void {
	if (value === undefined) headers.delete(name)
	else headers.set(name, value)
}

// The whole default set, CSP and Permissions-Policy included, for an answer no request's set was built for: the
// boundary's 500, an adapter's own answer (BUGS.md 339).
function copySecurity(headers: Headers, url: string): void {
	for (const [name, value] of buildCsp({ url, nonce: randomNonce() }).headers) headers.set(name, value)
}

// A Response the app built that names no type leaves as itself, the built answer's headers set on it, and its body is
// never read: Bun types a string body `text/plain` only while nothing reads that body, and with `nosniff` an untyped
// one downloads (plan 21 12.7). Its body may stream, so it is marked as one; the Bun adapter tells a string from a stream
// before it reads one. Undefined when its headers cannot change, as a `fetch()` answer's cannot.
export function keptAs(original: Response, built: Response): Response | undefined {
	try {
		// A snapshot of the names: deleting while the live iterator runs would skip some.
		for (const name of Array.from(original.headers.keys())) original.headers.delete(name)
		built.headers.forEach((value, name) => {
			if (name !== "set-cookie") original.headers.set(name, value)
		})
		for (const cookie of built.headers.getSetCookie()) original.headers.append("set-cookie", cookie)
	} catch {
		return undefined
	}
	// Marked without reading `body`: reading a Blob body makes it a stream on Bun (BUGS.md 238).
	markStream(original)
	return recordCookies(original)
}
