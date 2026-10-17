/// <reference types="vite/client" />
import { setActiveClient } from "../navigation/active.ts"
import { invalidation } from "../navigation/invalidate.ts"
import { hydrate } from "@solidjs/web"
import { delegateClicks } from "../../shared/components/index.ts"
import { devErrorPayload, type DevErrorPayload } from "../../shared/errors/index.ts"
import type { Router } from "../../shared/router/create-router.ts"
import { loadChain } from "../../shared/router/load-chain.ts"
import type { ServerFnCall } from "../../shared/server-fn/builder.ts"
import type { Location } from "../../shared/url/index.ts"
import { createHistory, type FlareHistory } from "../history/index.ts"
import { createBlockers, type Blockers } from "../navigation/blocker.ts"
import { revive, type Pending } from "../navigation/frames.ts"
import { createNavigator, type NavigatorDeps } from "../navigation/navigate.ts"
import { createNavigationState } from "../navigation/pending.ts"
import { createPopstate } from "../navigation/popstate.ts"
import { createPrefetcher, observeViewport, type PrefetchEnv, type Prefetcher } from "../navigation/prefetch.ts"
import { loadDocument } from "../navigation/reload.ts"
import { browserScroll, type ScrollStore } from "../navigation/scroll.ts"
import { hydrateCache } from "./initial.ts"
import { callServerFn, type CallDeps } from "../server-fn/call.ts"
import { streamServerFn } from "../server-fn/stream.ts"
import { tabbedFetch, type DevHot } from "../dev/tab.ts"
import { registeredQuery } from "../../shared/protocol/index.ts"
import { createRouterStore, snapshotFromState, type RouterStore } from "../router/store.ts"
import { guardHead } from "./head-guard.ts"
import { mountApp, readState, type App, type ClientState, type Mount } from "./hydrate.ts"
import { afterLoad, createReady, loadedIdle, type IdleEnv, type ReadyApi } from "./ready.ts"

// The browser surface the client uses, passed in so a test can observe it.
export type ClientEnv = {
	mount: Mount
	fetch: NavigatorDeps["fetch"]
	assign: (href: string) => void
	dev: boolean
	send?: ((payload: DevErrorPayload) => void) | undefined
	// Vite's hot channel in dev. Production has none.
	hot?: DevHot | undefined
	idle: IdleEnv
	network: object
	observe: PrefetchEnv["observe"]
}

type Ready = ReturnType<typeof createReady>

type Navigator = ReturnType<typeof createNavigator>

type Parts = { history: FlareHistory; scroll: ScrollStore; store: RouterStore; blockers: Blockers }

// Hydrate starts on the next microtask, after the app chained its callbacks (dx/client.md).
export function createClient(router: Router): ReadyApi {
	const ready = createReady()
	queueMicrotask(() => {
		ready.close()
		void bootClient(router, ready, browserEnv())
	})
	return ready.api
}

// The dev overlay payload goes over the client hot channel. The dev handler relays it (B93). Production has no
// hot channel and sends nothing.
export function devSend(hot: { send: (event: string, payload: unknown) => void } | undefined): ClientEnv["send"] {
	if (!import.meta.env?.DEV || hot === undefined) return undefined
	return (payload) => hot.send("flare:error", payload)
}

// Resolves to a dispose that removes the listeners and unmounts the app.
export async function bootClient(router: Router, ready: Ready, given: ClientEnv): Promise<() => void> {
	const env = devTabbed(given)
	const report = callbackReporter(env, ready)
	const state = readState()
	const location = windowLocation()
	const match = router.match(location.pathname)
	const chain = await loadChain(match.chain)
	const { matches, pending } = holesOf(state)
	const phase = { hydrating: false }
	const store = createRouterStore(
		snapshotFromState({ matches, chain, unknown: match.id === undefined, location }),
		reporter(env, phase),
	)
	const history = createHistory(window.history)
	history.adopt(here())
	const navigation = createNavigationState()
	const blockers = createBlockers()
	const scroll = browserScroll(router)
	// One id for the navigator, the prefetcher, and the server function transport, so none disagrees on a mismatch (B30).
	const build = state.build ?? ""
	const prefetcher = browserPrefetcher(router, store, { env, build })
	const { cache, initial } = hydrateCache(router, { match, location, snapshot: store.snapshot(), at: state.at, report })
	const navigator = createNavigator({
		router,
		store,
		history,
		scroll,
		blockers,
		navigation,
		cache,
		fetch: env.fetch,
		origin: window.location.origin,
		assign: env.assign,
		reload: browserReload(env),
		build,
		dev: env.dev,
		send: env.send,
		prefetched: prefetcher.prefetched,
	})
	const invalidate = installCall(router, { fetch: env.fetch, build, cache, prefetcher }, navigator)
	ready.ready({ navigate: navigator.navigate, location })
	const unmount = hydrateGuarded(state.head, phase, {
		router,
		store,
		navigation,
		blockers,
		prefetcher,
		navigate: navigator.navigate,
		mount: env.mount,
	})
	// After the mount, so a Link's own click handler runs first and the delegate sees it handled.
	const unlisten = listen(router, navigator, { history, scroll, store, blockers })
	setActiveClient({ navigate: navigator.navigate, invalidate })
	markHydrated(ready)
	if (state.fill === true) void navigator.fill(pending)
	else if (initial.fetch) void navigator.refresh(initial)
	ready.idle(env.idle, () => afterLoad(env.idle, prefetcher.all))
	ready.interaction(document)
	return disposer(unlisten, unmount)
}

// Head nodes the server did not write stay out of the hydrate and return in the same task, and a boundary error
// while it runs is logged (B120).
function hydrateGuarded(head: ClientState["head"], phase: { hydrating: boolean }, app: App): () => void {
	const restoreHead = guardHead(document.head, head)
	phase.hydrating = true
	try {
		return mountApp(app)
	} finally {
		phase.hydrating = false
		restoreHead()
	}
}

// Disposing the client also clears the active navigation, so the root `navigate` no longer reaches a client that is
// gone (BUGS.md 105).
function disposer(...stops: (() => void)[]): () => void {
	return () => {
		setActiveClient(undefined)
		for (const stop of stops) stop()
	}
}

// Every request the client makes, data, fill, prefetch, and server function, names its dev tab (B42).
function devTabbed(env: ClientEnv): ClientEnv {
	return import.meta.env?.DEV ? { ...env, fetch: tabbedFetch(env.fetch, env.hot, document) } : env
}

// A boundary error the app's own <Errored> did not catch is a bug the dev overlay shows (B80). One caught while the
// document hydrates is a render that threw only in the browser: the server's markup for it stays on screen and inert,
// so it is logged in production too, never silent (B120).
function reporter(env: ClientEnv, phase: { hydrating: boolean }): (error: unknown) => void {
	return (error) => {
		if (phase.hydrating) console.error("[flare] a route failed to hydrate", error)
		if (import.meta.env?.DEV && env.dev) env.send?.(devErrorPayload(error))
	}
}

// An app callback that throws, a createClient callback or a page's shouldRefetch, is the app's bug: logged, and in dev
// the overlay shows it; the boot goes on, so the page still hydrates and fills (plan 21 9.3). `ready` reports to it.
function callbackReporter(env: ClientEnv, ready: Ready): (error: unknown) => void {
	const report = (error: unknown): void => {
		console.error("[flare] an app callback threw", error)
		if (import.meta.env?.DEV && env.dev) env.send?.(devErrorPayload(error))
	}
	ready.reportTo(report)
	return report
}

// The guarded document load a chunk error and a server function's build mismatch share (flare_chunk_reload).
function browserReload(env: ClientEnv): (href: string) => boolean {
	return (href) => loadDocument(href, { storage: () => window.sessionStorage, now: Date.now, assign: env.assign })
}

// The booted transport the client entry's createServerFn reads at call time (bits/07). It goes onto the state
// object the document wrote, which keeps its other fields. A stream iterates, and any other function resolves. A
// response from another build reloads the page under the chunk guard. Its document loads go through the navigator,
// so a navigation after them knows the page is leaving (BUGS.md 129). Its redirect follows a mutation, so the
// target loads fresh (plan 21 8.6).
function installCall(
	router: Router,
	env: Pick<ClientEnv, "fetch"> & Pick<CallDeps, "build"> & Omit<Parameters<typeof invalidation>[0], "revalidate">,
	nav: Pick<Navigator, "visit" | "reload" | "assign" | "revalidate">,
): () => Promise<void> {
	const flare: object = Object(Reflect.get(globalThis, "flare"))
	const { forget, invalidate } = invalidation({ ...env, revalidate: nav.revalidate })
	const deps: CallDeps = {
		fetch: env.fetch,
		origin: window.location.origin,
		basePath: router.basePath,
		build: env.build,
		href: () => window.location.href,
		reload: nav.reload,
		go: (url, replace) => nav.visit(url, replace, true),
		assign: nav.assign,
		forget,
	}
	const call: ServerFnCall = (fn, input) =>
		fn.record.kind === "stream" ? streamServerFn(fn, input, deps) : callServerFn(fn, input, deps)
	Reflect.set(globalThis, "flare", Object.assign(flare, { call }))
	return invalidate
}

// Popstate, anchor clicks, and a back-forward cache restore reach the navigator from here. Leaving the document, by
// reload, tab close, or a document load, asks the last blocker first (B84, plan 21 3.5).
function listen(router: Router, navigator: Navigator, parts: Parts): () => void {
	const pop = createPopstate({
		history: parts.history,
		restore: navigator.restore,
		save: (index) => parts.scroll.save(index, parts.store.snapshot().location),
		current: here,
	})
	const onPop = (event: PopStateEvent): void => void pop(event.state)
	const onShow = (event: PageTransitionEvent): void => navigator.pageshow(event.persisted)
	const onLeave = (event: Event): void =>
		parts.blockers.beforeUnload(event, { ...parts.store.snapshot().location, params: {} })
	window.addEventListener("popstate", onPop)
	window.addEventListener("pageshow", onShow)
	window.addEventListener("beforeunload", onLeave)
	const undelegate = delegateClicks(document, {
		router,
		origin: window.location.origin,
		visit: (url) => void navigator.visit(url, false),
	})
	return () => {
		window.removeEventListener("popstate", onPop)
		window.removeEventListener("pageshow", onShow)
		window.removeEventListener("beforeunload", onLeave)
		undelegate()
	}
}

function browserEnv(): ClientEnv {
	return {
		mount: hydrate,
		fetch: globalThis.fetch.bind(globalThis),
		assign: window.location.assign.bind(window.location),
		dev: import.meta.env?.DEV === true,
		send: devSend(import.meta.hot),
		hot: import.meta.hot,
		idle: {
			requestIdle: globalThis.requestIdleCallback?.bind(globalThis),
			setTimeout: globalThis.setTimeout.bind(globalThis),
		},
		network: globalThis.navigator,
		observe: observeViewport,
	}
}

// The prefetcher over the window. A link resolves against the page on screen.
function browserPrefetcher(
	router: Router,
	store: RouterStore,
	{ env, build }: { env: ClientEnv; build: string },
): Prefetcher {
	return createPrefetcher({
		router,
		origin: window.location.origin,
		current: () => store.snapshot().location,
		fetch: env.fetch,
		build,
		land: { dev: env.dev, send: env.send },
		env: { network: env.network, observe: env.observe, idle: loadedIdle(env.idle), head: document.head, now: Date.now },
	})
}

function windowLocation(): Location {
	return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }
}

function here(): string {
	return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

// A stored document's holes are live values the fill settles after hydrate (dx/defer.md).
function holesOf(state: ClientState): { matches: ClientState["matches"]; pending: Pending } {
	const pending: Pending = new Map()
	if (state.fill !== true) return { matches: state.matches, pending }
	const matches = state.matches.map((match) => ({ ...match, data: revive(match.data, match.id, pending) }))
	return { matches, pending }
}

// The hydration mount is over: the document says so, the app's hydrated callbacks run, and a query the document filled
// is TanStack's again from here (B102).
function markHydrated(ready: Ready): void {
	document.documentElement.setAttribute("data-flare-hydrated", "")
	ready.hydrated()
	registeredQuery()?.hydrated?.()
}
