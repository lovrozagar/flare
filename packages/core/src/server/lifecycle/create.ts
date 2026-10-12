/// <reference types="vite/client" />
import { createComponent } from "solid-js";
import { escape } from "@solidjs/web";
import { Matches, type OutletMatch, type OutletState } from "../../shared/components/index.ts";
import type { FlareRegister } from "../../shared/route-builder/register.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import type { FrameError, RequestKind } from "../../shared/protocol/index.ts";
import { matchId, type RawParams } from "../../shared/route-tree/index.ts";
import type { Respond } from "../../shared/route-builder/chain.ts";
import type { ChainEntry, Match } from "../../shared/router/create-router.ts";
import { RedirectError } from "../../shared/errors/redirect.ts";
import { readSearch } from "../../shared/url/search.ts";
import { resolveCaller } from "../auth/caller.ts";
import { withServerContext } from "../context/ctx.ts";
import { runLoaders, type LoaderRun, type RunInput } from "../loaders/run.ts";
import { dataBody, dataFrames, NDJSON, redirectBody, skippedRoutes } from "../navigation/index.ts";
import { renderDocument } from "../render/document.ts";
import { mergeHead } from "../render/head.ts";
import { devSink, projectError, type ErrorSink, type Projected } from "../render/projector.ts";
import type { StateMatch } from "../render/state.ts";
import { redirectLocation } from "../redirect/index.ts";
import { applySecurity } from "../security/apply.ts";
import { applyCanonical } from "./canonical-redirect.ts";
import { classify } from "./classify.ts";
import { finalize, type StageResult } from "./finalize.ts";
import { routeMethod, type MethodMatch } from "./methods.ts";
import type { FlareServer, RuntimeOptions, ServerOptions } from "./options.ts";

export type { FlareServer, ServerOptions } from "./options.ts";

type Secured = { headers: Headers; nonce: string };

// `secured` is resolved once per request, before the status is known, so every answer carries the same
// security set (bit 03).
// `request` carries the URL the router and the loaders see: both internal params are removed (bit 06).
type Exchange = {
	options: RuntimeOptions;
	request: Request;
	env: unknown;
	secured: Secured;
	sink: ErrorSink;
	kind: RequestKind;
	stale: string | null;
};

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
			const internal = classify(new URL(request.url));
			const outer = { options, request, env, secured, sink, kind: "document" as const, stale: null };
			if (internal.status !== 200) return Promise.resolve(answer(outer, internal.status));
			// Rebuilt only when an internal param was removed: a new Request would take over the body stream.
			const inner = internal.url.href === request.url ? request : new Request(internal.url, request);
			const exchange = { ...outer, request: inner, kind: internal.kind, stale: internal.stale };
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
	if (matched.id === undefined && (method === "GET" || method === "HEAD")) {
		// A data or prefetch request for an unknown URL is that status alone, with no frame (B73).
		return exchange.kind === "document" ? notFound(exchange, matched) : Promise.resolve(answer(exchange, 404));
	}
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
	if (exchange.kind !== "document") return { kind: "page", render: () => data(exchange, matched) };
	return { kind: "page", render: () => page(exchange, matched.chain, matched.params) };
}

// A data or prefetch request (bit 06). The stale pages run no loader. A thrown redirect is HTTP 200 with one
// `x` line. Validation, a gate status, and a named failure answer bare. Anything else is the NDJSON stream.
async function data(exchange: Exchange, matched: Match): Promise<Response> {
	const raw = new URL(exchange.request.url).search.slice(1);
	const id = matchId(definedParams(matched.params), raw);
	const matches = matched.chain.map((entry) => ({ route: entry.id, id, layout: entry.kind === "layout" }));
	const skip = skippedRoutes(matches, exchange.stale);
	const run = await runLoaders({ ...loaderInput(exchange, matched.chain), skip });
	const thrown = run.thrown ?? run.failed?.error;
	if (thrown instanceof RedirectError) {
		const u = redirectLocation(thrown, exchange.options.router.basePath);
		return finalize({ ...stage(exchange, redirectBody({ s: thrown.status, u, r: thrown.replace }), 200) });
	}
	if (run.response.status !== 200) return bare(exchange, run);
	for (const bug of run.bugs) projectError(bug, exchange.sink);
	const project = (error: unknown): FrameError => {
		const wire = projectError(error, exchange.sink).wire;
		return { message: wire.message, stack: wire.stack, digest: wire.digest };
	};
	const body = dataBody({ ...dataFrames(run, skip), deferred: run.deferred, project });
	return finalize(stage(exchange, body, 200));
}

function stage(exchange: Exchange, body: BodyInit, status: number): StageResult {
	const headers = new Headers(exchange.secured.headers);
	headers.set("content-type", NDJSON);
	return { status, body, headers, url: exchange.request.url };
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
	// "buffer" holds the document until every defer this render started has settled. Solid then writes the
	// settled values in the shell (B92).
	if (exchange.options.documentResponseDefer === "buffer")
		await Promise.allSettled(run.deferred.map((entry) => entry.promise));
	if (run.response.status === 200) return paint(exchange, { chain, run, params }, 200);
	return settle(exchange, { chain, run, params });
}

// A thrown redirect() answers its status and Location, with no render and no boundary (B73). A failed match
// paints the walked boundary at the failure's status. Validation and a gate status answer bare.
function settle(exchange: Exchange, rendered: Rendered): Promise<Response> {
	const thrown = rendered.run.thrown ?? rendered.run.failed?.error;
	if (thrown instanceof RedirectError) {
		const location = redirectLocation(thrown, exchange.options.router.basePath);
		return Promise.resolve(answer(exchange, thrown.status, location));
	}
	const failed = rendered.run.failed;
	if (failed === undefined) return bare(exchange, rendered.run);
	const projected = projectError(failed.error, exchange.sink);
	return paint(exchange, { ...rendered, failed: projected }, projected.status);
}

async function paint(exchange: Exchange, rendered: Rendered, status: number): Promise<Response> {
	for (const bug of rendered.run.bugs) projectError(bug, exchange.sink);
	const state: OutletState = {
		matches: outletMatches(exchange.request, rendered),
		failure: rendered.failed && { index: rendered.run.data.length, ...rendered.failed },
		unknown: rendered.unknown && { render: rendered.unknown.notFoundRender },
		onBoundaryError: (error) => void projectError(error, exchange.sink),
	};
	let body: ReadableStream<Uint8Array>;
	try {
		body = await renderDocument({
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
	return finalize({ status, body, render: "ssr", url, headers: exchange.secured.headers });
}

// The stream rejected before the shell, so nothing was written (B93). Only a dev bug shows its message and
// stack. Production and a named status answer an empty body.
function renderFailed(exchange: Exchange, projected: Projected): Response {
	const stack = projected.wire.stack;
	const body = stack === undefined ? "" : `<pre>${escape(`${projected.wire.message}\n${stack}`)}</pre>`;
	return finalize({ status: projected.status, body, url: exchange.request.url, headers: exchange.secured.headers });
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
	const params = definedParams(rendered.params);
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

// An absent optional param is left out.
function definedParams(params: RawParams): Record<string, string | string[]> {
	return Object.fromEntries(
		Object.entries(params).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
	);
}

function loaderInput(exchange: Exchange, chain: readonly ChainEntry[]): RunInput {
	const routes = chain.map((entry) => ({ ...entry.module, id: entry.id }));
	return {
		kind: exchange.kind,
		dev: exchange.sink.dev,
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
