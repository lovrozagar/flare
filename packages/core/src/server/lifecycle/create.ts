import type { Element } from "solid-js";
import type { Router } from "../../shared/router/create-router.ts";
import { renderDocument } from "../render/document.ts";
import type { Head } from "../render/head.ts";
import { applySecurity, type SecurityConfig } from "../security/apply.ts";
import { finalize } from "./finalize.ts";

export type PageLoader = (request: Request) => { sentinel: string };

export type ServerPage = {
	id: string;
	loader: PageLoader;
	head?: Head;
	render?: (data: unknown) => Element;
};

export type ServerOptions = {
	router: Router;
	page: ServerPage;
	security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig);
};

export function createServer(options: ServerOptions): {
	fetch: (request: Request) => Promise<Response>;
} {
	return {
		async fetch(request) {
			const matched = options.router.match(new URL(request.url).pathname);
			if (!matched.id) return finalize({ status: 404, body: "Not found" });
			return renderPage(options, request);
		},
	};
}

async function renderPage(options: ServerOptions, request: Request): Promise<Response> {
	const secured = applySecurity({ url: request.url, headers: new Headers(), security: options.security });
	const loaded = options.page.loader(request);
	const render = options.page.render ?? (() => loaded.sentinel);
	const html = await renderDocument({
		request,
		router: options.router,
		loader: () => loaded,
		nonce: secured.nonce,
		head: options.page.head,
		render,
	});
	return finalize({ status: 200, body: html, render: "ssr", url: request.url, headers: secured.headers });
}
