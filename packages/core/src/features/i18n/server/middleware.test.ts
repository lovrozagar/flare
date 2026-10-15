import { expect, it } from "vitest"
import { createMemoryStore } from "../../../server/cache/index.ts"
import { createServer } from "../../../server/lifecycle/create.ts"
import { createMiddleware } from "../../../server/middleware/index.ts"
import { createPage } from "../../../shared/route-builder/page.ts"
import { createRootLayout } from "../../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../../shared/router/create-router.ts"
import { i18n } from "./middleware.ts"

const root = createRootLayout("_root_").render((props) => props.children)
const shared = createPage("_root_/[[locale]]/pricing")
	.cache({ ssr: { ttl: "1h" }, cdn: { maxAge: "60s" } })
	.render(() => "pricing")
const owned = createPage("_root_/[[locale]]/account").render(() => "account")
const home = createPage("_root_/[[locale]]").render(() => "home")
const docs = createPage("_root_/[locale]/docs").render(() => "docs")
// A machine-read `.response()` route under the optional locale: it answers with its own Cache-Control.
const llms = createPage("_root_/[[locale]]/llms.txt").response(
	() => new Response("# llms", { headers: { "content-type": "text/plain", "cache-control": "public, max-age=300" } }),
)

const node = (id: string, path: string, module: RouteModule) => ({ id, path, module })
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		node("_root_/[[locale]]", "/[[locale]]", home),
		node("_root_/[[locale]]/pricing", "/[[locale]]/pricing", shared),
		node("_root_/[[locale]]/account", "/[[locale]]/account", owned),
		node("_root_/[locale]/docs", "/[locale]/docs", docs),
		{ ...node("_root_/[[locale]]/llms.txt", "/[[locale]]/llms.txt", llms), response: true },
	],
})
const locale = i18n({ locales: ["en", "hr"], defaultLocale: "en" })
const server = createServer({ router, locale })

type Ask = { cookie?: string; language?: string; origin?: string }

function get(path: string, options: Ask = {}): Promise<Response> {
	const headers = new Headers()
	if (options.cookie !== undefined) headers.set("cookie", `flare.locale=${options.cookie}`)
	if (options.language !== undefined) headers.set("accept-language", options.language)
	return server.fetch(new Request(`${options.origin ?? "http://site.test"}${path}`, { headers }))
}

// The slot runs after mounts and before the middleware list: its redirect never reaches a middleware.
it("slot", async () => {
	const seen: string[] = []
	const watch = createMiddleware(({ path, next }) => {
		seen.push(path)
		return next()
	})
	const watched = createServer({ router, locale, middleware: [watch] })
	const ask = new Request("http://site.test/pricing", { headers: { cookie: "flare.locale=hr" } })
	const redirected = await watched.fetch(ask)
	expect(redirected.status).toBe(302)
	expect(seen).toEqual([])
	expect((await watched.fetch(new Request("http://site.test/hr/pricing"))).status).toBe(200)
	expect(seen).toEqual(["/hr/pricing"])
})

it("not a middleware", () => {
	// @ts-expect-error the locale slot is not a middleware
	const wrong = { router, middleware: [locale] } satisfies Parameters<typeof createServer>[0]
	expect(wrong.middleware).toHaveLength(1)
})

// A locale-like segment on a URL no route matches is not redirected. The router answers it.
it("redirect is a route", async () => {
	const response = await get("/hr/nowhere/at/all")
	expect(response.status).toBe(404)
	expect(response.headers.get("location")).toBeNull()
})

it("cookie on redirect", async () => {
	const response = await get("/fr/pricing?x=1")
	expect(response.status).toBe(302)
	expect(response.headers.get("location")).toBe("/pricing?x=1")
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(response.headers.getSetCookie()).toEqual(["flare.locale=en; Path=/; SameSite=Lax; Max-Age=31536000"])
	expect(response.headers.get("vary")).toBeNull()
})

// The data answer after setLocale(default) on a shared page would persist `en`, but a shared answer never carries it.
it("cookie on shared", async () => {
	const response = await get("/pricing?_flare=data", { cookie: "hr" })
	expect(response.status).toBe(200)
	expect(response.headers.get("cache-control")).toMatch(/^public/)
	expect(response.headers.getSetCookie()).toEqual([])
	const document = await get("/hr/pricing")
	expect(document.headers.get("cache-control")).toMatch(/^public/)
	expect(document.headers.getSetCookie()).toEqual([])
})

it("cookie on private", async () => {
	const response = await get("/account?_flare=data", { cookie: "hr" })
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(response.headers.getSetCookie()).toEqual(["flare.locale=en; Path=/; SameSite=Lax; Max-Age=31536000"])
})

it("cookie attrs", async () => {
	const plain = (await get("/fr/docs")).headers.getSetCookie()[0] ?? ""
	const secure = (await get("/fr/docs", { origin: "https://site.test" })).headers.getSetCookie()[0] ?? ""
	expect(plain).toBe("flare.locale=en; Path=/; SameSite=Lax; Max-Age=31536000")
	expect(secure).toBe("flare.locale=en; Path=/; SameSite=Lax; Max-Age=31536000; Secure")
	expect(`${plain}${secure}`).not.toMatch(/Domain/i)
})

it("cookie replaced", async () => {
	const response = await get("/pricing", { cookie: "nope", language: "hr" })
	expect(response.status).toBe(302)
	expect(response.headers.getSetCookie()).toEqual(["flare.locale=hr; Path=/; SameSite=Lax; Max-Age=31536000"])
	expect(JSON.stringify([...response.headers])).not.toContain("nope")
})

it("negotiate 302", async () => {
	const response = await get("/?q=1", { cookie: "hr" })
	expect(response.status).toBe(302)
	expect(response.headers.get("location")).toBe("/hr?q=1")
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	const header = await get("/pricing?x=1", { language: "hr" })
	expect(header.headers.get("location")).toBe("/hr/pricing?x=1")
	// The default tag on an optional segment shows as no segment, so it is already on the URL.
	expect((await get("/pricing", { cookie: "en" })).status).toBe(200)
})

it("data cookie", async () => {
	const response = await get("/account?_flare=data", { language: "hr" })
	expect(response.status).toBe(200)
	expect(response.headers.get("location")).toBeNull()
	expect(response.headers.getSetCookie()).toEqual(["flare.locale=en; Path=/; SameSite=Lax; Max-Age=31536000"])
	// A cookie that already holds the tag the URL shows is not written again.
	expect((await get("/hr/account?_flare=data", { cookie: "hr" })).headers.getSetCookie()).toEqual([])
})

it("prefetch quiet", async () => {
	const response = await get("/account?_flare=prefetch", { cookie: "hr" })
	expect(response.headers.get("location")).toBeNull()
	expect(response.headers.getSetCookie()).toEqual([])
})

it("default missing", () => {
	expect(() => i18n({ locales: ["en"], defaultLocale: "hr" })).toThrow("i18n defaultLocale hr is not in locales")
})

// A document with no tag under an optional locale depended on the cookie and Accept-Language, so a CDN copy would
// skip them. It leaves private. Its shared decision still writes the Flare store, which sits behind the slot.
it("negotiated private", async () => {
	const isr = createPage("_root_/[[locale]]/pricing")
		.cache({ isr: true, cdn: { maxAge: "60s" } })
		.render(() => "pricing")
	const stored = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [node("_root_/[[locale]]/pricing", "/[[locale]]/pricing", isr)],
		}),
		locale,
		store: createMemoryStore(),
		site: "https://site.test",
	})
	const fetchAt = (path: string): Promise<Response> => stored.fetch(new Request(`https://site.test${path}`))
	const bare = await fetchAt("/pricing")
	expect(bare.status).toBe(200)
	expect(bare.headers.get("cache-control")).toBe("private, no-store")
	expect(bare.headers.get("cache-tag")).toBeNull()
	// The shared decision reached the Flare store: the answer is the store's miss, rendered as ISR.
	expect([bare.headers.get("flare-cache"), bare.headers.get("flare-render")]).toEqual(["miss", "isr"])
	expect(await bare.text()).toContain("pricing")
	expect((await fetchAt("/hr/pricing")).headers.get("cache-control")).toMatch(/^public/)
	expect((await fetchAt("/pricing?_flare=data")).headers.get("cache-control")).toMatch(/^public/)
	// With one locale there is nothing to negotiate.
	const single = createServer({ router, locale: i18n({ locales: ["en"], defaultLocale: "en" }) })
	expect((await single.fetch(new Request("https://site.test/pricing"))).headers.get("cache-control")).toMatch(/^public/)
})

// A server whose router has the locale config, with every loader's locale param recorded.
function localeServer(): { server: ReturnType<typeof createServer>; tags: unknown[] } {
	const tags: unknown[] = []
	const tagged = (id: string) =>
		createPage(id)
			.loader(({ params }) => {
				tags.push(Reflect.get(params, "locale"))
				return {}
			})
			.render(() => id)
	const routed = createRouter({
		layouts: { _root_: root },
		routeTree: [
			node("_root_/[[locale]]", "/[[locale]]", tagged("_root_/[[locale]]")),
			node("_root_/[[locale]]/pricing", "/[[locale]]/pricing", tagged("_root_/[[locale]]/pricing")),
		],
		locale: { locales: ["en", "hr"], defaultLocale: "en" },
	})
	return { server: createServer({ router: routed, locale }), tags }
}

it("locale param", async () => {
	const { server: routed, tags } = localeServer()
	const at = (path: string): Promise<Response> => routed.fetch(new Request(`http://site.test${path}`))
	for (const path of ["/favicon.ico", "/x.y"]) expect((await at(path)).status).toBe(404)
	expect(tags).toEqual([])
	expect((await at("/hr")).status).toBe(200)
	expect(tags).toEqual(["hr"])
	const stripped = await at("/fr")
	expect([stripped.status, stripped.headers.get("location")]).toEqual([302, "/"])
	expect(tags).toEqual(["hr"])
})

it("data unconfigured tag", async () => {
	const { server: routed, tags } = localeServer()
	const at = (path: string): Promise<Response> => routed.fetch(new Request(`http://site.test${path}`))
	const data = await at("/fr/pricing?_flare=data")
	expect(data.status).toBe(200)
	expect(data.headers.get("content-type")).toBe("application/x-ndjson")
	expect(data.headers.get("cache-control")).toBe("private, no-store")
	expect(await data.text()).toBe('{"t":"x","s":302,"u":"/pricing","r":true}\n')
	const prefetch = await at("/fr/pricing?_flare=prefetch")
	expect(prefetch.status).toBe(404)
	expect(await prefetch.text()).toBe("")
	expect(prefetch.headers.get("location")).toBeNull()
	expect(prefetch.headers.getSetCookie()).toEqual([])
	expect(tags).toEqual([])
})

// A `.response()` route is never negotiated: no cookie or Accept-Language 302, no locale cookie, no negotiated
// downgrade, so it keeps its own Cache-Control. The URL-shape rules still apply (dx/features.md i18n, BUGS.md B23).
it("response route", async () => {
	for (const ask of [{ language: "hr" }, { cookie: "hr" }, {}]) {
		const response = await get("/llms.txt", ask)
		expect(response.status).toBe(200)
		expect(response.headers.get("cache-control")).toBe("public, max-age=300")
		expect(response.headers.get("set-cookie")).toBeNull()
	}
	const cased = await get("/HR/llms.txt")
	expect(cased.status).toBe(301)
	expect(cased.headers.get("location")).toBe("/hr/llms.txt")
	const unknown = await get("/xx/llms.txt")
	expect(unknown.status).toBe(302)
	expect(unknown.headers.get("location")).toBe("/llms.txt")
})

it("response route tagged", async () => {
	const response = await get("/hr/llms.txt", { language: "en" })
	expect(response.status).toBe(200)
	expect(response.headers.get("cache-control")).toBe("public, max-age=300")
	expect(response.headers.get("set-cookie")).toBeNull()
})
