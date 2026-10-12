/// <reference types="vite/client" />
import { defined } from "../../shared/errors/index.ts";
import { createComponent } from "solid-js";
import { escape } from "@solidjs/web";
import { Matches, type OutletState } from "../../shared/components/index.ts";
import type { FlareRegister } from "../../shared/route-builder/register.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import type { FrameError } from "../../shared/protocol/index.ts";
import { matchId } from "../../shared/route-tree/index.ts";
import { loadChain, notFoundRenderOf, type LoadedEntry, type Match } from "../../shared/router/create-router.ts";
import { RedirectError } from "../../shared/errors/redirect.ts";
import { resolveCaller } from "../auth/caller.ts";
import { withServerContext } from "../context/ctx.ts";
import { runLoaders, type RunInput } from "../loaders/run.ts";
import { dataBody, dataFrames, NDJSON, redirectBody, skippedRoutes } from "../navigation/index.ts";
import { renderDocument } from "../render/document.ts";
import { mergeHead } from "../../shared/head/index.ts";
import { devSink, projectError, type ErrorSink, type Projected } from "../render/projector.ts";
import { definedParams, outletMatches, stateMatches, type Rendered } from "../render/matches.ts";
import { redirectLocation } from "../redirect/index.ts";
import { readSearch } from "../../shared/url/search.ts";
import { applySecurity } from "../security/apply.ts";
import { applyCanonical } from "./canonical-redirect.ts";
import { dispatch } from "../server-fn/dispatch.ts";
import { classify, isServerFn } from "./classify.ts";
import { answer, bare, passed, secure, typed, type Exchange } from "./exchange.ts";
import { dispatchMount, mountTable, type MountContext } from "../mount/mount.ts";
import { finalize, type StageResult } from "./finalize.ts";
import { routeMethod, type MethodMatch } from "./methods.ts";
import type { FlareServer, RuntimeOptions, ServerOptions } from "./options.ts";

const HTML = "text/html; charset=utf-8";

declare global {
	interface ImportMetaEnv {
		// The client entry URL flare() defines in the server environments (dx/plugin.md).
		readonly FLARE_CLIENT_ENTRY?: string;
	}
}

export type { FlareServer, ServerOptions } from "./options.ts";

// The stages of order.ts, in that order: canonical, serverContext, match, method, then validate, the auth
// gate, and the loaders inside runLoaders, then render and finalize.
export function createServer<R extends FlareRegister = FlareRegister>(options: ServerOptions<R>): FlareServer;
export function createServer(options: RuntimeOptions): FlareServer {
	// Literal reads: Vite replaces only `import.meta.env.DEV`, and its runner rejects passing `import.meta` whole.
	return serveWith(options, devSink({ env: { DEV: import.meta.env.DEV }, hot: import.meta.hot }));
}

// The dev flag and the overlay sender come from Vite (B93). Tests pass their own sink. No entry exports this.
export function serveWith(options: RuntimeOptions, sink: ErrorSink): FlareServer {
	const { trailingSlash, caseSensitive } = options.router;
	const mounts = mountTable(options.mounts ?? [], { trailingSlash, caseSensitive });
	return {
		fetch(request, env, ctx) {
			const secured = applySecurity({ url: request.url, headers: new Headers(), security: options.security });
			const internal = classify(new URL(request.url), options.router.basePath);
			const outer = { options, request, env, secured, sink, kind: "document" as const, stale: null };
			if (internal.status !== 200) return Promise.resolve(answer(outer, internal.status));
			// Rebuilt only when an internal param was removed: a new Request would take over the body stream.
			const inner = internal.url.href === request.url ? request : new Request(internal.url, request);
			const exchange = { ...outer, request: inner, kind: internal.kind, stale: internal.stale };
			const step = applyCanonical({
				method: request.method,
				url: request.url,
				basePath: options.router.basePath,
				trailingSlash: options.router.trailingSlash,
				caseSensitive: options.router.caseSensitive,
			});
			if (step.status !== 200) return Promise.resolve(answer(exchange, step.status, step.location));
			// serverContext runs once, before mounts (02-system step 2). A mount never calls authenticate.
			const call = { env, ctx: ctx ?? background(sink) };
			return withServerContext(
				{ request, env, serverContext: options.serverContext, authenticate: options.authenticate },
				(scope) => {
					// 02-system step 3. A mount's answer, or its throw as a 500, still leaves through finalize.
					const mounted = dispatchMount(mounts, inner, call);
					if (mounted !== undefined) return mounted.then((response) => passed(exchange, response), failed(exchange));
					return route({ ...exchange, session: scope.session });
				},
				() => answer(exchange, 500),
			);
		},
	};
}

// Without an adapter context, background work still runs, and a rejection is projected like any bug.
function background(sink: ErrorSink): MountContext {
	return { waitUntil: (promise) => void promise.catch((error: unknown) => projectError(error, sink)) };
}

// A stage's throw is a bug: projected, then the 500 every exit shares.
function failed(exchange: Pick<Exchange, "request" | "secured" | "sink">): (error: unknown) => Response {
	return (error) => {
		projectError(error, exchange.sink);
		return answer(exchange, 500);
	};
}

// A match whose modules are loaded (02-system step 10).
type Loaded = Omit<Match, "chain"> & { chain: readonly LoadedEntry[] };

// The method check runs on the match alone (02-system step 9). Route code loads only for the handler that runs
// (step 10), so an OPTIONS, a 405, or an unmatched method imports nothing.
function route(exchange: Exchange): Promise<Response> {
	const url = new URL(exchange.request.url);
	if (isServerFn(url, exchange.options.router.basePath)) return serverFn(exchange);
	const matched = exchange.options.router.match(url.pathname);
	const method = exchange.request.method;
	if (matched.id === undefined && (method === "GET" || method === "HEAD")) {
		// A data or prefetch request for an unknown URL is that status alone, with no frame (B73).
		if (exchange.kind !== "document") return Promise.resolve(answer(exchange, 404));
		return loaded(exchange, matched, (chain) => notFound(exchange, chain));
	}
	return routeMethod(exchange.request, {
		match: () => methodMatch(exchange, matched),
		headers: exchange.secured.headers,
	});
}

// A .response() page has no method list, so every method reaches it (02-system step 9).
function methodMatch(exchange: Exchange, matched: Match): MethodMatch | undefined {
	if (matched.id === undefined) return undefined;
	if (matched.response === true) {
		return { kind: "response", handle: () => loaded(exchange, matched, (chain) => answered(exchange, chain)) };
	}
	if (exchange.kind !== "document")
		return { kind: "page", render: () => loaded(exchange, matched, (chain) => data(exchange, chain)) };
	return { kind: "page", render: () => loaded(exchange, matched, (chain) => page(exchange, chain)) };
}

// Awaits the chain's modules, then runs the handler. An import that fails on the server is a bug: projected,
// then 500.
async function loaded(
	exchange: Exchange,
	matched: Match,
	run: (chain: Loaded) => Promise<Response>,
): Promise<Response> {
	let chain: Loaded;
	try {
		chain = { ...matched, chain: await loadChain(matched.chain) };
	} catch (error) {
		projectError(error, exchange.sink);
		return answer(exchange, 500);
	}
	return run(chain);
}

// A data or prefetch request (bit 06). The stale pages run no loader. A thrown redirect is HTTP 200 with one
// `x` line. Validation, a gate status, and a named failure answer bare. Anything else is the NDJSON stream.
async function data(exchange: Exchange, matched: Loaded): Promise<Response> {
	const raw = new URL(exchange.request.url).search.slice(1);
	const id = matchId(definedParams(matched.params), raw);
	const matches = matched.chain.map((entry) => ({ route: entry.id, id, layout: entry.kind === "layout" }));
	const skip = skippedRoutes(matches, exchange.stale);
	const run = await runLoaders({ ...loaderInput(exchange, matched), skip });
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
	return { status, body, headers: typed(exchange, NDJSON), url: exchange.request.url };
}

// The answer still passes through finalize, and the request's security set wins over its headers. A node
// flagged as .response() whose module has none is a codegen bug: projected, then 500.
async function answered(exchange: Exchange, matched: Loaded): Promise<Response> {
	const respond = defined(matched.chain.at(-1), "the .response() page").module.response;
	if (respond === undefined) {
		projectError(new Error(`${matched.id} is flagged as a .response() page but has no response`), exchange.sink);
		return answer(exchange, 500);
	}
	const run = await runLoaders({ ...loaderInput(exchange, matched), response: respond });
	if (run.answer === undefined) return bare(exchange, run);
	return secure(exchange, { status: run.answer.status, body: run.answer.body, headers: run.answer.headers });
}

// An unknown path runs the loaders of its not-found chain: the root layout, or the fuzzy owner and its
// ancestors (B73). The selected layout renders, and its outlet is the not-found the router chose (B77).
async function notFound(exchange: Exchange, matched: Loaded): Promise<Response> {
	if (matched.chain.length === 0) return answer(exchange, 404);
	const run = await runLoaders(loaderInput(exchange, matched));
	const rendered = { chain: matched.chain, run };
	if (run.response.status === 200) return paint(exchange, { ...rendered, unknown: true }, 404);
	return settle(exchange, rendered);
}

async function page(exchange: Exchange, matched: Loaded): Promise<Response> {
	const chain = matched.chain;
	const run = await runLoaders(loaderInput(exchange, matched));
	// "buffer" holds the document until every defer this render started has settled. Solid then writes the
	// settled values in the shell (B92).
	if (exchange.options.documentResponseDefer === "buffer")
		await Promise.allSettled(run.deferred.map((entry) => entry.promise));
	if (run.response.status === 200) return paint(exchange, { chain, run }, 200);
	return settle(exchange, { chain, run });
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
		matches: outletMatches(rendered),
		failure: rendered.failed && { index: rendered.run.data.length, ...rendered.failed },
		unknown: rendered.unknown && { render: notFoundRenderOf(rendered.chain) },
		onBoundaryError: (error) => void projectError(error, exchange.sink),
		failRender: (error) => void thrownInRender.push(error),
	};
	// A render throw is caught by the slot's boundary, so the tree matches the client's. It still answers as the
	// failure it was (B93).
	const thrownInRender: unknown[] = [];
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
			// flare() defines the client entry URL for the server environments. Without the plugin there is none.
			client: import.meta.env.FLARE_CLIENT_ENTRY,
		});
		if (thrownInRender.length > 0) {
			void body.cancel();
			throw thrownInRender[0];
		}
	} catch (thrown) {
		return renderFailed(exchange, projectError(thrown, exchange.sink));
	}
	const url = exchange.request.url;
	return finalize({ status, body, render: "ssr", url, headers: typed(exchange, HTML) });
}

// The stream rejected before the shell, so nothing was written (B93). Only a dev bug shows its message and
// stack. Production and a named status answer an empty body.
function renderFailed(exchange: Exchange, projected: Projected): Response {
	const stack = projected.wire.stack;
	const body = stack === undefined ? "" : `<pre>${escape(`${projected.wire.message}\n${stack}`)}</pre>`;
	return finalize({ status: projected.status, body, url: exchange.request.url, headers: typed(exchange, HTML) });
}

// The validators read the raw records: defined params, and the search as one string or a `string[]` per key.
function loaderInput(exchange: Exchange, matched: Loaded): RunInput {
	const routes = matched.chain.map((entry) => ({ ...entry.module, id: entry.id }));
	return {
		params: definedParams(matched.params),
		search: readSearch(new URL(exchange.request.url).search),
		kind: exchange.kind,
		dev: exchange.sink.dev,
		request: exchange.request,
		env: exchange.env,
		// The request's one session, shared with every server function it calls.
		authenticate: () => resolveCaller(routes, exchange.session),
		routes,
	};
}

// Step 7: a server function is dispatched and never reaches the router (B42).
async function serverFn(exchange: Exchange): Promise<Response> {
	const { serverFns = {}, sameSite = [], bodyLimit, router } = exchange.options;
	const input = { request: exchange.request, serverFns, sameSite, sink: exchange.sink, basePath: router.basePath };
	return secure(exchange, await dispatch({ ...input, bodyLimit }));
}
