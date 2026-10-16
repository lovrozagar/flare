import { expect, it } from "vitest"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import { createServer } from "./create.ts"
import { LOCALE_SLOT, type LocaleDecision, type LocaleSlot } from "./locale-slot.ts"

// The core's half of the locale slot, with a fake feature: the cookie rides a redirect and an answer that is already
// private, never a public one (dx/features.md i18n). The feature's rows are features/i18n/server/middleware.test.ts.
const root = createRootLayout("_root_").render((props) => props.children)
const open = createPage("_root_/open")
	.cache({ ssr: { ttl: "1h" }, cdn: { maxAge: "60s" } })
	.render(() => "open")
const closed = createPage("_root_/closed").render(() => "closed")
const node = (id: string, path: string, module: RouteModule) => ({ id, path, module })
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [node("_root_/open", "/open", open), node("_root_/closed", "/closed", closed)],
	locale: { locales: ["en", "hr"], defaultLocale: "en" },
})

function serve(decide: (path: string) => LocaleDecision): (path: string) => Promise<Response> {
	const locale: LocaleSlot = {
		[LOCALE_SLOT]: ({ request }) => decide(new URL(request.url).pathname),
		locales: ["en", "hr"],
		defaultLocale: "en",
		paramName: "locale",
	}
	const server = createServer({ router, locale })
	return (path) => server.fetch(new Request(`https://site.test${path}`))
}

const COOKIE = "flare.locale=hr; Path=/"

it("locale slot", async () => {
	const get = serve((path) =>
		path === "/open"
			? { setCookie: COOKIE }
			: path === "/closed"
				? { setCookie: COOKIE }
				: { redirect: { status: 302, location: "/closed" }, ...(path === "/move" && { setCookie: COOKIE }) },
	)
	const shared = await get("/open")
	expect(shared.headers.get("cache-control")).toMatch(/^public/)
	expect(shared.headers.getSetCookie()).toEqual([])
	const owned = await get("/closed")
	expect(owned.headers.get("cache-control")).toBe("private, no-store")
	expect(owned.headers.getSetCookie()).toEqual([COOKIE])
	expect(await owned.text()).toContain("closed")
	const moved = await get("/move")
	expect([moved.status, moved.headers.get("location"), moved.headers.get("cache-control")]).toEqual([
		302,
		"/closed",
		"private, no-store",
	])
	expect(moved.headers.getSetCookie()).toEqual([COOKIE])
	// A data request gets the redirect as its one `x` frame, HTTP 200; a prefetch gets a 404 and no cookie.
	const data = await get("/move?_flare=data")
	expect([data.status, await data.text(), data.headers.getSetCookie()]).toEqual([
		200,
		'{"t":"x","s":302,"u":"/closed","r":true}\n',
		[COOKIE],
	])
	const prefetch = await get("/move?_flare=prefetch")
	expect([prefetch.status, prefetch.headers.getSetCookie()]).toEqual([404, []])
	expect((await get("/quiet")).headers.getSetCookie()).toEqual([])
	// The security set rides every slot answer.
	expect(moved.headers.get("content-security-policy")).toMatch(/script-src/)
	// A negotiated public answer leaves private. A private one is left as it is.
	const negotiated = serve((path) => ({ negotiated: true, ...(path === "/closed" && { setCookie: COOKIE }) }))
	const open = await negotiated("/open")
	expect(open.headers.get("cache-control")).toBe("private, no-store")
	expect(open.headers.get("cache-tag")).toBeNull()
	expect(await open.text()).toContain("open")
	expect((await negotiated("/closed")).headers.getSetCookie()).toEqual([COOKIE])
})

// A slot that decides nothing, with these locale fields.
function slot(fields: Partial<Omit<LocaleSlot, typeof LOCALE_SLOT>> = {}): LocaleSlot {
	return { [LOCALE_SLOT]: () => ({}), ...fields }
}

// The router's `locale` is the one source of the tags, the default, the param name, and the cookie name: a slot with
// none of them reads the router's, and a field the slot does give must equal the router's, or createServer throws
// naming it. A slot needs a router with a locale config (plan 21 3.8, BUGS.md 185).
it("router locale", () => {
	const bare = createRouter({ layouts: { _root_: root }, routeTree: [] })
	expect(() => createServer({ router: bare, locale: slot() })).toThrow(
		"createServer: locale needs the router's locale: createRouter({ locale })",
	)
	expect(() => createServer({ router, locale: slot() })).not.toThrow()
	const same = { locales: ["en", "hr"], defaultLocale: "en", paramName: "locale", cookieName: "flare.locale" }
	expect(() => createServer({ router, locale: slot(same) })).not.toThrow()
	const differ = [
		["locales", ["en"]],
		["defaultLocale", "hr"],
		["paramName", "lang"],
		["cookieName", "lang"],
	] as const
	for (const [field, value] of differ) {
		expect(() => createServer({ router, locale: slot({ [field]: value }) })).toThrow(
			`createServer: locale.${field} is not the router's locale.${field}`,
		)
	}
})
