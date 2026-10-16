import { expect, it } from "vitest"
import { i18n, type I18nOptions } from "../../src/features/i18n/server/index.ts"
import { createComponent } from "solid-js"
import { Dynamic, type JSX } from "@solidjs/web"
import {
	createTranslations,
	formatMessage,
	LocaleProvider,
	useLoaderT,
	useT,
} from "../../src/features/i18n/shared/index.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRouter, type RouteModule } from "../../src/shared/router/create-router.ts"
import { bodyOf, documentOf } from "./builder-app.ts"
import { builtServer, fixtureApps } from "./vite-app.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"

// dx/features.md's i18n server rules through the real createServer(...).fetch with `i18n()` (B96): which URL a
// request lands on, which redirects, the cookie, a bot, and the loader's `t`.

const SITE = "https://example.com"
const root = createRootLayout("_root_").render((props) => documentOf(props.children))
const messages = createTranslations({ en: { hello: "Hello" }, hr: { hello: "Bok" } })

// A page that prints its locale param and the loader's `t("hello")`.
function greeting(id: string) {
	return createPage(id)
		.loader(() => ({ text: useLoaderT(messages)("hello") }))
		.render(
			(props) =>
				`${id} ${String(Reflect.get(props.params, "locale") ?? Reflect.get(props.params, "lang"))} ${props.loaderData.text}`,
		)
}

function app(options: Partial<I18nOptions> = {}, param = "locale") {
	const config = { locales: ["en", "hr"], defaultLocale: "en", ...options }
	const optional = `_root_/[[${param}]]/about`
	const routeTree = [
		{ id: optional, path: `/[[${param}]]/about`, module: greeting(optional) },
		{ id: "_root_/[locale]/docs", path: "/[locale]/docs", module: greeting("_root_/[locale]/docs") },
		{ id: "_root_/xx/about", path: "/xx/about", module: greeting("_root_/xx/about") },
		{
			id: "_root_/[[locale]]/llms.txt",
			path: "/[[locale]]/llms.txt",
			module: createPage("_root_/[[locale]]/llms.txt").response(
				() => new Response("llms", { headers: { "cache-control": "public, max-age=300" } }),
			),
			response: true,
		},
	]
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: routeTree as { id: string; path: string; module: RouteModule }[],
		locale: { locales: config.locales, defaultLocale: config.defaultLocale, paramName: param },
	})
	const server = createServer({ router, site: SITE, locale: i18n({ ...config, paramName: param }) })
	return async (path: string, headers: Record<string, string> = {}) => {
		const response = await server.fetch(new Request(`${SITE}${path}`, { headers, redirect: "manual" }))
		const text = await response.text()
		return {
			status: response.status,
			location: response.headers.get("location"),
			cacheControl: response.headers.get("cache-control"),
			cookies: response.headers.getSetCookie(),
			body: bodyOf(text),
		}
	}
}

// `locales`: a configured tag in the path is the locale. An unconfigured locale-like segment on the optional param
// redirects to the path without it; on a required `[locale]` it redirects to the default in that segment; a static
// route at that path wins. A wrong-case tag 301s to its configured spelling. A tag Intl.Locale rejects throws.
it("locales", async () => {
	const get = app()
	expect((await get("/hr/about")).body).toBe("_root_/[[locale]]/about hr Bok")
	expect(await get("/zz/about")).toMatchObject({ status: 302, location: "/about", cacheControl: "private, no-store" })
	expect(await get("/zz/docs")).toMatchObject({ status: 302, location: "/en/docs" })
	expect((await get("/xx/about")).body).toBe("_root_/xx/about undefined Hello")
	expect(await get("/HR/about")).toMatchObject({ status: 301, location: "/hr/about" })
	expect(() => i18n({ locales: ["en_US"], defaultLocale: "en_US" })).toThrow('i18n locales: "en_US"')
})

// `defaultLocale`: the optional segment omits it, a required one keeps it, and a default outside `locales` throws.
it("defaultLocale", async () => {
	const get = app()
	expect((await get("/about")).body).toBe("_root_/[[locale]]/about undefined Hello")
	expect((await get("/en/docs")).body).toBe("_root_/[locale]/docs en Hello")
	expect(() => i18n({ locales: ["en", "hr"], defaultLocale: "de" })).toThrow("i18n defaultLocale de is not in locales")
})

// `cookieName`: a document whose URL does not show the cookie's tag is a 302, no-store, the query kept, and the
// redirect sets the cookie under that name; a cookie of another name is no cookie. `Accept-Language` follows it.
it("cookieName", async () => {
	const get = app({ cookieName: "pick" })
	const moved = await get("/about?q=1", { cookie: "pick=hr" })
	expect(moved).toMatchObject({ status: 302, location: "/hr/about?q=1", cacheControl: "private, no-store" })
	expect(moved.cookies).toEqual([expect.stringMatching(/^pick=hr; Path=\/; .*SameSite=Lax/)])
	expect((await get("/about", { cookie: "flare.locale=hr" })).status).toBe(200)
	expect(await get("/about", { "accept-language": "hr-HR, en;q=0.5" })).toMatchObject({
		status: 302,
		location: "/hr/about",
	})
})

// `paramName`: the tag lives in the segment of that name.
it("paramName", async () => {
	const get = app({}, "lang")
	expect((await get("/hr/about")).body).toBe("_root_/[[lang]]/about hr Bok")
	expect((await get("/about", { cookie: "flare.locale=hr" })).location).toBe("/hr/about")
})

// `botDetection`: a bot follows neither the cookie nor `Accept-Language` and gets no locale cookie; `false` treats it
// as a browser.
it("botDetection", async () => {
	const bot = { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", cookie: "flare.locale=hr" }
	const stays = await app()("/about", bot)
	expect(stays).toMatchObject({ status: 200, body: "_root_/[[locale]]/about undefined Hello" })
	expect(stays.cookies).toEqual([])
	expect(await app({ botDetection: false })("/about", bot)).toMatchObject({ status: 302, location: "/hr/about" })
})

// A `.response()` route is never negotiated: no redirect, no locale cookie, its own Cache-Control.
it("response route", async () => {
	const answer = await app()("/llms.txt", { cookie: "flare.locale=hr" })
	expect(answer).toMatchObject({ status: 200, cacheControl: "public, max-age=300", cookies: [] })
})

const catalog = createTranslations({
	en: {
		items: "{n, plural, =0 {no items} one {# item} other {# items}}",
		place: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
		pet: "{kind, select, cat {a cat} other {a pet}}",
	},
	hr: {
		items: "{n, plural, one {# stavka} few {# stavke} other {# stavki}}",
		place: "{n}.",
		pet: "{kind, select, cat {mačka} other {ljubimac}}",
	},
})

// The messages a loader's `t` formats for the request's locale, from the path's tag: a missing key is the key; plural
// with an exact `=N` branch and `#`, by that tag's plural rules; selectordinal; select with its `other`. A branch
// without `other` throws when the translations are created. `formatMessage` takes a tag of its own.
it("messages", async () => {
	const page = createPage("_root_/[[locale]]/m")
		.loader(() => {
			const t = useLoaderT(catalog)
			return {
				text: [
					t("missing"),
					t("items", { n: 0 }),
					t("items", { n: 1 }),
					t("items", { n: 3 }),
					t("place", { n: 2 }),
					t("pet", { kind: "dog" }),
				].join("|"),
			}
		})
		.render((props) => props.loaderData.text)
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/[[locale]]/m", path: "/[[locale]]/m", module: page as RouteModule }],
		locale: { locales: ["en", "hr"], defaultLocale: "en" },
	})
	const server = createServer({ router, site: SITE, locale: i18n({ locales: ["en", "hr"], defaultLocale: "en" }) })
	const body = async (path: string) => bodyOf(await (await server.fetch(new Request(`${SITE}${path}`))).text())
	expect(await body("/m")).toBe("missing|no items|1 item|3 items|2nd|a pet")
	expect(await body("/hr/m")).toBe("missing|0 stavki|1 stavka|3 stavke|2.|ljubimac")
	expect(() => createTranslations({ en: { bad: "{n, plural, one {#}}" } })).toThrow("en.bad: other")
	expect(formatMessage("{n, number} {n, plural, one {stavka} few {stavke} other {stavki}}", { n: 3 }, "hr")).toBe(
		"3 stavke",
	)
})

const terms = createTranslations({
	en: { terms: "Read the {link}terms{/link} <b>now</b>" },
	hr: { terms: "Pročitaj {link}uvjete{/link} <b>sada</b>" },
})

// The rich tag's component: a link around its children.
function link(props: { children?: JSX.Element }): JSX.Element {
	return createComponent(Dynamic, {
		component: "a",
		href: "/t",
		get children() {
			return props.children
		},
	})
}

// The body /rich renders under a provider at `initial`.
async function richBody(initial: string): Promise<string> {
	return bodyOf(await (await richApp(initial).fetch(new Request(`${SITE}/rich`))).text())
}

// A root under LocaleProvider at `initial`, and a page whose render uses `useT`.
function richApp(initial: string) {
	const provided = createRootLayout("_root_").render((props) =>
		createComponent(LocaleProvider, {
			config: { locales: ["en", "hr"], defaultLocale: "en" },
			initial,
			get children() {
				return documentOf(props.children)
			},
		}),
	)
	const page = createPage("_root_/rich").render(() => {
		const t = useT(terms)
		return [t("missing"), " ", t.rich("terms", { link })]
	})
	const router = createRouter({
		layouts: { _root_: provided },
		routeTree: [{ id: "_root_/rich", path: "/rich", module: page as RouteModule }],
		locale: { locales: ["en", "hr"], defaultLocale: "en" },
	})
	return createServer({ router, site: SITE })
}

// `useT` in a render: `t` and `t.rich` bound to the provider's locale. A matched tag is the component; the text
// around it is escaped, on the page's real path in dev and in a production build (BUGS.md 142).
it("render t", { timeout: 120_000 }, async () => {
	expect(await richBody("en")).toBe('missing Read the <a href="/t">terms</a> &lt;b>now&lt;/b>')
	expect(await richBody("hr")).toBe('missing Pročitaj <a href="/t">uvjete</a> &lt;b>sada&lt;/b>')
	const apps = fixtureApps()
	try {
		const built = await builtServer(
			apps.make({
				"src/routes/_root_/root.root-layout.tsx": `import { createRootLayout } from "@lovrozagar/flare"
import { LocaleProvider } from "@lovrozagar/flare/i18n"
export const route = createRootLayout("_root_").render((props) => (
	<LocaleProvider config={{ locales: ["en"], defaultLocale: "en" }}>
		<html><head></head><body>{props.children}</body></html>
	</LocaleProvider>
))
`,
				"src/routes/_root_/rich/rich.page.tsx": `import { createPage } from "@lovrozagar/flare"
import { createTranslations, useT } from "@lovrozagar/flare/i18n"
const messages = createTranslations({ en: { terms: "Read the {link}terms{/link} <script>x</script>" } })
export const route = createPage("_root_/rich").render(() => {
	const t = useT(messages)
	return t.rich("terms", { link: (props) => <a href="/t">{props.children}</a> })
})
`,
			}),
		)
		const production = await built.fetch(new Request(`${SITE}/rich`))
		expect(bodyOf(await production.text())).toBe('Read the <a href="/t">terms</a> &lt;script>x&lt;/script>')
	} finally {
		apps.removeAll()
	}
})
