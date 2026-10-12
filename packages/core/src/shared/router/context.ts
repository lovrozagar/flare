import { createContext, useContext, type Context } from "solid-js";
import type { RoutePrefetch } from "../route-builder/index.ts";
import type { Location, SearchValue } from "../url/index.ts";
import type { Router } from "./create-router.ts";

export const RouterContext: Context<Router> = createContext<Router>();

// The location on screen: the request's on the server, the store's in the browser.
export const LocationContext: Context<() => Location> = createContext<() => Location>();

// What `Link` asks of the client navigator (dx/navigate.md).
export type NavigateTo = {
	to: string;
	params?: Record<string, string | readonly string[] | undefined>;
	search?: Record<string, SearchValue>;
	hash?: string;
	replace?: boolean;
	revalidate?: boolean;
	scroll?: boolean;
	shallow?: boolean;
	state?: unknown;
};

// The browser provides both. The server has no navigator and no prefetch, so they default to null.
export const NavigateContext: Context<((options: NavigateTo) => Promise<void>) | null> = createContext<
	((options: NavigateTo) => Promise<void>) | null
>(null);

export type LinkPrefetch = { watch: (element: HTMLElement, href: string, input?: RoutePrefetch) => () => void };

export const PrefetchContext: Context<LinkPrefetch | null> = createContext<LinkPrefetch | null>(null);

export function useRouter(): Router {
	try {
		return useContext(RouterContext);
	} catch (caught) {
		throw new Error("useRouter outside provider", { cause: caught });
	}
}
