/// <reference types="vite/client" />
import { hydrate } from "@solidjs/web";
import { delegateClicks } from "../../shared/components/index.ts";
import { devErrorPayload, type DevErrorPayload } from "../../shared/errors/index.ts";
import { loadChain, type Router } from "../../shared/router/create-router.ts";
import type { ServerFnCall } from "../../shared/server-fn/builder.ts";
import type { Location } from "../../shared/url/index.ts";
import { createHistory, type FlareHistory } from "../history/index.ts";
import { createBlockers } from "../navigation/blocker.ts";
import { revive, type Pending } from "../navigation/frames.ts";
import { createNavigator, type NavigatorDeps } from "../navigation/navigate.ts";
import { createNavigationState } from "../navigation/pending.ts";
import { createPopstate } from "../navigation/popstate.ts";
import { createPrefetcher, observeViewport, type PrefetchEnv, type Prefetcher } from "../navigation/prefetch.ts";
import { loadDocument } from "../navigation/reload.ts";
import { createScroll, type ScrollStore } from "../navigation/scroll.ts";
import { cacheFor } from "../router/match-cache.ts";
import { callServerFn, type CallDeps } from "../server-fn/call.ts";
import { streamServerFn } from "../server-fn/stream.ts";
import { createRouterStore, snapshotFromState, type RouterStore } from "../router/store.ts";
import { mountApp, readState, type ClientState, type Mount } from "./hydrate.ts";
import { afterLoad, createReady, loadedIdle, type IdleEnv, type ReadyApi } from "./ready.ts";

// The browser surface the client uses, passed in so a test can observe it.
export type ClientEnv = {
	mount: Mount;
	fetch: NavigatorDeps["fetch"];
	assign: (href: string) => void;
	dev: boolean;
	send?: ((payload: DevErrorPayload) => void) | undefined;
	idle: IdleEnv;
	network: object;
	observe: PrefetchEnv["observe"];
};

type Ready = ReturnType<typeof createReady>;

type Navigator = ReturnType<typeof createNavigator>;

type Parts = { history: FlareHistory; scroll: ScrollStore; store: RouterStore };

// Hydrate starts on the next microtask, after the app chained its callbacks (dx/client.md).
export function createClient(router: Router): ReadyApi {
	const ready = createReady();
	queueMicrotask(() => {
		ready.close();
		void bootClient(router, ready, browserEnv());
	});
	return ready.api;
}

// The dev overlay payload goes over the client hot channel. The dev handler relays it (B93). Production has no
// hot channel and sends nothing.
export function devSend(hot: { send: (event: string, payload: unknown) => void } | undefined): ClientEnv["send"] {
	return hot === undefined ? undefined : (payload) => hot.send("flare:error", payload);
}

// Resolves to a dispose that removes the listeners and unmounts the app.
export async function bootClient(router: Router, ready: Ready, env: ClientEnv): Promise<() => void> {
	const state = readState();
	const location = windowLocation();
	const match = router.match(location.pathname);
	const chain = await loadChain(match.chain);
	const report = (error: unknown): void => void (env.dev && env.send?.(devErrorPayload(error)));
	const { matches, pending } = holesOf(state);
	const store = createRouterStore(
		snapshotFromState({ matches, chain, unknown: match.id === undefined, location }),
		report,
	);
	const history = createHistory(window.history);
	history.adopt(here());
	const navigation = createNavigationState();
	const blockers = createBlockers();
	const scroll = browserScroll(router);
	const reload = browserReload(env);
	// One id for the navigator, the prefetcher, and the server function transport, so none disagrees on a mismatch (B30).
	const build = state.build ?? "";
	const prefetcher = browserPrefetcher(router, store, { env, build });
	const navigator = createNavigator({
		router,
		store,
		history,
		scroll,
		blockers,
		navigation,
		cache: cacheFor(router.cache.client, router.routeCacheMaxEntries),
		fetch: env.fetch,
		origin: window.location.origin,
		assign: env.assign,
		reload,
		build,
		dev: env.dev,
		send: env.send,
		prefetched: prefetcher.prefetched,
	});
	installCall(router, env, { reload, build, visit: navigator.visit });
	ready.ready({ navigate: navigator.navigate, location });
	const unmount = mountApp({
		router,
		store,
		navigation,
		blockers,
		prefetcher,
		navigate: navigator.navigate,
		mount: env.mount,
	});
	// After the mount, so a Link's own click handler runs first and the delegate sees it handled.
	const unlisten = listen(router, navigator, { history, scroll, store });
	document.documentElement.setAttribute("data-flare-hydrated", "");
	ready.hydrated();
	if (state.fill === true) void navigator.fill(pending);
	ready.idle(env.idle, () => afterLoad(env.idle, prefetcher.all));
	ready.interaction(document);
	return () => {
		unlisten();
		unmount();
	};
}

// The guarded document load a chunk error and a server function's build mismatch share (flare_chunk_reload).
function browserReload(env: ClientEnv): (href: string) => boolean {
	return (href) => loadDocument(href, { storage: () => window.sessionStorage, now: Date.now, assign: env.assign });
}

// The booted transport the client entry's createServerFn reads at call time (bits/07). It goes onto the state
// object the document wrote, which keeps its other fields. A stream iterates, and any other function resolves. A
// response from another build reloads the page under the chunk guard.
function installCall(
	router: Router,
	env: ClientEnv,
	nav: Pick<CallDeps, "reload" | "build"> & Pick<Navigator, "visit">,
): void {
	const flare: object = Object(Reflect.get(globalThis, "flare"));
	const deps: CallDeps = {
		fetch: env.fetch,
		origin: window.location.origin,
		basePath: router.basePath,
		build: nav.build,
		href: () => window.location.href,
		reload: nav.reload,
		go: (url, replace) => nav.visit(url, replace),
		assign: env.assign,
	};
	const call: ServerFnCall = (fn, input) =>
		fn.record.kind === "stream" ? streamServerFn(fn, input, deps) : callServerFn(fn, input, deps);
	Reflect.set(globalThis, "flare", Object.assign(flare, { call }));
}

// Popstate and anchor clicks reach the navigator from here.
function listen(router: Router, navigator: Navigator, parts: Parts): () => void {
	const pop = createPopstate({
		history: parts.history,
		restore: navigator.restore,
		save: (index) => parts.scroll.save(index, parts.store.snapshot().location),
		current: here,
	});
	const onPop = (event: PopStateEvent): void => void pop(event.state);
	window.addEventListener("popstate", onPop);
	const undelegate = delegateClicks(document, {
		router,
		origin: window.location.origin,
		visit: (url) => void navigator.visit(url, false),
	});
	return () => {
		window.removeEventListener("popstate", onPop);
		undelegate();
	};
}

function browserEnv(): ClientEnv {
	return {
		mount: hydrate,
		fetch: globalThis.fetch.bind(globalThis),
		assign: window.location.assign.bind(window.location),
		dev: import.meta.env?.DEV === true,
		send: devSend(import.meta.hot),
		idle: {
			requestIdle: globalThis.requestIdleCallback?.bind(globalThis),
			setTimeout: globalThis.setTimeout.bind(globalThis),
		},
		network: globalThis.navigator,
		observe: observeViewport,
	};
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
	});
}

function windowLocation(): Location {
	return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash };
}

function here(): string {
	return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

// The router's scroll options over the window. A document load sets the mode and reads no saved position.
function browserScroll(router: Router): ScrollStore {
	const scroll = createScroll(
		{
			enabled: router.scrollRestoration,
			behavior: router.scrollRestorationBehavior,
			maxEntries: router.scrollRestorationMaxEntries,
		},
		{
			history: window.history,
			storage: window.sessionStorage,
			position: () => ({ x: window.scrollX, y: window.scrollY }),
			scrollTo: (spot) => window.scrollTo(spot),
			element: (id) => document.getElementById(id),
		},
	);
	scroll.setup();
	return scroll;
}

// A stored document's holes are live values the fill settles after hydrate (dx/defer.md).
function holesOf(state: ClientState): { matches: ClientState["matches"]; pending: Pending } {
	const pending: Pending = new Map();
	if (state.fill !== true) return { matches: state.matches, pending };
	const matches = state.matches.map((match) => ({ ...match, data: revive(match.data, match.id, pending) }));
	return { matches, pending };
}
