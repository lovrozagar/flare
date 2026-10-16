import { dataRequests, deepOnly, expect, open, prodOnly, serverOf, sessionCookie, test } from "./docs.fixture.ts"

// SSG seeds, ISR, shared SSR, CDN headers, purge, the client match cache, and the store per runtime (bits/15).
deepOnly()

test("ssg seed", async ({ http, docs }, info) => {
	prodOnly(info)
	const response = await http.get(`${docs.origin}/docs/routing`)
	expect(response.headers()["flare-render"]).toBe("ssg")
	expect(response.headers()["flare-cache"]).toBe("hit")
	expect(await response.text()).toContain('id="doc-title"')
})

test("ssg public cdn", async ({ http, docs }, info) => {
	prodOnly(info)
	const response = await http.get(`${docs.origin}/hr`)
	expect(response.headers()["cache-control"]).toBe("public, max-age=0, s-maxage=60")
	expect(response.headers()["cdn-cache-control"]).toBe("public, max-age=60, stale-while-revalidate=3600")
})

// One render serves the page until it is stored (B33). The first request is not delayed by its store write, so a repeat
// that comes before the write lands joins that render and answers `miss` from it, and a later one is a hit: the case
// reads which render served each answer, not when the write landed. A slow write made a strict `hit` fail (BUGS.md 88).
test("isr stored", async ({ http, docs }, info) => {
	prodOnly(info)
	const get = async (): Promise<{ cache: string | undefined; render: string | undefined; renderedBy: string }> => {
		const response = await http.get(`${docs.origin}/changelog`)
		const renderedBy = /id="changelog-rendered-by"[^>]*>([0-9a-f]+)</.exec(await response.text())?.[1] ?? ""
		return { cache: response.headers()["flare-cache"], render: response.headers()["flare-render"], renderedBy }
	}
	const first = await get()
	expect(first.render).toBe("isr")
	expect(first.renderedBy).toMatch(/^[0-9a-f]+$/)
	const repeat = await get()
	expect(["hit", "miss"]).toContain(repeat.cache)
	expect(repeat.renderedBy).toBe(first.renderedBy)
	await expect.poll(async () => (await get()).cache).toBe("hit")
	expect((await get()).renderedBy).toBe(first.renderedBy)
})

test("shared ssr", async ({ http, docs }, info) => {
	prodOnly(info)
	const renderedBy = async (): Promise<string | undefined> => {
		const response = await http.get(`${docs.origin}/api/routes/create-page`)
		return /id="api-rendered-by"[^>]*>([0-9a-f]+)</.exec(await response.text())?.[1]
	}
	const rendered = await renderedBy()
	// One render serves both repeats (BUGS.md B33). The header is not asserted: a repeat that arrives before the
	// write lands joins the flight and answers `miss` from that same render (dx/cache.md).
	expect([await renderedBy(), await renderedBy()]).toEqual([rendered, rendered])
	expect(rendered).toMatch(/^[0-9a-f]+$/)
})

test("revalidate tag", async ({ page, http, docs, context }, info) => {
	prodOnly(info)
	const renderedBy = async (): Promise<string | undefined> => {
		const response = await http.get(`${docs.origin}/api/server-fn/create-server-fn`)
		return /id="api-rendered-by"[^>]*>([0-9a-f]+)</.exec(await response.text())?.[1]
	}
	await renderedBy()
	const stored = await renderedBy()
	expect(await renderedBy()).toBe(stored)
	await context.addCookies([sessionCookie(docs.origin, "ada", "admin")])
	await open(page, docs.origin, "/admin")
	await page.locator("#republish").click()
	await expect(page.locator("#purged")).toHaveText("api")
	await expect.poll(renderedBy).not.toBe(stored)
})

// The first visit is a client navigation, so its match is in the client cache before the second.
test("client cache stale", async ({ page, docs }) => {
	await open(page, docs.origin, "/")
	await page.locator("#nav").getByRole("link", { name: "Examples" }).click()
	await expect(page.locator("#examples-rest")).toHaveText("null")
	await page.locator("#sidebar").getByRole("link", { name: "Routing" }).click()
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	const requests = dataRequests(page)
	await page.locator("#nav").getByRole("link", { name: "Examples" }).click()
	await expect(page.locator("#examples-rest")).toHaveText("null")
	expect(requests.filter((seen) => seen.path === "/examples" && seen.kind === "data")).toEqual([])
})

test("cache deferred", async ({ page, docs }) => {
	await open(page, docs.origin, "/")
	await page.locator("#nav").getByRole("link", { name: "Changelog" }).click()
	await expect(page.locator("#stats")).toBeVisible()
	await page.locator("#nav").getByRole("link", { name: "Playground" }).click()
	await expect(page.locator("#echo-send")).toBeVisible()
	const requests = dataRequests(page)
	await page.locator("#nav").getByRole("link", { name: "Changelog" }).click()
	await expect(page.locator("#stats")).toBeVisible()
	expect(requests.filter((seen) => seen.path === "/changelog")).toEqual([])
})

test("store per runtime", async ({ http, docs }, info) => {
	const response = await http.get(`${docs.origin}/`)
	expect(response.headers()["x-docs-store"]).toBe(serverOf(info).startsWith("workers") ? "cache-api" : "fs")
})
