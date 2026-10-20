import type {
	PrerenderPage,
	PrerenderParams,
	PrerenderRoute,
	Prerenderer,
	PrerenderResult,
} from "../../shared/protocol/prerender.ts"
import type { CacheConfig, ParamsFn } from "../../shared/route-builder/chain.ts"
import { layoutChain, type RouteModule, type RouteNode } from "../../shared/router/create-router.ts"
import { loadChain } from "../../shared/router/load-chain.ts"
import { patternSegments } from "../../shared/route-tree/index.ts"
import { buildUrl } from "../../shared/url/href.ts"
import { routeHref } from "../../shared/url/prefix.ts"
import { effectiveAuth } from "../auth/effective.ts"
import { defined } from "../../shared/errors/index.ts"
import type { RuntimeOptions } from "../lifecycle/options.ts"
import type { FlareStoreEntry } from "./contract.ts"

// What a prerender request hands the page answer in place of a store: the key and the entry a stored miss writes.
export type Capture = (key: string, entry: FlareStoreEntry) => void

type Serve = (request: Request, env: unknown, capture: Capture) => Promise<Response>

type Planned = { page: PrerenderPage; cache: CacheConfig | undefined }

// What `vite build`'s prerender reads of a built server (bits/12): `site`, its ssg and isr pages, every route for the
// sitemap, their params, and a render that runs the whole pipeline, middleware and mounts included, on `site` plus
// the page's path. A shared answer goes through the same shared render and entry a stored miss writes, captured here
// instead of stored.
export function prerenderer(options: RuntimeOptions, serve: Serve): Prerenderer {
	return {
		site: options.site,
		async pages() {
			return (await planned(options)).map((item) => item.page)
		},
		async routes() {
			return Promise.all(options.router.routeTree.map((node) => described(options, node)))
		},
		async params(id) {
			const list = paramsFn((await plannedPage(options, id)).cache)
			return list === undefined ? [{}] : list({ params: {} })
		},
		async render(input) {
			const found = await plannedPage(options, input.id)
			if (found.page.mode === "isr" && !found.page.listed) throw new Error(notPrerendered(input.id))
			return rendered(options, serve, input)
		},
	}
}

async function plannedPage(options: RuntimeOptions, id: string): Promise<Planned> {
	const found = (await planned(options)).find((item) => item.page.id === id)
	if (found === undefined) throw new Error(notPrerendered(id))
	return found
}

function notPrerendered(id: string): string {
	return `${id} is not prerendered: only an ssg page, or an isr page with params, renders at build`
}

// Every ssg and isr page, with its chain loaded. A .response() page has no render, and a live page is not stored.
async function planned(options: RuntimeOptions): Promise<Planned[]> {
	const pages = options.router.routeTree.filter((node) => node.response !== true)
	const loaded = await Promise.all(pages.map((node) => plan(options, node)))
	return loaded.flatMap((item) => (item === undefined ? [] : [item]))
}

async function plan(options: RuntimeOptions, node: RouteNode): Promise<Planned | undefined> {
	const modules = await chainOf(options, node)
	const cache = defined(modules.at(-1), "the prerendered page").cache
	if (cache?.ssg === undefined && cache?.isr === undefined) return undefined
	const page: PrerenderPage = {
		id: node.id,
		mode: cache.ssg === undefined ? "isr" : "ssg",
		dynamic: dynamicPath(node),
		listed: paramsFn(cache) !== undefined,
		auth: effectiveAuth(modules),
		authorize: modules.some((module) => module.authorize !== undefined),
	}
	return { page, cache }
}

async function chainOf(options: RuntimeOptions, node: RouteNode): Promise<RouteModule[]> {
	const chain = await loadChain([
		...layoutChain(options.router.layouts, node.id),
		{ id: node.id, kind: "page", module: node.module },
	])
	return chain.map((entry) => entry.module)
}

function dynamicPath(node: RouteNode): boolean {
	return patternSegments(node.path).some((segment) => segment.kind !== "static")
}

// One route node as the sitemap reads it. Only its chain's modules load; no loader, preloader, or render runs.
async function described(options: RuntimeOptions, node: RouteNode): Promise<PrerenderRoute> {
	const modules = await chainOf(options, node)
	return {
		id: node.id,
		// The URL the app serves, a literal-bracket folder written as its text, never the pattern (plan 21 13.7).
		path: dynamicPath(node) ? undefined : routeHref(options.router, buildUrl({ to: node.id, params: {} })),
		bare: bareUrls(options, node),
		response: node.response === true,
		auth: effectiveAuth(modules),
		authorize: modules.some((module) => module.authorize !== undefined),
	}
}

// An absent optional param counts as resolved: a URL whose param segments are all optional has a bare URL, and one
// per other configured tag when the locale param is among them. A required param has none (B101, BUGS.md B10).
function bareUrls(options: RuntimeOptions, node: RouteNode): string[] {
	const params = patternSegments(node.path).filter((segment) => segment.kind !== "static")
	if (params.length === 0 || params.some((segment) => !segment.optional)) return []
	// The router's locale config, when the server has a locale slot (B73, B101).
	const locale = options.locale === undefined ? undefined : options.router.locale
	const tagged = locale !== undefined && params.some((segment) => segment.name === locale.paramName)
	const tags = tagged ? locale.locales.filter((tag) => tag !== locale.defaultLocale) : []
	return [undefined, ...tags].map((tag) => {
		const values = tag === undefined || locale === undefined ? {} : { [locale.paramName]: tag }
		return routeHref(options.router, buildUrl({ to: node.id, params: values }))
	})
}

// The page's `params`: an ssg function or `{ params }`, or isr's `params`.
function paramsFn(cache: CacheConfig | undefined): ParamsFn | undefined {
	const ssg = cache?.ssg
	if (typeof ssg === "function") return ssg
	if (typeof ssg === "object" && "params" in ssg) return ssg.params
	const isr = cache?.isr
	return typeof isr === "object" ? isr.params : undefined
}

// `site` plus the canonical path under the router's base, with no search and no request headers (dx/cache.md).
async function rendered(
	options: RuntimeOptions,
	serve: Serve,
	input: { id: string; params: PrerenderParams; env: unknown },
): Promise<PrerenderResult> {
	if (options.site === undefined) throw new Error("prerender reads createServer({ site })")
	const full = routeHref(options.router, buildUrl({ to: input.id, params: input.params }))
	let captured: { key: string; entry: FlareStoreEntry } | undefined
	const response = await serve(new Request(new URL(full, options.site)), input.env, (key, entry) => {
		captured = { key, entry }
	})
	await response.body?.cancel()
	// A listed path another page serves, a static page beside a catch-all say, is that page's: its seed would be written
	// again under this page's job, so nothing is kept (BUGS.md 418). The match is the request's own: a path the server
	// answered as is, after the canonical step, which redirects a rewritten path rather than matching it.
	const owner = response.status === 200 ? options.router.match(new URL(full, options.site).pathname).id : undefined
	if (owner !== undefined && owner !== input.id) return { status: 0, path: full, owner }
	const answer = { status: response.status, path: full }
	return captured === undefined ? answer : { ...answer, ...captured }
}
