import type { FlareMiddleware } from "..";

interface StaticAssetsConfig {
	paths: string[];
}

export function staticAssets(config: StaticAssetsConfig): FlareMiddleware {
	const exactPaths = new Set<string>();
	const prefixPaths: string[] = [];

	for (const path of config.paths) {
		if (path.endsWith("/")) {
			prefixPaths.push(path);
		} else {
			exactPaths.add(path);
		}
	}

	return async (ctx) => {
		const pathname = ctx.url.pathname;

		const matched = exactPaths.has(pathname) || prefixPaths.some((prefix) => pathname.startsWith(prefix));

		if (!matched) return ctx.next();

		const env = ctx.env as Record<string, { fetch: (req: Request) => Promise<Response> }>;
		if (!env.ASSETS) return ctx.next();

		const response = await env.ASSETS.fetch(ctx.request);
		return ctx.bypass(response);
	};
}
