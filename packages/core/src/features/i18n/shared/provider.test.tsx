import { createComponent, createSignal, flush, untrack } from "solid-js"
import { render, type JSX } from "@solidjs/web"
import { afterEach, expect, it, vi } from "vitest"
import { LocationContext, NavigateContext, RouterContext, type NavigateTo } from "../../../shared/router/context.ts"
import { createRouter, type RouteNode, type Router } from "../../../shared/router/create-router.ts"
import { buildUrl, readSearch, type Location } from "../../../shared/url/index.ts"
import { RAW_SEARCH } from "../../../shared/url/raw-search.ts"
import { useLocale } from "./hooks.ts"
import { i18n } from "../server/middleware.ts"
import { LocaleProvider, type LocaleProviderProps, type LocaleState } from "./provider.tsx"
import { expectReported } from "../../../shared/dev/reported.fixture.ts"

// LocaleProvider on Solid's client build. The server rows are provider.ssr.test.ts.
const flags = vi.hoisted(() => ({ enabled: true }))

vi.mock("../../../client/sync/enabled.ts", () => ({
	get broadcastEnabled() {
		return flags.enabled
	},
}))

const config = { locales: ["en", "hr", "de"], defaultLocale: "en" }
const page = (id: string, path: string): RouteNode => ({ id, path, module: {} })
const router = createRouter({
	layouts: { _root_: {} },
	routeTree: [
		page("_root_/[[locale]]/pricing", "/[[locale]]/pricing"),
		page("_root_/[locale]/docs", "/[locale]/docs"),
		page("_root_/about", "/about"),
	],
})

afterEach(() => {
	flags.enabled = true
	for (const cookie of document.cookie.split("; ")) {
		const name = cookie.split("=")[0]
		if (name !== undefined && name !== "") document.cookie = `${name}=; Path=/; Max-Age=0`
	}
	document.documentElement.removeAttribute("lang")
	vi.unstubAllGlobals()
})

type App = {
	state: LocaleState
	location: () => Location
	calls: NavigateTo[]
	fail: { next: boolean }
	setInitial: (tag: string | undefined) => void
	dispose: () => void
}

// A provider under the router contexts. The fake navigator commits the URL it builds unless `fail.next` is set, and
// the layout passes the URL's locale param as `initial`, as the app's root layout does.
// `config` is the provider's prop, and `router` the one its contexts give.
function mount(
	url: string,
	fixed?: { initial: string | undefined },
	under: { config?: LocaleProviderProps["config"]; router?: Router } = {},
): App {
	const localeConfig = "config" in under ? under.config : config
	const routed = under.router ?? router
	const parsed = new URL(url, "http://localhost")
	const [location, setLocation] = createSignal<Location>({
		pathname: parsed.pathname,
		search: parsed.search,
		hash: parsed.hash,
	})
	const [initial, setInitial] = createSignal(fixed?.initial)
	const calls: NavigateTo[] = []
	const fail = { next: false }
	const navigate = (options: NavigateTo): Promise<void> => {
		calls.push(options)
		if (fail.next) return Promise.resolve()
		const next = new URL(buildUrl(options), "http://localhost")
		setLocation({ pathname: next.pathname, search: next.search, hash: next.hash })
		flush()
		return Promise.resolve()
	}
	const param = (): string | undefined => {
		const value = routed.match(location().pathname).params[routed.locale?.paramName ?? "locale"]
		return typeof value === "string" ? value : undefined
	}
	const seen: { state?: LocaleState } = {}
	const tree = (): JSX.Element =>
		createComponent(RouterContext, {
			value: routed,
			get children() {
				return createComponent(LocationContext, {
					value: location,
					get children() {
						return createComponent(NavigateContext, {
							value: navigate,
							get children() {
								return createComponent(LocaleProvider, {
									config: localeConfig,
									get initial() {
										return fixed === undefined ? param() : initial()
									},
									get children() {
										seen.state = useLocale()
										return "child"
									},
								})
							},
						})
					},
				})
			},
		})
	const dispose = render(tree, document.createElement("div"))
	flush()
	if (seen.state === undefined) throw new Error("not mounted")
	return { state: seen.state, location, calls, fail, setInitial: (tag) => (setInitial(tag), flush()), dispose }
}

function url(app: App): string {
	const location = app.location()
	return `${location.pathname}${location.search}${location.hash}`
}

const PROBE = "probe"

// Another tab's posts, then a probe: once the probe arrives, every post before it has been heard.
async function deliver(...messages: unknown[]): Promise<void> {
	const sender = new BroadcastChannel("flare.sync")
	const done = new Promise<void>((resolve) => {
		const tail = new BroadcastChannel("flare.sync")
		tail.onmessage = (event: MessageEvent<unknown>) => {
			if (event.data !== PROBE) return
			tail.close()
			resolve()
		}
	})
	for (const message of messages) sender.postMessage(message)
	sender.postMessage(PROBE)
	await done
	await new Promise((resolve) => setTimeout(resolve, 0))
	sender.close()
	flush()
}

// What other tabs hear while `run` runs.
async function posted(run: () => Promise<void>): Promise<unknown[]> {
	const heard: unknown[] = []
	const listener = new BroadcastChannel("flare.sync")
	listener.onmessage = (event: MessageEvent<unknown>) => void heard.push(event.data)
	await run()
	await deliver()
	listener.close()
	return heard.filter((data) => data !== PROBE)
}

it("initial", () => {
	const app = mount("/pricing", { initial: "hr" })
	expect(app.state.locale()).toBe("hr")
	app.setInitial("de")
	expect(app.state.locale()).toBe("de")
	expect([app.state.locales, app.state.defaultLocale]).toEqual([config.locales, "en"])
	app.dispose()
})

// The URL and the cookie say `de`. The provider follows `initial` alone.
it("param", () => {
	document.cookie = "flare.locale=de; Path=/"
	const app = mount("/de/pricing", { initial: "hr" })
	expect(app.state.locale()).toBe("hr")
	app.setInitial(undefined)
	expect(app.state.locale()).toBe("en")
	app.dispose()
})

it("initial changes", () => {
	document.documentElement.lang = "fr"
	const app = mount("/pricing", { initial: "en" })
	expect(document.documentElement.lang).toBe("en")
	app.setInitial("hr")
	expect(app.state.locale()).toBe("hr")
	expect(document.documentElement.lang).toBe("hr")
	app.dispose()
	expectReported(() => mount("/pricing", { initial: "fr" }), "fr is not one of the configured locales")
})

it("set locale", async () => {
	const app = mount("/pricing")
	await app.state.setLocale("hr")
	expect(app.calls).toEqual([
		{ to: "_root_/[[locale]]/pricing", params: { locale: "hr" }, hash: "", replace: false, [RAW_SEARCH]: "" },
	])
	expect(url(app)).toBe("/hr/pricing")
	expect(app.state.locale()).toBe("hr")
	// Once the navigation commits, the cookie holds the tag, with the server's attributes.
	expect(document.cookie).toBe("flare.locale=hr")
	await expect(app.state.setLocale("fr")).rejects.toThrow("fr is not one of the configured locales")
	app.dispose()
})

// A route with no locale param has no place for the tag: setLocale rejects, naming the route and the param, before
// any request (dx/features.md i18n, BUGS.md 439).
it("no locale param", async () => {
	const app = mount("/about", { initial: "en" })
	await expect(app.state.setLocale("hr")).rejects.toThrow("setLocale: _root_/about has no locale param")
	expect([app.calls, document.cookie]).toEqual([[], ""])
	// Another tab's change is not followed there, and nothing is thrown.
	await deliver({ type: "locale", tag: "hr" })
	expect(app.calls).toEqual([])
	app.dispose()
})

it("no cookie", async () => {
	const app = mount("/pricing")
	expect(document.cookie).toBe("")
	app.fail.next = true
	await app.state.setLocale("hr")
	expect(document.cookie).toBe("")
	app.dispose()
	// A URL no page matches has no route to put the tag on.
	const lost = mount("/nowhere", { initial: "en" })
	await lost.state.setLocale("hr")
	expect([lost.calls, document.cookie]).toEqual([[], ""])
	lost.dispose()
})

it("locale channel", async () => {
	const app = mount("/pricing")
	expect(await posted(() => app.state.setLocale("hr"))).toEqual([{ type: "locale", tag: "hr" }])
	app.dispose()
})

it("locale channel replace", async () => {
	const app = mount("/pricing")
	expect(await posted(() => deliver({ type: "locale", tag: "hr" }))).toEqual([{ type: "locale", tag: "hr" }])
	expect(app.calls).toEqual([
		{ to: "_root_/[[locale]]/pricing", params: { locale: "hr" }, hash: "", replace: true, [RAW_SEARCH]: "" },
	])
	expect(url(app)).toBe("/hr/pricing")
	app.dispose()
})

it("locale channel same", async () => {
	const app = mount("/hr/pricing")
	await deliver(
		{ type: "locale", tag: "hr" },
		{ type: "locale", tag: "fr" },
		{ type: "locale", tag: "de", extra: 1 },
		{ type: "locale", value: "de" },
		{ type: "theme", tag: "de" },
		"de",
	)
	expect(app.calls).toEqual([])
	app.dispose()
})

it("locale channel search", async () => {
	const app = mount("/pricing?x=1#y")
	await deliver({ type: "locale", tag: "hr" })
	expect(url(app)).toBe("/hr/pricing?x=1#y")
	await deliver({ type: "locale", tag: "en" })
	expect(url(app)).toBe("/pricing?x=1#y")
	expect(app.calls.map((call) => call.replace)).toEqual([true, true])
	app.dispose()
})

// The query stays byte for byte, order and every key kept, through setLocale and another tab's change; the page's own
// search still drops a key that would reach a prototype (dx/features.md i18n, BUGS.md 441).
it("query as written", async () => {
	const app = mount("/pricing?b=2&a=1&constructor=x#h")
	await app.state.setLocale("hr")
	expect(url(app)).toBe("/hr/pricing?b=2&a=1&constructor=x#h")
	await deliver({ type: "locale", tag: "en" })
	expect(url(app)).toBe("/pricing?b=2&a=1&constructor=x#h")
	expect(Object.keys(readSearch(app.location().search))).toEqual(["b", "a"])
	app.dispose()
})

it("locale channel required", async () => {
	const app = mount("/hr/docs")
	await deliver({ type: "locale", tag: "en" })
	expect(url(app)).toBe("/en/docs")
	expect(app.calls[0]?.replace).toBe(true)
	app.dispose()
})

it("locale channel fail", async () => {
	const app = mount("/pricing")
	app.fail.next = true
	expect(await posted(() => app.state.setLocale("hr"))).toEqual([])
	expect(url(app)).toBe("/pricing")
	expect(app.state.locale()).toBe("en")
	app.dispose()
})

it("locale channel quiet", async () => {
	flags.enabled = false
	const off = mount("/pricing")
	expect(await posted(() => off.state.setLocale("hr"))).toEqual([])
	expect(url(off)).toBe("/hr/pricing")
	off.dispose()
	flags.enabled = true
	vi.stubGlobal("BroadcastChannel", undefined)
	const missing = mount("/pricing")
	await missing.state.setLocale("de")
	expect(url(missing)).toBe("/de/pricing")
	missing.dispose()
})

// The router's locale config and the object the server's i18n() returns both carry the fields the provider reads.
it("config", async () => {
	const server = { ...config, paramName: "locale", cookieName: "lang", botDetection: true }
	const app = mount("/pricing", undefined, { config: server })
	expect(untrack(app.state.locale)).toBe("en")
	await app.state.setLocale("hr")
	expect(document.cookie).toBe("lang=hr")
	app.dispose()
})

it("locale outside", () => {
	expect(() => useLocale()).toThrow("useLocale outside LocaleProvider")
})

// The router that renames the locale param and cookie, as the server's i18n() reads them.
const renamed = createRouter({
	layouts: { _root_: {} },
	routeTree: [page("_root_/[[lang]]/pricing", "/[[lang]]/pricing")],
	locale: { locales: ["en", "hr"], defaultLocale: "en", paramName: "lang", cookieName: "ck" },
})

// The router is the locale config's single source: with no `config`, setLocale puts the tag in the router's param and
// cookie; a `config` that disagrees with it throws at mount, naming the field and both values; and the server's
// `i18n({ botDetection })` object, which names none of them, fits (dx/features.md i18n, BUGS.md 440).
it("router locale config", async () => {
	const app = mount("/pricing", undefined, { config: {}, router: renamed })
	await app.state.setLocale("hr")
	expect([app.calls[0]?.params, url(app), document.cookie]).toEqual([{ lang: "hr" }, "/hr/pricing", "ck=hr"])
	app.dispose()
	document.cookie = "ck=; max-age=0"
	// Solid's dev build also hands a render's uncaught throw to the platform's `reportError`, which a browser turns into
	// the window's `error` event (solid #3338); each mismatch reaches it as it reaches the caller.
	const reported: string[] = []
	const onError = (event: ErrorEvent): void => {
		event.preventDefault()
		reported.push(event.message)
	}
	window.addEventListener("error", onError)
	expect(() =>
		mount("/pricing", undefined, {
			config: { locales: ["en", "hr"], defaultLocale: "en", paramName: "locale" },
			router: renamed,
		}),
	).toThrow('LocaleProvider: config.paramName "locale" is not the router\'s "lang"')
	expect(() =>
		mount("/pricing", undefined, { config: { locales: ["en"], defaultLocale: "en" }, router: renamed }),
	).toThrow("config.locales")
	// A router with no locale option needs the config to name the locales.
	expect(() => mount("/pricing", undefined, { config: {} })).toThrow("LocaleProvider: the router has no locale option")
	window.removeEventListener("error", onError)
	expect(reported.map((message) => message.split(":")[0])).toEqual([
		"LocaleProvider",
		"LocaleProvider",
		"LocaleProvider",
	])
	const bots = mount("/pricing", undefined, { config: i18n({ botDetection: false }), router: renamed })
	expect(bots.state.locales).toEqual(["en", "hr"])
	bots.dispose()
})
