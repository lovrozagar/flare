import type { PrerenderPage, PrerenderParams, Prerenderer, PrerenderResult } from "../../shared/protocol/prerender.ts";
import type { CacheConfig, ParamsFn } from "../../shared/route-builder/chain.ts";
import { layoutChain, loadChain, type RouteNode } from "../../shared/router/create-router.ts";
import { patternSegments } from "../../shared/route-tree/index.ts";
import { buildUrl } from "../../shared/url/href.ts";
import { effectiveAuth } from "../auth/effective.ts";
import { defined } from "../../shared/errors/index.ts";
import type { RuntimeOptions } from "../lifecycle/options.ts";
import type { FlareStoreEntry } from "./contract.ts";

// What a prerender request hands the page answer in place of a store: the key and the entry a stored miss writes.
export type Capture = (key: string, entry: FlareStoreEntry) => void;

type Serve = (request: Request, env: unknown, capture: Capture) => Promise<Response>;

type Planned = { page: PrerenderPage; cache: CacheConfig | undefined };

// What `vite build`'s prerender reads of a built server (bits/12): its ssg and isr pages, their params, and a render
// that runs the whole pipeline, middleware and mounts included, on `site` plus the page's path. A shared answer goes
// through the same shared render and entry a stored miss writes, captured here instead of stored.
export function prerenderer(options: RuntimeOptions, serve: Serve): Prerenderer {
	return {
		async pages() {
			return (await planned(options)).map((item) => item.page);
		},
		async params(id) {
			const list = paramsFn((await plannedPage(options, id)).cache);
			return list === undefined ? [{}] : list({ params: {} });
		},
		async render(input) {
			const found = await plannedPage(options, input.id);
			if (found.page.mode === "isr" && !found.page.listed) throw new Error(notPrerendered(input.id));
			return rendered(options, serve, input);
		},
	};
}

async function plannedPage(options: RuntimeOptions, id: string): Promise<Planned> {
	const found = (await planned(options)).find((item) => item.page.id === id);
	if (found === undefined) throw new Error(notPrerendered(id));
	return found;
}

function notPrerendered(id: string): string {
	return `${id} is not prerendered: only an ssg page, or an isr page with params, renders at build`;
}

// Every ssg and isr page, with its chain loaded. A .response() page has no render, and a live page is not stored.
async function planned(options: RuntimeOptions): Promise<Planned[]> {
	const pages = options.router.routeTree.filter((node) => node.response !== true);
	const loaded = await Promise.all(pages.map((node) => plan(options, node)));
	return loaded.flatMap((item) => (item === undefined ? [] : [item]));
}

async function plan(options: RuntimeOptions, node: RouteNode): Promise<Planned | undefined> {
	const chain = await loadChain([
		...layoutChain(options.router.layouts, node.id),
		{ id: node.id, kind: "page", module: node.module },
	]);
	const modules = chain.map((entry) => entry.module);
	const cache = defined(modules.at(-1), "the prerendered page").cache;
	if (cache?.ssg === undefined && cache?.isr === undefined) return undefined;
	const page: PrerenderPage = {
		id: node.id,
		mode: cache.ssg === undefined ? "isr" : "ssg",
		dynamic: patternSegments(node.path).some((segment) => segment.kind !== "static"),
		listed: paramsFn(cache) !== undefined,
		auth: effectiveAuth(modules),
		authorize: modules.some((module) => module.authorize !== undefined),
	};
	return { page, cache };
}

// The page's `params`: an ssg function or `{ params }`, or isr's `params`.
function paramsFn(cache: CacheConfig | undefined): ParamsFn | undefined {
	const ssg = cache?.ssg;
	if (typeof ssg === "function") return ssg;
	if (typeof ssg === "object" && "params" in ssg) return ssg.params;
	const isr = cache?.isr;
	return typeof isr === "object" ? isr.params : undefined;
}

// `site` plus the canonical path under the router's base, with no search and no request headers (dx/cache.md).
async function rendered(
	options: RuntimeOptions,
	serve: Serve,
	input: { id: string; params: PrerenderParams; env: unknown },
): Promise<PrerenderResult> {
	if (options.site === undefined) throw new Error("prerender reads createServer({ site })");
	const path = buildUrl({ to: input.id, params: input.params });
	const base = options.router.basePath;
	const full = base === "/" ? path : `${base}${path === "/" ? "" : path}`;
	let captured: { key: string; entry: FlareStoreEntry } | undefined;
	const response = await serve(new Request(new URL(full, options.site)), input.env, (key, entry) => {
		captured = { key, entry };
	});
	await response.body?.cancel();
	return captured === undefined ? { status: response.status } : { status: response.status, ...captured };
}
