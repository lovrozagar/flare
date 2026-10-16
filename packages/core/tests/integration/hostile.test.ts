import { expect, it, vi } from "vitest"
import { i18n } from "../../src/features/i18n/server/middleware.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { redirect } from "../../src/shared/errors/index.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// Hostile request values through the real createServer(...).fetch (B96).

// A value the request or a route derives from it never makes `server.fetch` reject: a malformed escape in the locale
// slot, a CR or LF in a `.headers()` value, and one in a redirect's target each come back as an answer: the bad
// headers are that match's bug (B82), and the bad redirect fails its loader (plan 21 2.7, BUGS.md 168).
it("hostile values answer", async () => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
	const root = createRootLayout("[[locale]]/_root_").render((props) => props.children)
	const page = createPage("[[locale]]/_root_/x").render(() => "x")
	const split = createPage("[[locale]]/_root_/split")
		.headers(({ search }) => ({ "x-echo": String(Reflect.get(Object(search), "v") ?? "") }))
		.render(() => "split")
	const away = createPage("[[locale]]/_root_/away")
		.loader(({ search }) => {
			throw redirect({ href: `https://example.com/${String(Reflect.get(Object(search), "to") ?? "")}` })
		})
		.render(() => "away")
	const server = createServer({
		site: "https://example.com",
		locale: i18n({ locales: ["en", "hr"], defaultLocale: "en" }),
		router: createRouter({
			layouts: { "[[locale]]/_root_": root },
			routeTree: [
				{ id: "[[locale]]/_root_/x", path: "/[[locale]]/x", module: page as never },
				{ id: "[[locale]]/_root_/split", path: "/[[locale]]/split", module: split as never },
				{ id: "[[locale]]/_root_/away", path: "/[[locale]]/away", module: away as never },
			],
			locale: { locales: ["en", "hr"], defaultLocale: "en" },
		}),
	})
	const answer = (path: string) =>
		Promise.resolve()
			.then(() => server.fetch(new Request(`https://example.com${path}`, { redirect: "manual" })))
			.then(
				(response) => ({
					status: response.status,
					echo: response.headers.get("x-echo"),
					cookie: response.headers.get("set-cookie"),
				}),
				(error: unknown) => ({ rejected: String(error) }),
			)
	// The bad `.headers()` value is that match's bug: its headers are omitted, the page renders, and no header was split.
	expect(await answer("/split?v=a%0D%0Aset-cookie:%20x=1")).toEqual({ status: 200, echo: null, cookie: null })
	expect(await answer("/split?v=fine")).toEqual({ status: 200, echo: "fine", cookie: null })
	// A redirect target with a CR or LF is refused, so the loader fails: the 500 page.
	expect(await answer("/away?to=a%0D%0Ab")).toMatchObject({ status: 500 })
	// A malformed escape in the locale slot is no locale: never a rejection.
	for (const path of ["/%zz/x", "/%e9/x", "/hr%ZZ/x"]) {
		const got = await answer(path)
		expect([path, "status" in got && got.status < 500]).toEqual([path, true])
	}
})
