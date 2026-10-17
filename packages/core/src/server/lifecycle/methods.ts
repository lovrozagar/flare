import {
	CROSS_ORIGIN_RULE,
	crossOriginRefused,
	isMethodList,
	METHODS_RULE,
} from "../../shared/route-builder/methods.ts"
import { layoutChain, type Router } from "../../shared/router/create-router.ts"
import { effectiveAuth } from "../auth/effective.ts"
import { mountSpelling, type Mount } from "../mount/mount.ts"
import { fnPrefix } from "../../shared/protocol/internal-params.ts"
import { projectError, type ErrorSink } from "../render/projector.ts"
import { classify, isServerFn } from "./classify.ts"
import { RedirectError } from "../../shared/errors/redirect.ts"
import { redirectLocation } from "../redirect/index.ts"
import type { RuntimeOptions } from "./options.ts"
import { finalize } from "./finalize.ts"

const ALLOW = "GET, HEAD, OPTIONS"

export type MethodMatch =
	| { kind: "page"; render: () => Response | Promise<Response> }
	| {
			kind: "response"
			methods?: readonly string[] | undefined
			handle: (request: Request) => Response | Promise<Response>
	  }

// `headers` is the request's security set, so a 204 and a 405 carry it like any other status.
export function applyMethod(request: Request, document: Response, headers?: Headers): Response {
	if (request.method === "GET") return document
	// A HEAD sends the document's status and headers. Its body is cancelled, which stops the render behind it, so no
	// render outlives the answer (plan 21 3.12).
	if (request.method === "HEAD") {
		void document.body?.cancel()
		return finalize({ status: document.status, body: "", headers: document.headers })
	}
	if (request.method === "OPTIONS") return finalize({ status: 204, body: "", headers: allow(headers) })
	return finalize({ status: 405, body: "", headers: allow(headers) })
}

export async function routeMethod(
	request: Request,
	input: { match: () => MethodMatch | undefined; assets?: (request: Request) => Response; headers?: Headers },
): Promise<Response> {
	const matched = input.match()
	if (matched === undefined) return unmatched(request, input.headers)
	if (matched.kind === "response") return responded(request, matched, input.headers)
	if (request.method !== "GET" && request.method !== "HEAD") {
		return applyMethod(request, new Response(null), input.headers)
	}
	return applyMethod(request, await matched.render(), input.headers)
}

// A .response() page answers the methods it declares, GET when it declares none (plan 21 13.5). HEAD runs it as GET
// does and sends no body; OPTIONS is 204 unless the page declares it; any other method is 405 and never calls it.
async function responded(
	request: Request,
	matched: Extract<MethodMatch, { kind: "response" }>,
	headers: Headers | undefined,
): Promise<Response> {
	const listed = new Set(matched.methods ?? ["GET"])
	if (listed.has(request.method)) return matched.handle(request)
	if (request.method === "HEAD" && listed.has("GET")) return applyMethod(request, await matched.handle(request))
	const status = request.method === "OPTIONS" ? 204 : 405
	return finalize({ status, body: "", headers: allow(headers, namedMethods(listed)) })
}

// A `.response()` page's Allow: its methods, HEAD with GET, and OPTIONS once.
function namedMethods(listed: ReadonlySet<string>): string {
	return [...listed, ...(listed.has("GET") ? ["HEAD"] : []), ...(listed.has("OPTIONS") ? [] : ["OPTIONS"])].join(", ")
}

// The channel an adapter asks when its runtime cannot make a request of the method, as Node cannot of CONNECT, TRACE,
// and TRACK. The answer is what Bun's pipeline gives, in its order: an unknown internal param's 400; the canonical
// step's redirect, a step that throws answering as `failed` does (a redirect's Location, else the projected 500); on a mounted path, which the method cannot reach here,
// 501; a server function's 404 for an unknown id, else 405 naming its method; a route's 405 with its own Allow (RFC
// 9110, BUGS.md 280, 284, 289). Middleware does not run: it needs the request this runtime cannot make.
export const REFUSED: unique symbol = Symbol.for("flare.refused")

export type RefusedAnswer = { status: number; location?: string; allow?: string }

type Refused = { method: string; url: string }

export function refusedChannel(
	serving: { options: Pick<RuntimeOptions, "router" | "serverFns">; mounts: readonly Mount[]; sink: ErrorSink },
	step: (request: Refused) => { status: number; location?: string },
): { [REFUSED]: (request: Refused) => Promise<RefusedAnswer> } {
	return { [REFUSED]: (request) => refusedAnswer(serving, { request, step }) }
}

async function refusedAnswer(
	serving: { options: Pick<RuntimeOptions, "router" | "serverFns">; mounts: readonly Mount[]; sink: ErrorSink },
	at: { request: Refused; step: (request: Refused) => { status: number; location?: string } },
): Promise<RefusedAnswer> {
	const { router, serverFns = {} } = serving.options
	const url = new URL(at.request.url)
	const internal = classify(url, router.basePath)
	if (internal.status !== 200) return { status: internal.status }
	try {
		const step = at.step(at.request)
		if (step.status !== 200) return step
		if (mountSpelling(serving.mounts, url.pathname) !== undefined) return { status: 501 }
		if (isServerFn(url, router.basePath)) {
			const id = url.pathname.slice(fnPrefix(router.basePath).length)
			const fn = Object.hasOwn(serverFns, id) ? await serverFns[id]?.() : undefined
			return fn === undefined ? { status: 404 } : { status: 405, allow: `${fn.record.method.toUpperCase()}, OPTIONS` }
		}
	} catch (error) {
		// As the pipeline's `failed`: a thrown redirect answers its Location, any other throw is the projected 500.
		if (error instanceof RedirectError) return { status: error.status, location: redirectLocation(error, router) }
		projectError(error, serving.sink)
		return { status: 500 }
	}
	const matched = router.match(url.pathname)
	if (matched.id === undefined || matched.response !== true) return { status: 405, allow: ALLOW }
	return { status: 405, allow: namedMethods(new Set(matched.methods ?? ["GET"])) }
}

// A hand-built router's `.response()` methods, and its `crossOrigin` against the chain's auth, layouts included, are
// checked at startup, as codegen checks a route file's (plan 21 13.5, BUGS.md 273). A lazy module is checked when it
// answers (csrf.ts `routeCsrf`).
export function checkResponseMethods(router: Pick<Router, "routeTree" | "layouts">): void {
	for (const node of router.routeTree) {
		const record = typeof node.module === "object" ? node.module : undefined
		const methods = node.methods ?? record?.responseOptions?.methods
		if (methods !== undefined && !isMethodList(methods)) {
			throw new Error(`createServer: ${node.id} .response() ${METHODS_RULE}`)
		}
		if (record?.responseOptions?.crossOrigin !== true) continue
		const layouts = layoutChain(router.layouts, node.id).map((entry) => entry.module)
		const auth = effectiveAuth([...layouts, record].filter((module) => typeof module === "object"))
		if (crossOriginRefused(methods, auth.requires || auth.reads)) {
			throw new Error(`createServer: ${node.id} .response() ${CROSS_ORIGIN_RULE}`)
		}
	}
}

function unmatched(request: Request, headers: Headers | undefined): Response {
	if (request.method === "GET" || request.method === "HEAD") return finalize({ status: 404, body: "", headers })
	return finalize({ status: 405, body: "", headers: allow(headers) })
}

function allow(headers: Headers | undefined, methods = ALLOW): Headers {
	const merged = new Headers(headers)
	merged.set("allow", methods)
	return merged
}
