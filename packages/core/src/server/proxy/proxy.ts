import { activeMount } from "../mount/mount.ts";

// Each forward is opt-in. A cookie or a credential never reaches another origin unless the app says so (B87).
export type ProxyOptions = { forwardCookies?: boolean; forwardAuthorization?: boolean; relaySetCookie?: boolean };

const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade"];

// Inside a mount's fetch: the stripped path plus the search goes to `upstream`, an absolute https origin, and the
// answer comes back with a redirect kept as a redirect (dx/server.md `proxy`). Outside a mount it throws.
export function proxy(request: Request, upstream: string, options: ProxyOptions = {}): Promise<Response> {
	// The upstream is configuration, so it is checked before the request context.
	const base = URL.canParse(upstream) ? new URL(upstream) : undefined;
	if (upstream.startsWith("//") || base?.protocol !== "https:")
		throw new Error(`proxy upstream must be https: ${upstream}`);
	const prefix = activeMount();
	if (prefix === undefined) throw new Error("proxy needs an active mount");
	return send(request, base, options).then((response) => answer(response, prefix, options));
}

async function send(request: Request, base: URL, options: ProxyOptions): Promise<Response> {
	const url = new URL(request.url);
	const headers = withoutHops(request.headers, false);
	if (options.forwardCookies !== true) headers.delete("cookie");
	if (options.forwardAuthorization !== true) headers.delete("authorization");
	const body = request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer();
	return fetch(new URL(`${url.pathname}${url.search}`, base.origin), {
		method: request.method,
		headers,
		body,
		redirect: "manual",
	});
}

// A Location that is a single-slash path is put back under the mount. Any other Location, absolute or
// scheme-relative, is 502 and is not forwarded. fetch decoded the body, so its encoding and length are dropped.
function answer(response: Response, prefix: string, options: ProxyOptions): Response {
	const relay = options.relaySetCookie === true;
	const headers = withoutHops(response.headers, relay);
	headers.delete("content-encoding");
	headers.delete("content-length");
	if (!relay) headers.delete("set-cookie");
	const location = response.headers.get("location");
	if (location !== null) {
		if (!location.startsWith("/") || location.startsWith("//")) {
			void response.body?.cancel();
			return new Response(null, { status: 502 });
		}
		headers.set("location", `${prefix}${location}`);
	}
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// The fixed hop-by-hop set and every header the Connection header names. `set-cookie` stays when it is relayed.
function withoutHops(source: Headers, keepSetCookie: boolean): Headers {
	const named = (source.get("connection") ?? "").split(",").map((token) => token.trim().toLowerCase());
	const drop = new Set(
		[...HOP_BY_HOP, ...named].filter((name) => name !== "" && !(keepSetCookie && name === "set-cookie")),
	);
	const headers = new Headers();
	source.forEach((value, name) => {
		if (!drop.has(name) && name !== "set-cookie") headers.append(name, value);
	});
	for (const cookie of source.getSetCookie()) if (!drop.has("set-cookie")) headers.append("set-cookie", cookie);
	return headers;
}
