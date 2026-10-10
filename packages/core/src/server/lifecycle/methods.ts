const ALLOW = "GET, HEAD, OPTIONS";

export function applyMethod(request: Request, document: Response): Response {
	if (request.method === "GET") return document;
	if (request.method === "HEAD") {
		return new Response(null, { status: document.status, headers: document.headers });
	}
	if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: ALLOW } });
	return new Response(null, { status: 405, headers: { allow: ALLOW } });
}
