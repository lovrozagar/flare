import { createComponent, flush } from "solid-js";
import { render } from "@solidjs/web";
import { vi } from "vitest";
import { Matches, OverlayContext } from "../../shared/components/index.ts";
import type { Router } from "../../shared/router/create-router.ts";
import { loadChain } from "../../shared/router/load-chain.ts";
import { createHistory } from "../history/index.ts";
import { createMatchCache } from "../router/match-cache.ts";
import { createRouterStore, snapshotFromState, type RouterStore, type ScriptMatch } from "../router/store.ts";
import { createBlockers } from "./blocker.ts";
import { createNavigator, type NavigatorDeps } from "./navigate.ts";
import { createNavigationState } from "./pending.ts";
import { createScroll } from "./scroll.ts";

// The navigation tests share one mounted app: the home page at "/" with `start` as its data, rendered through
// Matches, and a navigator over the window history.

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

type MountOptions = { extra?: Partial<NavigatorDeps>; onBoundaryError?: (error: unknown) => void };

export type Mounted = {
	deps: NavigatorDeps;
	navigator: ReturnType<typeof createNavigator>;
	host: HTMLElement;
	text: () => string;
	store: RouterStore;
};

const unmounts: (() => void)[] = [];

export function unmountAll(): void {
	for (const unmount of unmounts.splice(0)) unmount();
}

export async function settled(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	flush();
}

function entry(id: string, data: unknown): ScriptMatch {
	return { id, params: {}, search: {}, data, preloader: {}, head: null, error: null };
}

export async function mountNavigator(router: Router, fetch: Fetch, options: MountOptions = {}): Promise<Mounted> {
	const chain = await loadChain(router.match("/").chain);
	const location = { pathname: "/", search: "", hash: "" };
	const store = createRouterStore(
		snapshotFromState({ matches: [entry("_root_", null), entry("_root_/", "start")], chain, unknown: false, location }),
		options.onBoundaryError ?? (() => undefined),
	);
	const host = document.createElement("div");
	unmounts.push(
		render(
			() =>
				createComponent(OverlayContext, {
					value: () => store.snapshot().overlay,
					get children() {
						return createComponent(Matches, { state: store.outlet });
					},
				}),
			host,
		),
	);
	flush();
	const flareHistory = createHistory(history);
	flareHistory.adopt();
	const deps: NavigatorDeps = {
		router,
		store,
		history: flareHistory,
		scroll: createScroll(
			{ enabled: true, behavior: "instant", maxEntries: 50 },
			{
				history: { scrollRestoration: "auto" },
				storage: sessionStorage,
				position: () => ({ x: 0, y: 0 }),
				scrollTo: () => undefined,
				element: () => null,
			},
		),
		blockers: createBlockers(),
		navigation: createNavigationState(),
		cache: createMatchCache({ staleTime: 0, gcTime: 60_000 }),
		fetch: vi.fn<Fetch>(fetch),
		origin: globalThis.location.origin,
		assign: vi.fn<(href: string) => void>(),
		reload: vi.fn<(href: string) => boolean>(() => true),
		build: "b1",
		dev: false,
		...options.extra,
	};
	const navigator = createNavigator(deps);
	const text = (): string => host.textContent ?? "";
	return { deps, navigator, host, text, store };
}
