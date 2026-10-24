import { defined } from "../../shared/errors/index.ts"
import { parseDuration } from "../../shared/duration/index.ts"
import { BUILD_HEADER } from "../../shared/protocol/index.ts"
import type { PrefetchTrigger, RoutePrefetch } from "../../shared/route-builder/index.ts"
import type { Match, Router } from "../../shared/router/create-router.ts"
import { loadChain } from "../../shared/router/load-chain.ts"
import type { Location } from "../../shared/url/index.ts"
import { clientOf } from "../router/match-cache.ts"
import { framesOf, landFrames, type Landed, type LandOptions } from "./frames.ts"
import { resolveUrl, type Target } from "./target.ts"
import type { UserWork } from "./user-work.ts"
import { lowData, warmAll } from "./warm.ts"

// The browser surface prefetch uses, passed in so a test can observe it. `network` is the object that may carry
// `connection` (the browser's navigator). `relPrefetch`: the browser supports `<link rel=prefetch>`, which Safari does
// not through 26.x (BUGS.md 124); by default the document's own answer.
export type PrefetchEnv = {
	network: object
	observe: (element: Element, run: () => void) => () => void
	idle: (run: () => void) => void
	head: HTMLElement
	now: () => number
	relPrefetch?: boolean
	// The document's protocol, the navigation entry's `nextHopProtocol`: "h2" or "h3" lets the warm keep more in flight.
	protocol?: string
}

export type PrefetchDeps = {
	router: Router
	origin: string
	current: () => Location
	fetch: (url: string, init: RequestInit) => Promise<Response>
	build: string
	land: LandOptions
	env: PrefetchEnv
	// The user's own requests in flight, which the idle warm-up yields to (BUGS.md 520).
	work: UserWork
}

export type Prefetcher = {
	all: () => void
	watch: (element: HTMLElement, href: string, input?: RoutePrefetch) => () => void
	prefetched: (dataUrl: string) => Promise<Landed | undefined> | undefined
	// Drops every held landing, one in flight too: the visitor may have changed (B133).
	forget: () => void
}

type DataTarget = Extract<Target, { kind: "data" }>

type Binding = { trigger: Exclude<PrefetchTrigger, false>; env: PrefetchEnv; run: () => void }

// A prefetched landing waits here, by data URL, until a navigation takes it or its own clock runs out.
type Held = { landing: Promise<Landed | undefined>; at?: number; keep: number }

const INTENT = ["pointerenter", "focus", "touchstart"] as const

const PREFETCH_STALE = "30s"

// How long a prefetched entry may be kept: `prefetchGcTime`, else the route's `gcTime`, else the router's (BUGS.md
// 398). A router whose client cache is off sets no bound.
function gcOf(client: ReturnType<typeof clientOf>, router: Router): number {
	const routerGc = router.cache.client === false ? undefined : router.cache.client.gcTime
	const gcTime = client.prefetchGcTime ?? client.gcTime ?? routerGc
	return gcTime === undefined ? Number.POSITIVE_INFINITY : parseDuration(gcTime)
}

// `modules` loads route code and does no server work. `data` runs the loaders with `_flare=prefetch`, loads the
// modules too, and never commits (B64). A navigation to that URL takes the landing whole while it is fresh, and
// from then on it is a normal cache entry (dx/cache.md).
export function createPrefetcher(deps: PrefetchDeps): Prefetcher {
	const held = new Map<string, Held>()
	const expired = (entry: Held): boolean => entry.at !== undefined && deps.env.now() - entry.at > entry.keep
	const data = (target: DataTarget): void => {
		const entry = held.get(target.dataUrl)
		if (entry !== undefined && !expired(entry)) return
		const client = clientOf(target.match.client)
		const keep = Math.min(parseDuration(client.prefetchStaleTime ?? PREFETCH_STALE), gcOf(client, deps.router))
		const next: Held = { landing: request(deps, target), keep }
		held.delete(target.dataUrl)
		held.set(target.dataUrl, next)
		if (held.size > deps.router.routeCacheMaxEntries)
			held.delete(defined(held.keys().next().value, "the oldest prefetch"))
		void next.landing.then((landing) => {
			if (landing !== undefined) next.at = deps.env.now()
			else if (held.get(target.dataUrl) === next) held.delete(target.dataUrl)
		})
	}
	// A trigger fires for modules, data, or both. Data always loads the modules too. The user's hover, focus, or scroll
	// fired it, so its module loading is user work the warm-up waits for; its data request is counted by the fetch.
	const run = (target: DataTarget, withData: boolean): void => {
		const done = deps.work.begin()
		void loadChain(target.match.chain)
			.catch(() => undefined)
			.finally(done)
		if (withData) data(target)
	}
	return {
		all: () => warmAll(deps.router, deps.env, deps.work),
		watch(element, href, input) {
			const match = watchedMatch(local(href, deps), deps.router)
			if (match === undefined) return () => undefined
			const fields = fieldsOf(input, clientOf(match.client).prefetch, deps.router.prefetch)
			const modules = fields.modules === "all" ? lowData(deps.env.network) && "viewport" : fields.modules
			const triggers = new Set([modules, fields.data].filter((trigger) => trigger !== false))
			const fire = (withData: boolean): void => {
				const target = local(href, deps)
				if (target?.kind === "data") run(target, withData)
			}
			const stops = [...triggers].map((trigger) =>
				bind(element, { trigger, env: deps.env, run: () => fire(fields.data === trigger) }),
			)
			return () => {
				for (const stop of stops) stop()
			}
		},
		forget: () => held.clear(),
		prefetched(dataUrl) {
			const entry = held.get(dataUrl)
			held.delete(dataUrl)
			return entry === undefined || expired(entry) ? undefined : entry.landing
		},
	}
}

// The page a watched Link names: a data target's match, or the page of a hash move on screen now, which is a navigation
// once the page changes, so a trigger resolves its target when it fires (BUGS.md 309). Any other target, another
// origin or root or a `.response()` page, is never prefetched.
function watchedMatch(target: Target | undefined, router: Router): Match | undefined {
	if (target?.kind === "data") return target.match
	return target?.kind === "hash" ? router.match(target.location.pathname) : undefined
}

// Only a same-origin route prefetches. Another origin, or a URL that does not parse, does not (dx/link.md).
function local(href: string, deps: PrefetchDeps): Target | undefined {
	if (!sameOrigin(href, deps.origin)) return undefined
	return resolveUrl(href, { router: deps.router, origin: deps.origin, current: deps.current() })
}

// `URL.canParse` is Chrome 120 and Safari 17, above the client's browser floor (decision B123), so a URL that does not
// parse is the constructor's throw.
function sameOrigin(href: string, origin: string): boolean {
	try {
		return new URL(href, origin).origin === origin
	} catch {
		return false
	}
}

// The browser's viewport trigger: `run` once, the first time the element is in view.
export function observeViewport(element: Element, run: () => void): () => void {
	const observer = new IntersectionObserver((entries) => {
		if (!entries.some((entry) => entry.isIntersecting)) return
		observer.disconnect()
		run()
	})
	observer.observe(element)
	return () => observer.disconnect()
}

// Per field: the link, then the route, then the router (B64).
function fieldsOf(link: RoutePrefetch | undefined, route: RoutePrefetch | undefined, router: Router["prefetch"]) {
	const [mine, theirs] = [split(link), split(route)]
	return { modules: mine.modules ?? theirs.modules ?? router.modules, data: mine.data ?? theirs.data ?? router.data }
}

// A string sets both fields.
function split(value: RoutePrefetch | undefined): { data?: PrefetchTrigger; modules?: PrefetchTrigger } {
	if (typeof value === "object") return value
	return value === undefined ? {} : { data: value, modules: value }
}

function bind(element: HTMLElement, { trigger, env, run }: Binding): () => void {
	if (trigger === "viewport") return env.observe(element, run)
	if (trigger === "render") {
		let live = true
		env.idle(() => live && run())
		return () => void (live = false)
	}
	for (const event of INTENT) element.addEventListener(event, run, { passive: true })
	return () => {
		for (const event of INTENT) element.removeEventListener(event, run)
	}
}

// A failed or mismatched prefetch is dropped. The navigation then makes its own request and handles it.
async function request(deps: PrefetchDeps, target: DataTarget): Promise<Landed | undefined> {
	// target.ts writes the kind param last.
	const url = `${target.dataUrl.slice(0, -"data".length)}prefetch`
	try {
		const response = await deps.fetch(url, {})
		const build = response.headers.get(BUILD_HEADER) ?? ""
		if (build !== "" && deps.build !== "" && build !== deps.build) return undefined
		if (response.status !== 200 || response.body === null) return undefined
		return await landFrames(framesOf(response.body), deps.land)
	} catch {
		return undefined
	}
}
