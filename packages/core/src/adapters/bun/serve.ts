import { forwardedHttps, trustedHops } from "../../shared/url/index.ts";

// Bun's own default `maxRequestBodySize`, kept as the platform ceiling. Flare's capped reader answers a body over
// `bodyLimit` with 413 (`server-fn/input.ts`), and that limit is at most 32 MiB, so the 413 always comes first. A
// body over this ceiling makes Bun cut the connection, which a client reads as EPIPE or ECONNRESET, not a status
// (BUGS.md 114).
const BUN_CEILING = 128 * 1024 * 1024;

export type BunServer = {
	fetch: (request: Request) => Response | Promise<Response>;
};

// `trustProxy` as on the Node listener: with a trusted hop, `X-Forwarded-Proto: https` makes the request https, so its
// origin, redirects, and Strict-Transport-Security follow (dx/adapters.md).
export type BunFetchOptions = { trustProxy?: number };

export function createBunFetch(
	server: BunServer,
	options: BunFetchOptions = {},
): {
	fetch: (request: Request) => Promise<Response>;
	maxRequestBodySize: number;
} {
	const hops = trustedHops("createBunFetch", options);
	return {
		fetch(request) {
			return Promise.resolve(server.fetch(forwarded(request, hops)));
		},
		maxRequestBodySize: BUN_CEILING,
	};
}

// Bun's URL keeps the scheme the socket spoke. Rebuilt only for a trusted https hop, so another request keeps its body.
function forwarded(request: Request, hops: number): Request {
	const url = new URL(request.url);
	if (url.protocol !== "http:" || !forwardedHttps(hops, request.headers.get("x-forwarded-proto"))) return request;
	url.protocol = "https:";
	return new Request(url, request);
}
