/// <reference types="vite/client" />
import { hydrate } from "@solidjs/web";
import { devErrorPayload, type DevErrorPayload } from "../../shared/errors/index.ts";
import { loadChain, type Router } from "../../shared/router/create-router.ts";
import type { Location } from "../../shared/url/index.ts";
import { createHistory } from "../history/index.ts";
import { createBlockers } from "../navigation/blocker.ts";
import { createNavigator, type NavigatorDeps } from "../navigation/navigate.ts";
import { createNavigationState } from "../navigation/pending.ts";
import { createPopstate } from "../navigation/popstate.ts";
import { createPrefetcher, observeViewport, type PrefetchEnv, type Prefetcher } from "../navigation/prefetch.ts";
import { loadDocument } from "../navigation/reload.ts";
import { createScroll, type ScrollStore } from "../navigation/scroll.ts";
import { cacheFor } from "../router/match-cache.ts";
import { createRouterStore, snapshotFromState, type RouterStore } from "../router/store.ts";
import { mountApp, readState, type Mount } from "./hydrate.ts";
import { afterLoad, createReady, loadedIdle, type IdleEnv, type ReadyApi } from "./ready.ts";

// The browser surface the client uses, passed in so a test can observe it.
export type ClientEnv = {
	mount: Mount;
	fetch: NavigatorDeps["fetch"];
	assign: (href: string) => void;
	dev: boolean;
	send?: (payload: DevErrorPayload) => void;
	idle: IdleEnv;
	network: object;
	observe: PrefetchEnv["observe"];
};

type Ready = ReturnType<typeof createReady>;

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

export async function bootClient(router: Router, ready: Ready, env: ClientEnv): Promise<void> {
	const state = readState();
	const location: Location = {
		pathname: window.location.pathname,
		search: window.location.search,
		hash: window.location.hash,
	};
	const match = router.match(location.pathname);
	const chain = await loadChain(match.chain);
	const report = (error: unknown): void => void (env.dev && env.send?.(devErrorPayload(error)));
	const store = createRouterStore(
		snapshotFromState({ matches: state.matches, chain, unknown: match.id === undefined, location }),
		report,
	);
	const history = createHistory(window.history);
	history.adopt(here());
	const navigation = createNavigationState();
	const blockers = createBlockers();
	const scroll = browserScroll(router);
	const prefetcher = browserPrefetcher(router, store, env);
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
		reload: (href) => loadDocument(href, { storage: () => window.sessionStorage, now: Date.now, assign: env.assign }),
		build: "",
		dev: env.dev,
		send: env.send,
		prefetched: prefetcher.prefetched,
	});
	const pop = createPopstate({
		history,
		restore: navigator.restore,
		save: (index) => scroll.save(index, store.snapshot().location),
		current: here,
	});
	window.addEventListener("popstate", (event) => void pop(event.state));
	ready.ready({ navigate: navigator.navigate, location });
	mountApp({ router, store, navigation, blockers, prefetcher, mount: env.mount });
	document.documentElement.setAttribute("data-flare-hydrated", "");
	ready.hydrated();
	ready.idle(env.idle, () => afterLoad(env.idle, prefetcher.all));
	ready.interaction(document);
}

function browserEnv(): ClientEnv {
	return {
		mount: hydrate,
		fetch: globalThis.fetch.bind(globalThis),
		assign: window.location.assign.bind(window.location),
		dev: import.meta.env.DEV,
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
function browserPrefetcher(router: Router, store: RouterStore, env: ClientEnv): Prefetcher {
	return createPrefetcher({
		router,
		origin: window.location.origin,
		current: () => store.snapshot().location,
		fetch: env.fetch,
		build: "",
		land: { dev: env.dev, send: env.send },
		env: { network: env.network, observe: env.observe, idle: loadedIdle(env.idle), head: document.head, now: Date.now },
	});
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
