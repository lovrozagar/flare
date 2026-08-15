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

			/* build proxied request */
			const targetUrl = new URL(targetPath, ctx.url.origin);
			targetUrl.search = ctx.url.search;
			const headers = new Headers(ctx.request.headers);

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
			return ctx.bypass(response);
		} catch {
			return ctx.bypass(new Response("Bad Gateway", { status: 502 }));
		}
	};
}
