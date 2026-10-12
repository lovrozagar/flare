/// <reference types="vite/client" />
import { createComponent } from "solid-js";
import { Matches, type OutletMatch, type OutletState } from "../../shared/components/index.ts";
import type { FlareRegister, RegisteredEnv, RegisteredServerContext } from "../../shared/route-builder/register.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import type { RawParams } from "../../shared/route-tree/index.ts";
import type { Respond } from "../../shared/route-builder/chain.ts";
import type { ChainEntry, Match, Router } from "../../shared/router/create-router.ts";
import { readSearch } from "../../shared/url/search.ts";
import { resolveCaller, type Caller } from "../auth/caller.ts";
import { withServerContext, type ServerContextInput } from "../context/ctx.ts";
import { runLoaders, type LoaderRun, type RunInput } from "../loaders/run.ts";
import { renderDocument } from "../render/document.ts";
import { mergeHead } from "../render/head.ts";
import { devSink, projectError, type ErrorSink, type Projected } from "../render/projector.ts";
import type { StateMatch } from "../render/state.ts";
import { applySecurity, type SecurityConfig } from "../security/apply.ts";
import { applyCanonical } from "./canonical-redirect.ts";
import { finalize } from "./finalize.ts";
import { routeMethod, type MethodMatch } from "./methods.ts";

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
type Exchange = { options: RuntimeOptions; request: Request; env: unknown; secured: Secured; sink: ErrorSink };

// One rendered document: the chain, its loader run, and what fills the slot below the kept matches. `failed`
// is the projected root-most failure. `unknown` is an unknown URL and its not-found function (B77).
type Rendered = {
	chain: readonly ChainEntry[];
	run: LoaderRun;
	params: RawParams;
	failed?: Projected;
	unknown?: Pick<Match, "notFoundRender">;
};

// The stages of order.ts, in that order: canonical, serverContext, match, method, then validate, the auth
// gate, and the loaders inside runLoaders, then render and finalize.
export function createServer<R extends FlareRegister = FlareRegister>(options: ServerOptions<R>): FlareServer;
export function createServer(options: RuntimeOptions): FlareServer {
	// Literal reads: Vite replaces only `import.meta.env.DEV`, and its runner rejects passing `import.meta` whole.
	return serveWith(options, devSink({ env: { DEV: import.meta.env.DEV }, hot: import.meta.hot }));
}

// The dev flag and the overlay sender come from Vite (B93). Tests pass their own sink. No entry exports this.
export function serveWith(options: RuntimeOptions, sink: ErrorSink): FlareServer {
	return {
		fetch(request, env) {
			const secured = applySecurity({ url: request.url, headers: new Headers(), security: options.security });
			const exchange = { options, request, env, secured, sink };
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
	if (matched.id === undefined && (method === "GET" || method === "HEAD")) return notFound(exchange, matched);
	return routeMethod(exchange.request, {
		match: () => methodMatch(exchange, matched),
		headers: exchange.secured.headers,
	});
}

// A .response() page has no method list, so every method reaches it (02-system step 9).
function methodMatch(exchange: Exchange, matched: Match): MethodMatch | undefined {
	if (matched.id === undefined) return undefined;
	const respond = matched.chain[matched.chain.length - 1].module.response;
	if (respond !== undefined) return { kind: "response", handle: () => answered(exchange, matched.chain, respond) };
	return { kind: "page", render: () => page(exchange, matched.chain, matched.params) };
}

// The answer still passes through finalize, and the request's security set wins over its headers.
async function answered(exchange: Exchange, chain: readonly ChainEntry[], respond: Respond): Promise<Response> {
	const run = await runLoaders({ ...loaderInput(exchange, chain), response: respond });
	if (run.answer === undefined) return bare(exchange, run);
	const headers = new Headers(run.answer.headers);
	exchange.secured.headers.forEach((value, name) => headers.set(name, value));
	return finalize({ status: run.answer.status, body: run.answer.body, headers, url: exchange.request.url });
}

// An unknown path runs the loaders of its not-found chain: the root layout, or the fuzzy owner and its
// ancestors (B73). The selected layout renders, and its outlet is the not-found the router chose (B77).
async function notFound(exchange: Exchange, matched: Match): Promise<Response> {
	if (matched.chain.length === 0) return answer(exchange, 404);
	const run = await runLoaders(loaderInput(exchange, matched.chain));
	const rendered = { chain: matched.chain, run, params: matched.params };
	if (run.response.status === 200) return paint(exchange, { ...rendered, unknown: matched }, 404);
	return settle(exchange, rendered);
}

async function page(exchange: Exchange, chain: readonly ChainEntry[], params: RawParams): Promise<Response> {
	const run = await runLoaders(loaderInput(exchange, chain));
	if (run.response.status === 200) return paint(exchange, { chain, run, params }, 200);
	return settle(exchange, { chain, run, params });
}

// A failed match paints the walked boundary at the failure's status. Validation, a gate status, and a redirect
// have no failed match to paint and answer bare.
function settle(exchange: Exchange, rendered: Rendered): Promise<Response> {
	const failed = rendered.run.failed;
	if (failed === undefined || failed.status < 400) return bare(exchange, rendered.run);
	const projected = projectError(failed.error, exchange.sink);
	return paint(exchange, { ...rendered, failed: projected }, projected.status);
}

async function paint(exchange: Exchange, rendered: Rendered, status: number): Promise<Response> {
	const state: OutletState = {
		matches: outletMatches(exchange.request, rendered),
		failure: rendered.failed && { index: rendered.run.data.length, ...rendered.failed },
		unknown: rendered.unknown && { render: rendered.unknown.notFoundRender },
		onBoundaryError: (error) => void projectError(error, exchange.sink),
	};
	let html: string;
	try {
		html = await renderDocument({
			request: exchange.request,
			router: exchange.options.router,
			nonce: exchange.secured.nonce,
			head: rendered.run.heads.reduce<HeadConfig>(
				(merged, head) => (head === undefined ? merged : mergeHead(merged, head)),
				{},
			),
			matches: stateMatches(state.matches, rendered),
			render: () => createComponent(Matches, { state: () => state }),
		});
	} catch (thrown) {
		return renderFailed(exchange, projectError(thrown, exchange.sink));
	}
	const url = exchange.request.url;
	return finalize({ status, body: html, render: "ssr", url, headers: exchange.secured.headers });
}

// The stream rejected before the shell, so nothing was written (B93).
function renderFailed(exchange: Exchange, projected: Projected): Response {
	return answer(exchange, projected.status);
}

async function bare(exchange: Exchange, run: LoaderRun): Promise<Response> {
	const headers = new Headers(exchange.secured.headers);
	run.response.headers.forEach((value, name) => headers.set(name, value));
	const body = await run.response.text();
	return finalize({ status: run.response.status, body, headers, url: exchange.request.url });
}

// The kept matches, then the failed match, root down. A layout sees the page's raw params, and an absent
// optional param is left out.
function outletMatches(request: Request, rendered: Rendered): OutletMatch[] {
	const search = readSearch(new URL(request.url).search);
	const params = Object.fromEntries(
		Object.entries(rendered.params).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
	);
	const count = rendered.run.data.length + (rendered.failed === undefined ? 0 : 1);
	return rendered.chain.slice(0, count).map((entry, index) => ({
		id: entry.id,
		kind: entry.kind,
		module: entry.module,
		params,
		search,
		data: rendered.run.data[index],
	}));
}

// One entry per painted match in the B83 shape. The failed match carries the projected error and no data.
function stateMatches(matches: readonly OutletMatch[], rendered: Rendered): StateMatch[] {
	const run = rendered.run;
	const failure = rendered.failed?.wire ?? null;
	return matches.map((match, index) => ({
		id: match.id,
		params: match.params,
		search: match.search,
		data: match.data ?? null,
		preloader: run.contexts[index] ?? null,
		head: run.heads[index] ?? null,
		error: index < run.data.length ? null : failure,
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
