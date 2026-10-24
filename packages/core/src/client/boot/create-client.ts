/// <reference types="vite/client" />
import { setActiveClient } from "../navigation/active.ts"
import { hydrate } from "@solidjs/web"
import { delegateClicks } from "../../shared/components/index.ts"
import { devErrorPayload, type DevErrorPayload } from "../../shared/errors/index.ts"
import { checkRouter, type Router } from "../../shared/router/create-router.ts"
import { loadChain } from "../../shared/router/load-chain.ts"
import type { Location } from "../../shared/url/index.ts"
import { createHistory, type FlareHistory } from "../history/index.ts"
import { createBlockers, placeIn, type Blockers } from "../navigation/blocker.ts"
import { holesOf } from "./document-values.ts"
import { createNavigator, type NavigatorDeps } from "../navigation/navigate.ts"
import { createArrival } from "../navigation/arrival.ts"
import { createNavigationState } from "../navigation/pending.ts"
import { createPopstate } from "../navigation/popstate.ts"
import { observeViewport, type PrefetchEnv } from "../navigation/prefetch.ts"
import { browserPrefetcher } from "./browser-prefetcher.ts"
import { chainChunks, chunksGone, isChunkError, loadDocument } from "../navigation/reload.ts"
import { browserScroll, lastFrame, type ScrollStore } from "../navigation/scroll.ts"
import { hydrateCache } from "./initial.ts"
import { tabbedFetch, type DevHot } from "../dev/tab.ts"
import { BOOT_FAILED, registeredQuery } from "../../shared/protocol/index.ts"
import { createRouterStore, snapshotFromState, type RouterStore } from "../router/store.ts"
import { guardHead } from "./head-guard.ts"
import { mountApp, readState, renderedLocation, type App, type ClientState, type Mount } from "./hydrate.ts"
import { installCall } from "./install-call.ts"
import { countedFetch, userWork, type UserWork } from "../navigation/user-work.ts"
import { afterLoad, createReady, type IdleEnv, type ReadyApi } from "./ready.ts"

// The browser surface the client uses, passed in so a test can observe it.
export type ClientEnv = {
	mount: Mount
	fetch: NavigatorDeps["fetch"]
	assign: (href: string) => void
	dev: boolean
	send?: ((payload: DevErrorPayload) => void) | undefined
	// Vite's hot channel in dev. Production has none.
	hot?: DevHot | undefined
	// Where the page's `beforeunload` fires: the window. While the boot's import is pending it marks the page as leaving
	// (BUGS.md 352).
	unload: Pick<EventTarget, "addEventListener" | "removeEventListener">
	idle: IdleEnv
	network: object
	observe: PrefetchEnv["observe"]
}

type Ready = ReturnType<typeof createReady>

type Navigator = ReturnType<typeof createNavigator>

type Parts = { history: FlareHistory; scroll: ScrollStore; store: RouterStore; blockers: Blockers }

// Hydrate starts on the next microtask, after the app chained its callbacks (dx/client.md).
export function createClient(router: Router): ReadyApi {
	checkRouter("createClient", router)
	const ready = createReady()
	queueMicrotask(() => {
		ready.close()
		void bootSafely(router, ready, browserEnv())
	})
	return ready.api
}

// A boot that fails is never an unhandled rejection (BUGS.md 352). A failure after the page's own `beforeunload`
// is an import its navigation cut short, no failure: the next document boots, and nothing is stored. The listener
// lives only while the boot is pending, and the boot's one wait is its route modules' import, so a `beforeunload`
// with no navigation after it can skip one boot at most. A module that would not load is one guarded document load of
// the page, as a navigation's chunk is; any other failure, or a load the guard holds back, is logged, and in dev the
// overlay shows it. The app's callbacks never hear that the client is ready.
export async function bootSafely(router: Router, ready: Ready, env: ClientEnv): Promise<(() => void) | undefined> {
	const page = { leaving: false }
	const leave = (): void => void (page.leaving = true)
	env.unload.addEventListener("beforeunload", leave)
	try {
		return await bootClient(router, ready, env)
	} catch (error) {
		if (page.leaving) return undefined
		if (isChunkError(error)) {
			// The server judges a chunk failure: chunk files still there mean a load cut short (BUGS.md 368).
			if (!(await chunksGone(chainChunks(router, window.location.pathname), env.fetch))) return undefined
			if (browserReload(env)(window.location.href)) return undefined
		}
		console.error(BOOT_FAILED, error)
		if (import.meta.env?.DEV && env.dev) env.send?.(devErrorPayload(error))
		return undefined
	} finally {
		env.unload.removeEventListener("beforeunload", leave)
	}
}

// The dev overlay payload goes over the client hot channel. The dev handler relays it (B93). Production has no
// hot channel and sends nothing.
export function devSend(hot: { send: (event: string, payload: unknown) => void } | undefined): ClientEnv["send"] {
	if (!import.meta.env?.DEV || hot === undefined) return undefined
	return (payload) => hot.send("flare:error", payload)
}

// Resolves to a dispose that removes the listeners and unmounts the app.
export async function bootClient(router: Router, ready: Ready, given: ClientEnv): Promise<() => void> {
	const { env, work } = countedEnv(given)
	const report = callbackReporter(env, ready)
	const state = readState()
	const location = windowLocation()
	const match = router.match(location.pathname)
	const chain = await loadChain(match.chain)
	const { matches, pending } = holesOf(state.matches)
	const phase = { hydrating: false }
	const store = createRouterStore(
		snapshotFromState({ matches, chain, unknown: match.id === undefined, location }),
		reporter(env, phase),
	)
	const history = createHistory(window.history)
	history.adopt(here())
	const [navigation, blockers, scroll] = [createNavigationState(), createBlockers(), browserScroll(router)]
	// One id for the navigator, the prefetcher, and the server function transport, so none disagrees on a mismatch (B30).
	const build = state.build ?? ""
	const prefetcher = browserPrefetcher(router, store, { env, build, work })
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
		arrived: createArrival(document),
	})
	const invalidate = installCall(router, { fetch: env.fetch, build, cache, prefetcher }, navigator)
	ready.ready({ navigate: navigator.navigate, location })
	const unmount = hydrateGuarded(state, phase, {
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
function hydrateGuarded(state: ClientState, phase: { hydrating: boolean }, app: App): () => void {
	const restoreHead = guardHead(document.head, state.head)
	phase.hydrating = true
	try {
		return mountApp({ ...app, rendered: renderedLocation(state, app.store.snapshot().location) })
	} finally {
		phase.hydrating = false
		restoreHead()
	}
}

// Disposing the client also clears the active navigation, so the root `navigate` no longer reaches it (BUGS.md 105).
function disposer(...stops: (() => void)[]): () => void {
	return () => {
		setActiveClient(undefined)
		for (const stop of stops) stop()
	}
}

// The client's env with its fetch counted as the user's work until each answer's head arrives; a link's own prefetch
// counts too (prefetch.ts). The idle warm-up of every route module yields to both (BUGS.md 520).
function countedEnv(given: ClientEnv): { env: ClientEnv; work: UserWork } {
	const work = userWork(Date.now)
	const tabbed = devTabbed(given)
	return { env: { ...tabbed, fetch: countedFetch(tabbed.fetch, work) }, work }
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

// Popstate, anchor clicks, and a back-forward cache restore reach the navigator from here. Leaving the document, by
// reload, tab close, or a document load, asks the last blocker first (B84, plan 21 3.5).
function listen(router: Router, navigator: Navigator, parts: Parts): () => void {
	const frame = lastFrame()
	const pop = createPopstate({
		history: parts.history,
		restore: navigator.restore,
		save: (index, moved) => parts.scroll.save(index, parts.store.snapshot().location, moved ? frame.at() : undefined),
		current: here,
	})
	const onPop = (event: PopStateEvent): void => void pop(event.state)
	const onShow = (event: PageTransitionEvent): void => navigator.pageshow(event.persisted)
	const onLeave = (event: Event): void =>
		parts.blockers.beforeUnload(event, placeIn(router, parts.store.snapshot().location))
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
		frame.stop()
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
		unload: window,
		idle: {
			requestIdle: globalThis.requestIdleCallback?.bind(globalThis),
			setTimeout: globalThis.setTimeout.bind(globalThis),
		},
		network: globalThis.navigator,
		observe: observeViewport,
	}
}

function windowLocation(): Location {
	return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }
}

function here(): string {
	return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

// The hydration mount is over: the document says so, the app's hydrated callbacks run, and a query the document filled
// is TanStack's again from here (B102).
function markHydrated(ready: Ready): void {
	document.documentElement.setAttribute("data-flare-hydrated", "")
	ready.hydrated()
	registeredQuery()?.hydrated?.()
}
