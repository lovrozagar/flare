import { createContext, useContext, type Context } from "solid-js";
import { matchId } from "../route-tree/index.ts";
import { LocationContext, NavigateContext, useRouter, type NavigateTo } from "../router/context.ts";
import type { Router } from "../router/create-router.ts";
import { readSearch } from "../url/index.ts";
import type { Located } from "../route-builder/index.ts";
import type { OutletMatch, OutletState } from "./outlet.tsx";

type Raw = Record<string, string | string[]>;

// What `.input()` returned for that side, or the raw record when that file has none (dx/navigate.md).
type Values = Located["params"];

// `Matches` provides the painted state, so a hook anywhere below reads any route on screen by id.
export const MatchesContext: Context<() => OutletState> = createContext<() => OutletState>();

export function chooseNodes(
	matched: ReadonlySet<string>,
	page: string,
	layouts: readonly string[],
): { page?: string; layouts: string[] } {
	return {
		page: matched.has(page) ? page : undefined,
		layouts: layouts.filter((id) => matched.has(id)),
	};
}

// That route's own loader data. A parent's is a second call with the parent's id (dx/navigate.md).
export function useLoaderData(input: { from: string }): unknown {
	const match = matchOf(input.from);
	return live(() => match().data);
}

export function useParams(input: { from: string }): Values {
	const match = matchOf(input.from);
	return live(() => match().params);
}

// Without `.input({ searchParams })`, the raw record: one occurrence of a key is a string, two or more a `string[]`
// in appearance order.
export function useSearch(input: { from: string }): Values {
	const match = matchOf(input.from);
	return live(() => match().search);
}

// The context accumulated through that route. An empty chain is `{}`.
export function usePreloaderContext(input: { from: string }): Record<string, unknown> {
	const match = matchOf(input.from);
	return live(() => match().preloader ?? {});
}

// `id` is the match id, raw params plus raw search (B31). It has no typed params and no loader data.
export function useMatch(input: { from: string }): { readonly id: string; readonly routeId: string } {
	matchOf(input.from);
	const location = useContext(LocationContext);
	const router = useRouter();
	return {
		get id() {
			return matchId(rawParams(router, location().pathname), location().search.slice(1));
		},
		routeId: input.from,
	};
}

// The canonical location with the raw records. It takes no `from`.
export function useLocation(): {
	readonly pathname: string;
	readonly search: Raw;
	readonly hash: string;
	readonly params: Raw;
} {
	const location = useContext(LocationContext);
	const router = useRouter();
	return {
		get pathname() {
			return location().pathname;
		},
		get search() {
			return readSearch(location().search);
		},
		get hash() {
			return location().hash;
		},
		get params() {
			return rawParams(router, location().pathname);
		},
	};
}

// The path's params before any `.input()`. An absent optional param is left out.
export function rawParams(router: Router, pathname: string): Raw {
	const params = router.match(pathname).params;
	return Object.fromEntries(
		Object.entries(params).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
	);
}

// The client navigator. A server render has none, and calling it there rejects.
export function useNavigate(): (options: NavigateTo) => Promise<void> {
	return useContext(NavigateContext) ?? (() => Promise.reject(new Error("navigate runs in the browser")));
}

// The match must be on screen when the hook runs. Its value is read live afterwards.
function matchOf(from: string): () => OutletMatch {
	const state = useContext(MatchesContext);
	const read = (): OutletMatch => {
		const found = state().matches.find((match) => match.id === from);
		if (found === undefined) throw new Error(`${from} is not a route on screen`);
		return found;
	};
	read();
	return read;
}

// An object is a view that reads the current value on every access, so a loader refresh reaches a component
// that stays mounted. A primitive is its value at the call.
function live<T>(read: () => T): T {
	const first = read();
	if (typeof first !== "object" || first === null) return first;
	return new Proxy(first, {
		get: (_, key) => Reflect.get(Object(read()), key),
		has: (_, key) => Reflect.has(Object(read()), key),
		ownKeys: () => Reflect.ownKeys(Object(read())),
		getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(Object(read()), key),
	});
}
