const ALLOW = "GET, HEAD, OPTIONS";

export type MethodMatch =
	| { kind: "page"; render: () => Response }
	| { kind: "response"; handle: (request: Request) => Response | Promise<Response> };

export function applyMethod(request: Request, document: Response): Response {
	if (request.method === "GET") return document;
	if (request.method === "HEAD") {
		return new Response(null, { status: document.status, headers: document.headers });
	}
	if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: ALLOW } });
	return new Response(null, { status: 405, headers: { allow: ALLOW } });
}

export async function routeMethod(
	request: Request,
	input: { match: () => MethodMatch | undefined; assets?: (request: Request) => Response },
): Promise<Response> {
	const matched = input.match();
	if (matched === undefined) return unmatched(request);
	if (matched.kind === "response") return matched.handle(request);
	return applyMethod(request, matched.render());
}

function unmatched(request: Request): Response {
	if (request.method === "GET" || request.method === "HEAD") return new Response(null, { status: 404 });
	return new Response(null, { status: 405, headers: { allow: ALLOW } });
}
