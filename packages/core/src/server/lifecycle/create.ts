import type { Router } from "../../shared/router/create-router.ts";
import { finalize } from "./finalize.ts";
import { stateScript } from "../render/state.ts";

export type PageLoader = (request: Request) => { sentinel: string };

export type ServerPage = { id: string; loader: PageLoader };

export function createServer(options: { router: Router; page: ServerPage }): {
	fetch: (request: Request) => Promise<Response>;
} {
	return {
		async fetch(request) {
			const matched = options.router.match(new URL(request.url).pathname);
			if (!matched.id) return finalize({ status: 404, body: "Not found" });
			const data = options.page.loader(request);
			const html = `<!doctype html><html><body><div id="app">${data.sentinel}</div>${stateScript({
				matches: [{ id: matched.id, params: {}, search: {}, data, preloader: null, head: null, error: null }],
			})}</body></html>`;
			return finalize({ status: 200, body: html, render: "ssr" });
		},
	};
}
