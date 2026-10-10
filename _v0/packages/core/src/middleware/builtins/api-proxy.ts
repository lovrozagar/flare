import type { FlareMiddleware, MiddlewareContext } from "..";

interface ServiceBinding {
	fetch: (request: Request) => Promise<Response>;
}

interface ApiProxyConfig<TEnv = unknown> {
	enabled?: boolean | ((ctx: { env: TEnv }) => boolean);
	headers?: (ctx: { env: TEnv; request: Request }) => Record<string, string>;
	pathPrefix: string;
	rewrite?: (path: string) => string;
	target: (ctx: { env: TEnv }) => ServiceBinding;
}

const HOP_BY_HOP = new Set([
	"connection",
	"host",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"trailers",
	"transfer-encoding",
	"upgrade",
]);

function copyForwardHeaders(source: Headers): Headers {
	const headers = new Headers();
	const extraHop = new Set<string>();
	const connection = source.get("connection");
	if (connection) {
		for (const name of connection.split(",")) {
			const trimmed = name.trim().toLowerCase();
			if (trimmed) extraHop.add(trimmed);
		}
	}
	for (const [key, value] of source) {
		const lower = key.toLowerCase();
		if (HOP_BY_HOP.has(lower) || extraHop.has(lower)) continue;
		headers.append(key, value);
	}
	return headers;
}

function withNosniff(response: Response): Response {
	if (response.headers.get("X-Content-Type-Options")) return response;
	const headers = new Headers(response.headers);
	headers.set("X-Content-Type-Options", "nosniff");
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}

function bypassText(ctx: MiddlewareContext, body: string, status: number) {
	return ctx.bypass(
		new Response(body, {
			headers: { "X-Content-Type-Options": "nosniff" },
			status,
		}),
	);
}

export function apiProxy<TEnv = unknown>(config: ApiProxyConfig<TEnv>): FlareMiddleware<TEnv> {
	return async (ctx: MiddlewareContext<TEnv>) => {
		/* check enabled */
		if (config.enabled !== undefined) {
			const enabled = typeof config.enabled === "function" ? config.enabled({ env: ctx.env }) : config.enabled;
			if (!enabled) return ctx.next();
		}

		/* check path match */
		const pathname = ctx.url.pathname;
		if (pathname !== config.pathPrefix && !pathname.startsWith(`${config.pathPrefix}/`)) {
			return ctx.next();
		}

		try {
			/* rewrite path */
			let targetPath = pathname;
			if (config.rewrite) {
				targetPath = config.rewrite(pathname);
			} else {
				targetPath = pathname.slice(config.pathPrefix.length) || "/";
			}

			/* build proxied request — rewrite must stay on this origin */
			const targetUrl = new URL(targetPath, ctx.url.origin);
			if (targetUrl.origin !== ctx.url.origin) {
				return bypassText(ctx, "Bad Request", 400);
			}
			targetUrl.search = ctx.url.search;
			const headers = copyForwardHeaders(ctx.request.headers);

			if (config.headers) {
				const extra = config.headers({ env: ctx.env, request: ctx.request });
				for (const [k, v] of Object.entries(extra)) {
					headers.set(k, v);
				}
			}

			const proxyRequest = new Request(targetUrl.toString(), {
				body: ctx.request.body,
				duplex: "half",
				headers,
				method: ctx.request.method,
			} as RequestInit);

			const service = config.target({ env: ctx.env });
			const response = await service.fetch(proxyRequest);
			return ctx.bypass(withNosniff(response));
		} catch {
			return bypassText(ctx, "Bad Gateway", 502);
		}
	};
}
