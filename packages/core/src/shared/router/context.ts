import { createContext, useContext, type Context } from "solid-js";
import type { RoutePrefetch } from "../route-builder/index.ts";
import type { Location, SearchValue } from "../url/index.ts";
import type { Router, ViewTransitionOptions } from "./create-router.ts";

export const RouterContext: Context<Router> = createContext<Router>();

// The location on screen: the request's on the server, the store's in the browser.
export const LocationContext: Context<() => Location> = createContext<() => Location>();

// What `Link` asks of the client navigator (dx/navigate.md).
export type NavigateTo = {
	to: string;
	params?: Record<string, string | readonly string[] | undefined> | undefined;
	search?: Record<string, SearchValue> | undefined;
	hash?: string | undefined;
	replace?: boolean | undefined;
	revalidate?: boolean | undefined;
	scroll?: boolean | undefined;
	shallow?: boolean | undefined;
	state?: unknown | undefined;
	viewTransition?: boolean | ViewTransitionOptions | undefined;
};

// The browser provides both. The server has no navigator and no prefetch, so they default to null.
export const NavigateContext: Context<((options: NavigateTo) => Promise<void>) | null> = createContext<
	((options: NavigateTo) => Promise<void>) | null
>(null);

export type LinkPrefetch = { watch: (element: HTMLElement, href: string, input?: RoutePrefetch) => () => void };

export const PrefetchContext: Context<LinkPrefetch | null> = createContext<LinkPrefetch | null>(null);

// One per client. `track` wraps a navigation's fetch: pending stays true while any tracked fetch is in flight.
// A prefetch is never tracked (dx/navigate.md). A server render is never pending.
export type NavigationState = {
	pending: () => boolean;
	track: <T>(work: Promise<T>) => Promise<T>;
};

// The server's values: never pending, and no blocker is asked. They are also the defaults.
export const IDLE_NAVIGATION: NavigationState = { pending: () => false, track: (work) => work };

export const NavigationContext: Context<NavigationState> = createContext<NavigationState>(IDLE_NAVIGATION);

export type BlockerPlace = {
	hash: string;
	pathname: string;
	search: string;
	params: Record<string, string | string[]>;
};

export type BlockerArgs = {
	current: BlockerPlace;
	next: BlockerPlace;
	trigger: "initial" | "navigation" | "revalidation";
};

export type Blocker = (args: BlockerArgs) => boolean;

// `write` is the history write this attempt would make. `pushed` counts entries it already pushed.
export type BlockerSteps = { write: () => void; pushed: number; go: (delta: number) => void };

export type Blockers = {
	register: (blocker: Blocker) => () => void;
	run: (args: BlockerArgs & { popstate?: boolean }, steps: BlockerSteps) => boolean;
	beforeUnload: (event: Event, current: BlockerPlace) => void;
};

// A server render navigates nowhere, so a blocker it registers is never asked.
export const NO_BLOCKERS: Blockers = {
	register: () => () => undefined,
	run: () => true,
	beforeUnload: () => undefined,
};

export const BlockerContext: Context<Blockers> = createContext<Blockers>(NO_BLOCKERS);

export function useRouter(): Router {
	try {
		return useContext(RouterContext);
	} catch (caught) {
		throw new Error("useRouter outside provider", { cause: caught });
	}
}
