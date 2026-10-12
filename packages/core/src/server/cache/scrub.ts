import type { Exchange } from "../lifecycle/exchange.ts";

// The request every shared render makes: `site` plus the canonical pathname, with no search and no request
// headers, so no cookie, no authorization, and no Host reach a body that every visitor is served (dx/cache.md).
export function sharedRequest(site: string, request: Request): Request {
	return new Request(new URL(new URL(request.url).pathname, site));
}

// The exchange of a shared render. Its session is null, so an optional-auth chain stores its anonymous render, and
// it renders as a document so one run writes both the HTML and the NDJSON (B27).
export function sharedExchange(exchange: Exchange, site: string): Exchange {
	return {
		...exchange,
		request: sharedRequest(site, exchange.request),
		session: () => Promise.resolve(null),
		kind: "document",
		stale: null,
	};
}

// `store` needs `site`, checked at the call. `site` is an absolute origin with no path, search, or hash, and it is
// `https` outside dev (dx/server.md).
export function checkSite(site: string | undefined, at: { store: boolean; dev: boolean }): void {
	if (site === undefined) {
		if (at.store) throw new Error("createServer: store needs site, the origin every shared render requests");
		return;
	}
	const url = URL.canParse(site) ? new URL(site) : undefined;
	const secure = url?.protocol === "https:" || (at.dev && url?.protocol === "http:");
	if (url === undefined || !secure || `${url.origin}` !== site.replace(/\/$/, "")) {
		throw new Error(`createServer: site must be an absolute https origin with no path, not ${site}`);
	}
}
