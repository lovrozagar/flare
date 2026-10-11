import { canonicalPath } from "../../shared/url/canonical.ts";
import { createLogger } from "../../server/lifecycle/logger.ts";

export type WorkerCtx = {
	waitUntil: (promise: Promise<unknown>) => void;
	clientIp?: string;
};

export type AssetBinding = {
	fetch: (request: Request) => Response | Promise<Response>;
};

export type WorkerEnv = Record<string, AssetBinding | undefined>;

type Server = {
	fetch: (request: Request, env: WorkerEnv, ctx: WorkerCtx) => Response | Promise<Response>;
};

export function createWorkersHandler(
	server: Server,
	options?: { assets?: string },
): { fetch: (request: Request, env: WorkerEnv, ctx: WorkerCtx) => Promise<Response> } {
	const assets = options?.assets;
	return {
		async fetch(request, env, ctx) {
			const next = canonicalRequest(request);
			if (next === undefined) return new Response(null, { status: 400 });
			const response = await server.fetch(next, env, {
				waitUntil(promise) {
					ctx.waitUntil(promise);
				},
				clientIp: connectingIp(request),
			});
			if (response.status !== 404 || assets === undefined) return response;
			if (request.method !== "GET" && request.method !== "HEAD") {
				return new Response(null, { status: 405, headers: { allow: "GET, HEAD, OPTIONS" } });
			}
			const binding = env[assets];
			if (binding === undefined) {
				createLogger({ dev: false }).error("assets", "missing binding");
				return new Response(null, { status: 500 });
			}
			return binding.fetch(next);
		},
	};
}

function canonicalRequest(request: Request): Request | undefined {
	const url = new URL(request.url);
	const canonical = canonicalPath(url.pathname);
	if (!("path" in canonical)) return undefined;
	url.pathname = canonical.path;
	return new Request(url, request);
}

function connectingIp(request: Request): string | undefined {
	const header = request.headers.get("cf-connecting-ip");
	if (header === null) return undefined;
	return header;
}
