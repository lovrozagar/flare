import { forwardedHttps, trustedHops } from "../../shared/url/index.ts";

const MIB = 1024 * 1024;

export type BunServer = {
	fetch: (request: Request) => Response | Promise<Response>;
	bodyLimit?: number;
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
		maxRequestBodySize: server.bodyLimit === undefined ? MIB : server.bodyLimit,
	};
}

// Bun's URL keeps the scheme the socket spoke. Rebuilt only for a trusted https hop, so another request keeps its body.
function forwarded(request: Request, hops: number): Request {
	const url = new URL(request.url);
	if (url.protocol !== "http:" || !forwardedHttps(hops, request.headers.get("x-forwarded-proto"))) return request;
	url.protocol = "https:";
	return new Request(url, request);
}
