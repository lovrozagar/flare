import { finalize } from "./finalize.ts";

const ALLOW = "GET, HEAD, OPTIONS";

export type MethodMatch =
	| { kind: "page"; render: () => Response | Promise<Response> }
	| { kind: "response"; handle: (request: Request) => Response | Promise<Response> };

export function applyMethod(request: Request, document: Response): Response {
	if (request.method === "GET") return document;
	if (request.method === "HEAD") {
		return finalize({ status: document.status, body: "", headers: document.headers });
	}
	if (request.method === "OPTIONS") return finalize({ status: 204, body: "", headers: allow() });
	return finalize({ status: 405, body: "", headers: allow() });
}

export async function routeMethod(
	request: Request,
	input: { match: () => MethodMatch | undefined; assets?: (request: Request) => Response },
): Promise<Response> {
	const matched = input.match();
	if (matched === undefined) return unmatched(request);
	if (matched.kind === "response") return matched.handle(request);
	if (request.method !== "GET" && request.method !== "HEAD") return applyMethod(request, new Response(null));
	return applyMethod(request, await matched.render());
}

function unmatched(request: Request): Response {
	if (request.method === "GET" || request.method === "HEAD") return finalize({ status: 404, body: "" });
	return finalize({ status: 405, body: "", headers: allow() });
}

function allow(): Headers {
	return new Headers({ allow: ALLOW });
}
