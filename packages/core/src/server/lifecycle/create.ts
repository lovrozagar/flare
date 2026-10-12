import type { Element } from "solid-js";
import type { FlareRegister, RegisteredEnv, RegisteredServerContext } from "../../shared/route-builder/register.ts";
import type { Router } from "../../shared/router/create-router.ts";
import { withServerContext, type ServerContextInput } from "../context/ctx.ts";
import { renderDocument } from "../render/document.ts";
import type { Head } from "../render/head.ts";
import { applySecurity, type SecurityConfig } from "../security/apply.ts";
import { applyCanonical } from "./canonical-redirect.ts";
import { finalize } from "./finalize.ts";

export type PageLoader = (request: Request) => { sentinel: string };

export type ServerPage = {
	id: string;
	loader: PageLoader;
	head?: Head;
	render?: (data: unknown) => Element;
};

type BaseOptions = {
	router: Router;
	page: ServerPage;
	security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig);
};

type ContextFn<R extends FlareRegister> = (ctx: {
	request: Request;
	env: RegisteredEnv<R>;
}) => RegisteredServerContext<R>;

// Required once the app's FlareRegister declares serverContext (B75).
type ContextOption<R extends FlareRegister> = unknown extends R["serverContext"]
	? { serverContext?: ContextFn<R> }
	: { serverContext: ContextFn<R> };

export type ServerOptions<R extends FlareRegister = FlareRegister> = BaseOptions & ContextOption<R>;

type RuntimeOptions = BaseOptions & { serverContext?: ServerContextInput["serverContext"] };

export type FlareServer = {
	fetch: (request: Request, env?: unknown) => Promise<Response>;
};

export function createServer<R extends FlareRegister = FlareRegister>(options: ServerOptions<R>): FlareServer;
export function createServer(options: RuntimeOptions): FlareServer {
	return {
		fetch(request, env) {
			const step = applyCanonical({
				url: request.url,
				trailingSlash: options.router.trailingSlash,
				caseSensitive: options.router.caseSensitive,
			});
			if (step.status !== 200) {
				return Promise.resolve(finalize({ status: step.status, body: "", location: step.location, url: request.url }));
			}
			return withServerContext(
				{ request, env, serverContext: options.serverContext },
				() => route(options, request),
				() => finalize({ status: 500, body: "", url: request.url }),
			);
		},
	};
}

function route(options: RuntimeOptions, request: Request): Promise<Response> {
	const matched = options.router.match(new URL(request.url).pathname);
	if (!matched.id) return Promise.resolve(finalize({ status: 404, body: "Not found", url: request.url }));
	return renderPage(options, request);
}

async function renderPage(options: RuntimeOptions, request: Request): Promise<Response> {
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
