import type { FlareRegister, RegisteredEnv, RegisteredServerContext } from "../../shared/route-builder/register.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import type { RawParams } from "../../shared/route-tree/index.ts";
import type { ChainEntry, Router } from "../../shared/router/create-router.ts";
import { readSearch } from "../../shared/url/search.ts";
import { resolveCaller, type Caller } from "../auth/caller.ts";
import { withServerContext, type ServerContextInput } from "../context/ctx.ts";
import { runLoaders, type LoaderRun, type RunInput } from "../loaders/run.ts";
import { renderDocument } from "../render/document.ts";
import { mergeHead } from "../render/head.ts";
import type { StateMatch } from "../render/state.ts";
import { applySecurity, type SecurityConfig } from "../security/apply.ts";
import { applyCanonical } from "./canonical-redirect.ts";
import { finalize } from "./finalize.ts";
import { routeMethod } from "./methods.ts";

type Authenticate = (ctx: { request: Request; env: unknown } & Caller) => unknown;

type BaseOptions = {
	router: Router;
	authenticate?: Authenticate;
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

type Secured = { headers: Headers; nonce: string };

// `secured` is resolved once per request, before the status is known, so every answer carries the same
// security set (bit 03).
type Exchange = { options: RuntimeOptions; request: Request; env: unknown; secured: Secured };

type Rendered = { chain: readonly ChainEntry[]; run: LoaderRun; params: RawParams };

// The stages of order.ts, in that order: canonical, serverContext, match, method, then validate, the auth
// gate, and the loaders inside runLoaders, then render and finalize.
export function createServer<R extends FlareRegister = FlareRegister>(options: ServerOptions<R>): FlareServer;
export function createServer(options: RuntimeOptions): FlareServer {
	return {
		fetch(request, env) {
			const secured = applySecurity({ url: request.url, headers: new Headers(), security: options.security });
			const exchange = { options, request, env, secured };
			const step = applyCanonical({
				url: request.url,
				trailingSlash: options.router.trailingSlash,
				caseSensitive: options.router.caseSensitive,
			});
			if (step.status !== 200) return Promise.resolve(answer(exchange, step.status, step.location));
			return withServerContext(
				{ request, env, serverContext: options.serverContext },
				() => route(exchange),
				() => answer(exchange, 500),
			);
		},
	};
}

function answer(exchange: Exchange, status: number, location?: string): Response {
	return finalize({ status, body: "", location, url: exchange.request.url, headers: exchange.secured.headers });
}

function route(exchange: Exchange): Promise<Response> {
	const matched = exchange.options.router.match(new URL(exchange.request.url).pathname);
	const method = exchange.request.method;
	if (matched.id === undefined && (method === "GET" || method === "HEAD")) return notFound(exchange, matched.chain);
	return routeMethod(exchange.request, {
		match: () =>
			matched.id === undefined
				? undefined
				: { kind: "page", render: () => page(exchange, matched.chain, matched.params) },
		headers: exchange.secured.headers,
	});
}

// An unknown path runs the loaders of its not-found chain: the root layout, or the fuzzy owner and its
// ancestors (B73). Ranking a failure there against the 404 belongs to bit 05.
async function notFound(exchange: Exchange, chain: readonly ChainEntry[]): Promise<Response> {
	await runLoaders(loaderInput(exchange, chain));
	return answer(exchange, 404);
}

async function page(exchange: Exchange, chain: readonly ChainEntry[], params: RawParams): Promise<Response> {
	const run = await runLoaders(loaderInput(exchange, chain));
	if (run.response.status !== 200) return failed(exchange, run);
	const html = await renderDocument({
		request: exchange.request,
		router: exchange.options.router,
		nonce: exchange.secured.nonce,
		head: run.heads.reduce<HeadConfig>((merged, head) => (head === undefined ? merged : mergeHead(merged, head)), {}),
		matches: stateMatches(exchange.request, { chain, run, params }),
		render: () => run.data.map((data, index) => chain[index].module.render?.({ loaderData: data })),
	});
	const url = exchange.request.url;
	return finalize({ status: 200, body: html, render: "ssr", url, headers: exchange.secured.headers });
}

// The walked boundary that paints a failure is bit 05. Until then a failed chain answers with its status.
async function failed(exchange: Exchange, run: LoaderRun): Promise<Response> {
	const headers = new Headers(exchange.secured.headers);
	run.response.headers.forEach((value, name) => headers.set(name, value));
	const body = await run.response.text();
	return finalize({ status: run.response.status, body, headers, url: exchange.request.url });
}

// One entry per rendered match, root down, in the B83 shape. A layout sees the page's raw params, and an
// absent optional param is left out.
function stateMatches(request: Request, rendered: Rendered): StateMatch[] {
	const search = readSearch(new URL(request.url).search);
	const params = Object.fromEntries(
		Object.entries(rendered.params).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
	);
	return rendered.run.data.map((data, index) => ({
		id: rendered.chain[index].id,
		params,
		search,
		data: data ?? null,
		preloader: rendered.run.contexts[index],
		head: rendered.run.heads[index] ?? null,
		error: null,
	}));
}

function loaderInput(exchange: Exchange, chain: readonly ChainEntry[]): RunInput {
	const routes = chain.map((entry) => ({ ...entry.module, id: entry.id }));
	return {
		kind: "document",
		request: exchange.request,
		env: exchange.env,
		authenticate: () => authenticate(exchange, routes),
		routes,
	};
}

// The app function runs once, when the chain reads identity. No function means no session.
function authenticate(exchange: Exchange, routes: RunInput["routes"]): unknown {
	const app = exchange.options.authenticate;
	if (app === undefined) return null;
	return resolveCaller(routes, (caller) => app({ request: exchange.request, env: exchange.env, ...caller }));
}
