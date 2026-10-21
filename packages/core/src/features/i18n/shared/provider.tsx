import {
	createComponent,
	createContext,
	createEffect,
	createMemo,
	onSettled,
	untrack,
	useContext,
	type Accessor,
} from "solid-js"
import { isServer, type JSX } from "@solidjs/web"
import { post, subscribe } from "../../../client/sync/index.ts"
import { idPattern, patternSegments } from "../../../shared/route-tree/index.ts"
import { LocationContext, NavigateContext, useRouter, type NavigateTo } from "../../../shared/router/index.ts"
import { RAW_SEARCH } from "../../../shared/url/raw-search.ts"
import { LOCALE_COOKIE, localeCookie } from "./cookie.ts"

// The router's locale config, which the app also spreads into the server's i18n(). `cookieName` defaults to the
// server's name (dx/features.md i18n).
export type LocaleConfigInput = {
	readonly locales: readonly string[]
	readonly defaultLocale: string
	readonly paramName?: string | undefined
	readonly cookieName?: string | undefined
}

export type LocaleState = {
	locale: Accessor<string>
	locales: readonly string[]
	defaultLocale: string
	setLocale: (tag: string) => Promise<void>
}

// `config` is optional: the router's locale config is the source, and a given one must agree with it on every field
// it names. The server's `i18n()` object fits (BUGS.md 440).
export type LocaleProviderProps = {
	config?: Partial<LocaleConfigInput> | undefined
	initial?: string | undefined
	children: JSX.Element
}

const LocaleContext = createContext<LocaleState | null>(null)

// The subtree, and the locale its hooks and formatMessage read. `initial` is the route param, or omitted for the
// default. The provider does not read the URL, the cookie, or Accept-Language.
export function LocaleProvider(props: LocaleProviderProps): JSX.Element {
	const config = sourced(
		useRouter().locale,
		untrack(() => props.config),
	)
	// A tag outside `locales` throws here, in the render that received it, and again in the memo after a change.
	configured(config, untrack(() => props.initial) ?? config.defaultLocale)
	const locale = createMemo(() => configured(config, props.initial ?? config.defaultLocale))
	const navigation = {
		router: useRouter(),
		location: useContext(LocationContext),
		navigate: useContext(NavigateContext),
	}
	const go = (tag: string, replace: boolean): Promise<boolean | Unplaced> =>
		goTo({ ...navigation, config, tag, replace })
	createEffect(locale, (tag) => {
		document.documentElement.lang = tag
	})
	// Another tab's committed change. This tab follows with `replace` and posts nothing.
	onSettled(() =>
		subscribe((data) => {
			const tag = localeMessage(data, config)
			if (tag !== undefined && tag !== untrack(locale)) void go(tag, true)
		}),
	)
	const setLocale = async (tag: string): Promise<void> => {
		configured(config, tag)
		const moved = await go(tag, false)
		if (typeof moved === "object") throw new Error(`setLocale: ${moved.route} has no ${moved.param} param`)
		if (!moved) return
		document.cookie = localeCookie(config.cookieName ?? LOCALE_COOKIE, tag, location.protocol === "https:")
		post({ type: "locale", tag })
	}
	const state = { locale, locales: config.locales, defaultLocale: config.defaultLocale, setLocale }
	return createComponent(LocaleContext, {
		value: state,
		get children() {
			return props.children
		},
	})
}

export function useLocaleState(): LocaleState {
	return localeState("useLocale outside LocaleProvider")
}

// The provider's tag for formatMessage, read in a render. Outside the provider there is none.
export function providerTag(message: string): string {
	return localeState(message).locale()
}

function localeState(message: string): LocaleState {
	let state: LocaleState | null = null
	try {
		state = useContext(LocaleContext)
	} catch {
		// No owner: not in a render.
	}
	if (state === null) throw new Error(message)
	return state
}

function configured(config: LocaleConfigInput, tag: string): string {
	if (!config.locales.includes(tag)) throw new Error(`${tag} is not one of the configured locales`)
	return tag
}

type GoInput = {
	router: ReturnType<typeof useRouter>
	location: () => { pathname: string; search: string; hash: string }
	navigate: ((options: NavigateTo) => Promise<void>) | null
	config: LocaleConfigInput
	tag: string
	replace: boolean
}

// A route with no locale param, which has no place for a tag: setLocale rejects with it, and another tab's change is
// not followed there (BUGS.md 439).
type Unplaced = { route: string; param: string }

// Navigates to the tag on the current route, keeping search and hash. On an optional segment the default tag drops
// the segment. A required segment keeps it. Resolves whether the navigation committed.
async function goTo(input: GoInput): Promise<boolean | Unplaced> {
	if (isServer || input.navigate === null) throw new Error("setLocale runs in the browser")
	const current = input.location()
	const match = input.router.match(current.pathname)
	if (match.id === undefined) return false
	const name = input.config.paramName ?? "locale"
	const segment = patternSegments(idPattern(match.id)).find((item) => item.kind !== "static" && item.name === name)
	if (segment === undefined) return { route: match.id, param: name }
	const dropped = segment?.kind === "dynamic" && segment.optional && input.tag === input.config.defaultLocale
	const params = { ...match.params, [name]: dropped ? undefined : input.tag }
	// The query as written, order and every key, not the search object the URL writer would sort (BUGS.md 441).
	const target: NavigateTo = { to: match.id, params, hash: current.hash, replace: input.replace }
	await input.navigate(Object.assign(target, { [RAW_SEARCH]: current.search }))
	const landed = input.router.match(input.location().pathname)
	return landed.id === match.id && landed.params[name] === params[name]
}

// `{ type: "locale", tag }` with exactly those keys and a configured tag (dx/features.md Cross-tab).
function localeMessage(data: unknown, config: LocaleConfigInput): string | undefined {
	if (typeof data !== "object" || data === null) return undefined
	if (Object.keys(data).length !== 2 || !("type" in data) || data.type !== "locale" || !("tag" in data))
		return undefined
	return config.locales.find((tag) => tag === data.tag)
}

// The fields a given config may name, each compared with the router's.
const FIELDS = ["locales", "defaultLocale", "paramName", "cookieName"] as const

// The router's locale config, with a given one checked against it: a field it names that differs throws, naming the
// field and both values, since a silent mismatch is a setLocale that does nothing (BUGS.md 440). Under a router with
// no locale option, the given config is the whole config.
function sourced(
	router: LocaleConfigInput | undefined,
	given: Partial<LocaleConfigInput> | undefined,
): LocaleConfigInput {
	if (router === undefined) {
		if (given?.locales === undefined || given.defaultLocale === undefined) {
			throw new Error("LocaleProvider: the router has no locale option and no config names locales and defaultLocale")
		}
		return { ...given, locales: given.locales, defaultLocale: given.defaultLocale }
	}
	for (const field of FIELDS) {
		const value = given?.[field]
		if (value !== undefined && JSON.stringify(value) !== JSON.stringify(router[field])) {
			throw new Error(
				`LocaleProvider: config.${field} ${JSON.stringify(value)} is not the router's ${JSON.stringify(router[field])}`,
			)
		}
	}
	return router
}
