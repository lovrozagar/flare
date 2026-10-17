import {
	CROSS_ORIGIN_RULE,
	crossOriginRefused,
	isMethodList,
	METHODS_RULE,
} from "../../shared/route-builder/methods.ts"
import { layoutChain, type Router } from "../../shared/router/create-router.ts"
import { effectiveAuth } from "../auth/effective.ts"
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
	const named = [...listed, ...(listed.has("GET") ? ["HEAD"] : []), ...(listed.has("OPTIONS") ? [] : ["OPTIONS"])]
	const status = request.method === "OPTIONS" ? 204 : 405
	return finalize({ status, body: "", headers: allow(headers, named.join(", ")) })
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
