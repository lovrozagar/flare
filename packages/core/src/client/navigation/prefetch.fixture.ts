import type { Location } from "../../shared/url/index.ts"
import { vi, type Mock } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule, type Router, type RouterOptions } from "../../shared/router/create-router.ts"
import type { Fetch } from "./navigate.fixture.ts"
import { createPrefetcher, type PrefetchEnv, type Prefetcher } from "./prefetch.ts"
import { userWork, type UserWork } from "./user-work.ts"

// The routes, router, and prefetcher the prefetch tests share (prefetch.test, prefetch-all.test).
export const root: RouteModule = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
export const home: RouteModule = createPage("_root_/").render((props) => `home:${String(props.loaderData)}`)
export const about: RouteModule = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`)
export const slow: RouteModule = createPage("_root_/slow").render(() => "slow")
export const importAbout: Mock<() => Promise<RouteModule>> = vi.fn<() => Promise<RouteModule>>(async () => about)

export const aboutFrames: Frame[] = [
	{ t: "l", m: "_root_", d: null },
	{ t: "l", m: "_root_/about", d: "fresh" },
	{ t: "r" },
	{ t: "d" },
]

export function ndjson(frames: readonly Frame[], headers: Record<string, string> = {}): Response {
	return new Response(frames.map(encodeFrame).join(""), {
		headers: { "content-type": "application/x-ndjson", ...headers },
	})
}

export function routerOf(options: Partial<RouterOptions> = {}, aboutClient?: RouteModule["cache"]): Router {
	const client = aboutClient?.client
	return createRouter({
		layouts: { _root_: root },
		routeTree: [
			{ id: "_root_/", path: "/", module: home },
			{ id: "_root_/about", path: "/about", module: importAbout, ...(client === undefined ? {} : { client }) },
			{ id: "_root_/slow", path: "/slow", module: slow },
		],
		...options,
	})
}

export type Setup = { fetch?: Fetch; env?: Partial<PrefetchEnv>; current?: () => Location; work?: UserWork }

// What `setup` made: the prefetcher, its mocked fetch and viewport observer, the idle and observed callbacks it was
// handed, and the clock it reads.
export type PrefetchApp = {
	prefetcher: Prefetcher
	fetch: Mock<Fetch>
	observed: (() => void)[]
	idle: (() => void)[]
	env: PrefetchEnv
	clock: { now: number }
	router: Router
	// The user work the warm-up yields to, on the same clock (BUGS.md 520).
	work: UserWork
}

export function setup(router: Router = routerOf(), options: Setup = {}): PrefetchApp {
	const fetch = vi.fn<Fetch>(options.fetch ?? (async () => ndjson(aboutFrames)))
	const observed: (() => void)[] = []
	const idle: (() => void)[] = []
	const clock = { now: 0 }
	const env: PrefetchEnv = {
		network: {},
		observe: vi.fn<PrefetchEnv["observe"]>((_element, run) => {
			observed.push(run)
			return () => undefined
		}),
		idle: (run) => void idle.push(run),
		head: document.head,
		now: () => clock.now,
		relPrefetch: true,
		...options.env,
	}
	const work = options.work ?? userWork(() => clock.now)
	const prefetcher = createPrefetcher({
		router,
		origin: location.origin,
		current: options.current ?? (() => ({ pathname: "/", search: "", hash: "" })),
		fetch,
		build: "b1",
		land: { dev: false },
		env,
		work,
	})
	return { prefetcher, fetch, observed, idle, env, clock, router, work }
}

export function anchor(): HTMLAnchorElement {
	const element = document.createElement("a")
	document.body.append(element)
	return element
}

export function hover(element: Element): void {
	element.dispatchEvent(new Event("pointerenter"))
}
