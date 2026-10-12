/// <reference types="vite/client" />
import { createComponent } from "solid-js";
import { escape } from "@solidjs/web";
import { Matches, type OutletState } from "../../shared/components/index.ts";
import { RedirectError } from "../../shared/errors/redirect.ts";
import { mergeHead } from "../../shared/head/index.ts";
import type { FrameError } from "../../shared/protocol/index.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import { matchId } from "../../shared/route-tree/index.ts";
import { notFoundRenderOf, type LoadedEntry, type Match } from "../../shared/router/create-router.ts";
import { readSearch } from "../../shared/url/search.ts";
import { resolveCaller } from "../auth/caller.ts";
import { effectiveAuth } from "../auth/effective.ts";
import { decide, withCookies, type Decision } from "../cacheability/index.ts";
import { runLoaders, type LoaderRun, type RunInput } from "../loaders/run.ts";
import { dataBody, dataFrames, NDJSON, redirectBody, skippedRoutes } from "../navigation/index.ts";
import { redirectLocation } from "../redirect/index.ts";
import { renderDocument } from "../render/document.ts";
import { definedParams, outletMatches, stateMatches, type Rendered } from "../render/matches.ts";
import { projectError, type Projected } from "../render/projector.ts";
import { answer, bare, routeSecured, typed, type Exchange } from "./exchange.ts";
import { finalize, type StageResult } from "./finalize.ts";
import { isPublic, policyHeaders } from "./policies.ts";

// The rendered-page answers: a document, a data or prefetch response, and the not-found page (02-system steps 10 to
// 13). createServer routes to them.

export const HTML = "text/html; charset=utf-8";

declare global {
	interface ImportMetaEnv {
		// The client entry URL flare() defines in the server environments (dx/plugin.md).
		readonly FLARE_CLIENT_ENTRY?: string;
	}
}

// A match whose modules are loaded (02-system step 10).
export type Loaded = Omit<Match, "chain"> & { chain: readonly LoadedEntry[] };

// The request's decision, and the raw params a `cdn.tags` function reads (B32). `rejected` is a deferred value that
// rejected before a public answer was sent.
export type Policy = { decision: Decision; params: Record<string, string | string[]>; rejected?: boolean };

// What the decision hands the loaders, and the policy the answer writes.
export type Prepared = { input: RunInput; policy: Policy };

// An unknown path answers 404, which no policy makes public.
const UNDECIDED: Policy = { decision: { policy: "no-store", cdn: {} }, params: {} };

export type Decided = Rendered & { policy: Policy };

export type Staged = StageResult & { headers: Headers };

// The policy is decided before the loaders run, so bit 10's store read sees `shared` (dx/cache.md). A chain that
// reads auth and does not require it resolves the request's one session first, through the memoized authenticate
// the gate calls next. A throw there answers a status, which no policy makes public.
export async function decided(exchange: Exchange, matched: Loaded): Promise<Prepared> {
	const input = loaderInput(exchange, matched);
	const modules = matched.chain.map((entry) => entry.module);
	const auth = effectiveAuth(modules);
	const session =
		auth.reads &&
		!auth.requires &&
		(await Promise.resolve(input.authenticate()).then(
			(value) => value !== null,
			() => true,
		));
	const decision = decide({ chain: modules.map((module) => module.cache), auth, session });
	return {
		input: { ...input, shared: decision.policy === "shared" },
		policy: { decision, params: definedParams(matched.params) },
	};
}

// A public answer, document or data, waits for every deferred value it started, whatever documentResponseDefer
// says, so a CDN copy holds no hole and no deferred error. A rejection is an error frame, so the answer leaves
// `private, no-store` (dx/cache.md). "buffer" holds any document the same way. Solid then writes the settled values
// in the shell (B92). Any other answer streams.
async function awaited(run: LoaderRun, policy: Policy, buffer: boolean): Promise<Policy> {
	const route = [run.headers["set-cookie"] ?? []].flat();
	if (!buffer && !isPublic(withCookies(policy.decision, { route, all: route }))) return policy;
	const results = await Promise.allSettled(run.deferred.map((entry) => entry.promise));
	return { ...policy, rejected: results.some((result) => result.status === "rejected") };
}

// The decision, downgraded by a cookie the route sets, writes Cache-Control and Cache-Tag over the answer's
// headers. `errored` is an error frame on a data answer, or a painted failure.
export function cached(
	result: Staged,
	policy: Policy,
	answer: { run: Pick<LoaderRun, "headers">; errored: boolean },
): Response {
	const route = [answer.run.headers["set-cookie"] ?? []].flat();
	const decision = withCookies(policy.decision, { route, all: result.headers.getSetCookie() });
	const errored = answer.errored || policy.rejected === true;
	const written = policyHeaders(decision, { status: result.status, params: policy.params, errored });
	written.forEach((value, name) => result.headers.set(name, value));
	return finalize(result);
}

// A data or prefetch request (bit 06). The stale pages run no loader. A thrown redirect is HTTP 200 with one
// `x` line. Validation, a gate status, and a named failure answer bare. Anything else is the NDJSON stream.
export async function data(exchange: Exchange, matched: Loaded, prepared: Prepared): Promise<Response> {
	const raw = new URL(exchange.request.url).search.slice(1);
	const id = matchId(definedParams(matched.params), raw);
	const matches = matched.chain.map((entry) => ({ route: entry.id, id, layout: entry.kind === "layout" }));
	const skip = skippedRoutes(matches, exchange.stale);
	const run = await runLoaders({ ...prepared.input, skip });
	return dataFrom(exchange, run, { skip, policy: prepared.policy });
}

// The data answer for a finished loader run.
export async function dataFrom(
	exchange: Exchange,
	run: LoaderRun,
	{ skip, policy }: { skip: ReadonlySet<string>; policy: Policy },
): Promise<Response> {
	const thrown = run.thrown ?? run.failed?.error;
	if (thrown instanceof RedirectError) {
		const u = redirectLocation(thrown, exchange.options.router.basePath);
		return finalize({
			...stage(routeSecured(exchange, run.security), redirectBody({ s: thrown.status, u, r: thrown.replace }), run),
		});
	}
	if (run.response.status !== 200) return bare(exchange, run);
	for (const bug of run.bugs) projectError(bug, exchange.sink);
	const settled = await awaited(run, policy, false);
	const body = dataBody({ ...dataFrames(run, skip), deferred: run.deferred, project: framed(exchange) });
	const errored = run.frames.some((frame) => frame.t === "e");
	return cached(stage(routeSecured(exchange, run.security), body, run), settled, { run, errored });
}

// A deferred failure's `e` frame: the projected wire error.
export function framed(exchange: Exchange): (error: unknown) => FrameError {
	return (error) => {
		const wire = projectError(error, exchange.sink).wire;
		return { message: wire.message, stack: wire.stack, digest: wire.digest };
	};
}

// A data answer is HTTP 200 with the route's headers, whatever its frames say (B73).
function stage(exchange: Exchange, body: BodyInit, run: LoaderRun): Staged {
	return { status: 200, body, headers: typed(exchange, NDJSON, run.headers) };
}

// An unknown path runs the loaders of its not-found chain: the root layout, or the fuzzy owner and its
// ancestors (B73). The selected layout renders, and its outlet is the not-found the router chose (B77).
export async function notFound(exchange: Exchange, matched: Loaded): Promise<Response> {
	if (matched.chain.length === 0) return answer(exchange, 404);
	const run = await runLoaders(loaderInput(exchange, matched));
	const rendered = { chain: matched.chain, run, policy: UNDECIDED };
	if (run.response.status === 200) return paint(exchange, { ...rendered, unknown: true }, 404);
	return settle(exchange, rendered);
}

export async function page(exchange: Exchange, matched: Loaded, prepared: Prepared): Promise<Response> {
	const run = await runLoaders(prepared.input);
	const settled = await awaited(run, prepared.policy, exchange.options.documentResponseDefer === "buffer");
	return painted(exchange, { chain: matched.chain, run, policy: settled });
}

// The document for a finished loader run: the page, or what its failure answers.
export function painted(exchange: Exchange, rendered: Decided): Promise<Response> {
	if (rendered.run.response.status === 200) return paint(exchange, rendered, 200);
	return settle(exchange, rendered);
}

// A thrown redirect() answers its status and Location, with no render and no boundary (B73). A failed match
// paints the walked boundary at the failure's status. Validation and a gate status answer bare.
function settle(exchange: Exchange, rendered: Decided): Promise<Response> {
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

async function paint(outer: Exchange, rendered: Decided, status: number): Promise<Response> {
	const document = await drawn(outer, rendered);
	if ("failed" in document) return document.failed;
	const headers = typed(document.exchange, HTML, rendered.run.headers);
	const result = { status, body: document.body, render: "ssr" as const, headers };
	return cached(result, rendered.policy, { run: rendered.run, errored: rendered.failed !== undefined });
}

// The document body, rendered under the route's security set, or the answer for a render that failed before the
// shell (B93).
export async function drawn(
	outer: Exchange,
	rendered: Rendered,
): Promise<{ exchange: Exchange; body: ReadableStream<Uint8Array> } | { failed: Response }> {
	const exchange = routeSecured(outer, rendered.run.security);
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
		return { failed: renderFailed(exchange, projectError(thrown, exchange.sink)) };
	}
	return { exchange, body };
}

// The stream rejected before the shell, so nothing was written (B93). Only a dev bug shows its message and
// stack. Production and a named status answer an empty body.
function renderFailed(exchange: Exchange, projected: Projected): Response {
	const stack = projected.wire.stack;
	const body = stack === undefined ? "" : `<pre>${escape(`${projected.wire.message}\n${stack}`)}</pre>`;
	return finalize({ status: projected.status, body, headers: typed(exchange, HTML) });
}

// The validators read the raw records: defined params, and the search as one string or a `string[]` per key.
export function loaderInput(exchange: Exchange, matched: Loaded): RunInput {
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
