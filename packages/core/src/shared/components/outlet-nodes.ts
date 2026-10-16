import { createContext, untrack, useContext, type Context } from "solid-js"
import { matchId } from "../route-tree/index.ts"
import { LocationContext, NavigateContext, useRouter, type Navigate } from "../router/context.ts"
import type { Router } from "../router/create-router.ts"
import { readSearch, searchKey } from "../url/index.ts"
import type { FlareRegister, From, LoaderDataFrom, ParamsFrom, SearchFrom } from "../route-builder/register.ts"
import type { PreloaderFrom } from "../route-builder/route-types.ts"
import type { OutletMatch, OutletState } from "./outlet.tsx"

type Raw = Record<string, string | string[]>

// `Matches` provides the painted state, so a hook anywhere below reads any route on screen by id.
export const MatchesContext: Context<() => OutletState> = createContext<() => OutletState>()

export function chooseNodes(
	matched: ReadonlySet<string>,
	page: string,
	layouts: readonly string[],
): { page?: string | undefined; layouts: string[] } {
	return {
		page: matched.has(page) ? page : undefined,
		layouts: layouts.filter((id) => matched.has(id)),
	}
}

// Each hook reads by route id, so its type is that route's in the generated register (dx/types.md `hook from`). The
// state holds whatever the server sent, so the typed signature sits over an untyped one.

// That route's own loader data. A parent's is a second call with the parent's id (dx/navigate.md).
export function useLoaderData<Id extends From<FlareRegister>>(input: { from: Id }): LoaderDataFrom<FlareRegister, Id>
export function useLoaderData(input: { from: string }): unknown {
	const match = matchOf(input.from)
	return live(() => match().data)
}

// What `.input()` returned for params, or the raw record when that file has none (dx/navigate.md).
export function useParams<Id extends From<FlareRegister>>(input: { from: Id }): ParamsFrom<FlareRegister, Id>
export function useParams(input: { from: string }): unknown {
	const match = matchOf(input.from)
	return live(() => match().params)
}

// Without `.input({ searchParams })`, the raw record: one occurrence of a key is a string, two or more a `string[]`
// in appearance order.
export function useSearch<Id extends From<FlareRegister>>(input: { from: Id }): SearchFrom<FlareRegister, Id>
export function useSearch(input: { from: string }): unknown {
	const match = matchOf(input.from)
	return live(() => match().search)
}

// The context accumulated through that route. An empty chain is `{}`.
export function usePreloaderContext<Id extends From<FlareRegister>>(input: {
	from: Id
}): PreloaderFrom<FlareRegister, Id>
export function usePreloaderContext(input: { from: string }): Record<string, unknown> {
	const match = matchOf(input.from)
	return live(() => match().preloader ?? {})
}

// `id` is the match id, raw params plus raw search (B31). It has no typed params and no loader data.
export function useMatch(input: { from: From<FlareRegister> }): { readonly id: string; readonly routeId: string } {
	matchOf(input.from)
	const location = useContext(LocationContext)
	const router = useRouter()
	return {
		get id() {
			return matchId(rawParams(router, location().pathname), searchKey(location().search))
		},
		routeId: input.from,
	}
}

// The canonical location with the raw records. It takes no `from`.
export function useLocation(): {
	readonly pathname: string
	readonly search: Raw
	readonly hash: string
	readonly params: Raw
} {
	const location = useContext(LocationContext)
	const router = useRouter()
	return {
		get pathname() {
			return location().pathname
		},
		get search() {
			return readSearch(location().search)
		},
		get hash() {
			return location().hash
		},
		get params() {
			return rawParams(router, location().pathname)
		},
	}
}

// The path's params before any `.input()`. An absent optional param is left out.
export function rawParams(router: Router, pathname: string): Raw {
	const params = router.match(pathname).params
	return Object.fromEntries(
		Object.entries(params).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
	)
}

// The client navigator. A server render has none, and calling it there rejects.
export function useNavigate(): Navigate<FlareRegister> {
	return useContext(NavigateContext) ?? (() => Promise.reject(new Error("navigate runs in the browser")))
}

// The match must be on screen when the hook runs. Its value is read live afterwards. The check is a one-time read in
// the component body, so it is untracked on purpose (BUGS.md B4).
function matchOf(from: string): () => OutletMatch {
	const state = useContext(MatchesContext)
	const read = (): OutletMatch => {
		const found = state().matches.find((match) => match.id === from)
		if (found === undefined) throw new Error(`${from} is not a route on screen`)
		return found
	}
	untrack(read)
	return read
}

// An object is a view that reads the current value on every access, so a loader refresh reaches a component
// that stays mounted. A primitive is its value at the call, an untracked one-time read (B4).
function live<T>(read: () => T): T {
	const first = untrack(read)
	if (typeof first !== "object" || first === null) return first
	return new Proxy(first, {
		get: (_, key) => Reflect.get(Object(read()), key),
		has: (_, key) => Reflect.has(Object(read()), key),
		ownKeys: () => Reflect.ownKeys(Object(read())),
		getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(Object(read()), key),
	})
}
