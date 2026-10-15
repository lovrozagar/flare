import { finalize } from "./finalize.ts"

const ALLOW = "GET, HEAD, OPTIONS"

export type MethodMatch =
	| { kind: "page"; render: () => Response | Promise<Response> }
	| { kind: "response"; handle: (request: Request) => Response | Promise<Response> }

// `headers` is the request's security set, so a 204 and a 405 carry it like any other status.
export function applyMethod(request: Request, document: Response, headers?: Headers): Response {
	if (request.method === "GET") return document
	if (request.method === "HEAD") {
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
	if (matched.kind === "response") return matched.handle(request)
	if (request.method !== "GET" && request.method !== "HEAD") {
		return applyMethod(request, new Response(null), input.headers)
	}
	return applyMethod(request, await matched.render(), input.headers)
}

function unmatched(request: Request, headers: Headers | undefined): Response {
	if (request.method === "GET" || request.method === "HEAD") return finalize({ status: 404, body: "", headers })
	return finalize({ status: 405, body: "", headers: allow(headers) })
}

function allow(headers: Headers | undefined): Headers {
	const merged = new Headers(headers)
	merged.set("allow", ALLOW)
	return merged
}
