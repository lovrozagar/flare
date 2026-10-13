import type { Plugin } from "vite";
import { createNodeListener } from "../../adapters/node/index.ts";

type Handle = (request: Request) => Response | Promise<Response>;

// A dev-only endpoint: a path on the dev server and what answers it.
export type DevEndpoint = { path: string; handle: Handle };

// A dev endpoint answers only a same-origin request (B75). A missing `Sec-Fetch-Site`, as from curl, is allowed.
// `same-site`, `none`, and `cross-site` are 403. A CORS star never leaves the dev server, so another site's page
// cannot read the answer.
export function guardDev(handle: Handle): (request: Request) => Promise<Response> {
	return async (request) => {
		const site = request.headers.get("sec-fetch-site");
		if (site !== null && site !== "same-origin") return new Response(null, { status: 403 });
		const response = await handle(request);
		if (response.headers.get("access-control-allow-origin") !== "*") return response;
		const headers = new Headers(response.headers);
		headers.delete("access-control-allow-origin");
		return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
	};
}

// The dev server's endpoints, each behind the guard. The plugin applies to `vite dev` alone, so a build registers
// none (bits/12 `absent in prod`).
export function devEndpoints(endpoints: readonly DevEndpoint[]): Plugin {
	return {
		name: "flare:dev-endpoints",
		apply: "serve",
		configureServer(server) {
			for (const endpoint of endpoints) {
				server.middlewares.use(endpoint.path, createNodeListener({ fetch: guardDev(endpoint.handle) }));
			}
		},
	};
}
