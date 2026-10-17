import {
	dataRequests,
	dataTraffic,
	deepOnly,
	DESKTOP_UA,
	documents,
	expect,
	fnId,
	isProd,
	open,
	test,
	wire,
} from "./docs.fixture.ts"
import { flushEvents } from "./flush.ts"

// What happens when things go wrong or arrive at once: a new deploy, a missing chunk, a dead network, the overlay
// history, concurrent misses, locale negotiation, CSRF headers, and a phone (bits/15 docs-resilience).
deepOnly()

const ECHO = fnId("src/fns/echo.ts", "echo")

test("build mismatch reload", async ({ page, docs }) => {
	// The newer deploy answers every data and prefetch request from the start, as a real deploy would.
	await page.route(/[?&]_flare=(data|prefetch)/, async (route) => {
		const response = await route.fetch()
		await route.fulfill({ response, headers: { ...response.headers(), "flare-build": "a-newer-deploy" } })
	})
	await open(page, docs.origin, "/docs/routing")
	const loads = documents(page)
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click()
	await expect.poll(() => loads).toEqual(["/docs/caching"])
	await expect(page.locator("#doc-title")).toHaveText("Caching")
	expect(await page.evaluate(() => sessionStorage.getItem("flare_chunk_reload"))).toContain("/docs/caching")
})

test("missing chunk reload", async ({ page, docs }, info) => {
	test.skip(!isProd(info), "chunk files exist only in a production build")
	// After hydrate every script request fails, as a chunk a newer deploy deleted would.
	let hydrated = false
	await page.route("**/assets/*.js", (route) => (hydrated ? route.abort() : route.continue()))
	await page.goto(`${docs.origin}/`)
	await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	hydrated = true
	const loads = documents(page)
	await page.getByRole("link", { name: "Open the playground" }).click()
	await expect.poll(() => loads).toEqual(["/playground"])
})

// A navigation the next click superseded loads no document when its route code fails: API is clicked, then Examples,
// and every script asked for after hydrate fails 300 ms late, so API's fails once Examples has taken over. Only
// Examples, the latest, loads its document, under the chunk guard (BUGS.md 121).
test("superseded chunk failure", async ({ page, docs }) => {
	let hydrated = false
	await page.route("**/*", async (route) => {
		const request = route.request()
		const code = request.resourceType() === "script" || /\.(js|ts|tsx)(\?|$)/.test(new URL(request.url()).pathname)
		if (!hydrated || !code) return route.fallback()
		await new Promise((resolve) => setTimeout(resolve, 300))
		await route.abort().catch(() => undefined)
	})
	await open(page, docs.origin, "/docs/routing")
	hydrated = true
	const loads = documents(page)
	await page.evaluate(async (nav) => {
		const link = (path: string) =>
			[...document.querySelectorAll<HTMLAnchorElement>(nav)].find((item) => item.pathname === path)
		link("/api/server/create-server")?.click()
		await new Promise((resolve) => setTimeout(resolve, 30))
		link("/examples")?.click()
	}, "#nav nav a")
	await expect.poll(() => loads).toEqual(["/examples"])
	await expect(page).toHaveURL(`${docs.origin}/examples`)
})

// A data response the client cannot read does not leave the reader stuck on the old page: the failure is logged and
// the target loads as a document (BUGS.md 123).
test("unreadable response", async ({ page, docs }) => {
	const problems = await open(page, docs.origin, "/docs/routing")
	await page.route("**/docs/caching?_flare=*", (route) =>
		route.fulfill({ status: 200, contentType: "application/x-ndjson", body: "not a frame\n" }),
	)
	const loads = documents(page)
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click()
	await expect.poll(() => loads).toEqual(["/docs/caching"])
	await expect(page.locator("#doc-title")).toHaveText("Caching")
	expect(problems.some((problem) => problem.includes("[flare] a client navigation failed"))).toBe(true)
})

// A click after Flare has begun a document load loads the clicked page as a document too, with no data request: the
// latest click wins. Caching's data is unreadable, so Flare falls back to loading /docs/caching, and that document is
// held 1 s; Auth is clicked meanwhile. Before, Auth started a client navigation, and the held load then replaced it
// (BUGS.md 129: in CI the unload cancelled such a navigation's chunk, and its own fallback buried the latest click).
test("click after reload starts", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	await page.route("**/docs/caching?_flare=*", (route) =>
		route.fulfill({ status: 200, contentType: "application/x-ndjson", body: "not a frame\n" }),
	)
	const fallback = Promise.withResolvers<void>()
	await page.route("**/docs/caching", async (route) => {
		if (!route.request().isNavigationRequest()) return route.fallback()
		fallback.resolve()
		await new Promise((resolve) => setTimeout(resolve, 1000))
		await route.fallback().catch(() => undefined)
	})
	const auth = await page.locator('#sidebar a[href="/docs/auth"]').boundingBox()
	if (auth === null) throw new Error("no Auth link")
	const loads = documents(page)
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click({ noWaitAfter: true })
	await fallback.promise
	const requests = dataRequests(page)
	// A raw pointer click: no script runs in a page whose document load has begun, and nothing waits on the held load.
	await page.mouse.click(auth.x + auth.width / 2, auth.y + auth.height / 2)
	await expect(page.locator("#doc-title")).toHaveText("Auth")
	await page.waitForTimeout(1200)
	await expect(page.locator("#doc-title")).toHaveText("Auth")
	expect(loads).toEqual(["/docs/caching", "/docs/auth"])
	// The hover's intent prefetch may still leave: a prefetch never falls back to a document load.
	expect(requests.filter((request) => request.kind === "data")).toEqual([])
})

test("network failure", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	const depth = await page.evaluate(() => history.length)
	// Every data request, the prefetch the hover started included, fails as a dead network would.
	await page.route("**/*_flare=*", (route) => route.abort("internetdisconnected"))
	const traffic = dataTraffic(page)
	await page.locator("#sidebar").getByRole("link", { name: "Auth" }).click()
	// The click's requests have all failed, and the page has heard each failure.
	await expect.poll(() => traffic.started() > 0 && traffic.pending() === 0).toBe(true)
	await flushEvents(page)
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	expect(new URL(page.url()).pathname).toBe("/docs/routing")
	expect(await page.evaluate(() => history.length)).toBe(depth)
})

// Auth is still loading when Styling is clicked, so Styling aborts it. The click's hover prefetches Auth, and the
// navigation reuses that request, so the delay holds every Auth data request, the prefetch included. Without it Auth
// landed at once, and the Styling click fell inside Auth's view transition, where the browser hit-tests the document
// element and no link is clicked (BUGS.md 98).
test("abort keeps latest", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	await page.route("**/docs/auth?_flare=*", async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 800))
		await route.continue().catch(() => {})
	})
	const traffic = dataTraffic(page)
	const sidebar = page.locator("#sidebar")
	await sidebar.getByRole("link", { name: "Auth" }).click()
	await sidebar.getByRole("link", { name: "Styling" }).click()
	await expect(page.locator("#doc-title")).toHaveText("Styling")
	// The held Auth requests have ended too, so a late Auth landing would already have committed.
	await expect.poll(() => traffic.pending()).toBe(0)
	await flushEvents(page)
	await expect(page.locator("#doc-title")).toHaveText("Styling")
	expect(new URL(page.url()).pathname).toBe("/docs/styling")
})

test("overlay history", async ({ page, docs }) => {
	await open(page, docs.origin, "/")
	await page.locator("#search-input").fill("route")
	await page.locator("#search-input").press("Enter")
	await expect(page.locator("#search-modal")).toBeVisible()
	const requests = dataRequests(page)
	await page.goBack()
	await expect(page.locator("#search-modal")).toHaveCount(0)
	await expect(page.locator("#message")).toBeVisible()
	await page.goForward()
	await expect(page.locator("#search-modal")).toBeVisible()
	expect(requests.filter((seen) => seen.path === "/")).toEqual([])
})

// Back while a navigation is still loading leaves for the entry before, and the navigation it left never commits,
// though its data arrives after (plan 21 5.2).
test("back during a commit", async ({ page, docs }) => {
	await open(page, docs.origin, "/")
	await page.locator('#nav a[href="/docs/routing"]').click()
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	await page.route("**/docs/auth?_flare=*", async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 800))
		await route.continue().catch(() => {})
	})
	const traffic = dataTraffic(page)
	await page.locator("#sidebar").getByRole("link", { name: "Auth" }).click()
	await page.goBack()
	await expect(page.locator("#message")).toBeVisible()
	await expect.poll(() => traffic.pending()).toBe(0)
	await flushEvents(page)
	expect(new URL(page.url()).pathname).toBe("/")
	await expect(page.locator("#doc-title")).toHaveCount(0)
})

// The search overlay's URL loads the whole search page on a reload, and a result link in the overlay closes it and
// lands its page (plan 21 5.2).
test("overlay after reload and leaving", async ({ page, docs }) => {
	await open(page, docs.origin, "/")
	await page.locator("#search-input").fill("route")
	await page.locator("#search-input").press("Enter")
	await expect(page.locator("#search-modal")).toBeVisible()
	await page.reload()
	await expect(page.locator("#search-page")).toBeVisible()
	await expect(page.locator("#search-modal")).toHaveCount(0)
	await page.goto(`${docs.origin}/`)
	await page.locator("#search-input").fill("route")
	await page.locator("#search-input").press("Enter")
	await expect(page.locator("#search-modal")).toBeVisible()
	await page.locator('#search-modal #results a[href="/docs/routing"]').click()
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	await expect(page.locator("#search-modal")).toHaveCount(0)
})

test("concurrent misses render once", async ({ http, docs }, info) => {
	test.skip(!isProd(info), "the shared store answers only in a production build")
	const url = `${docs.origin}/hr/api/routes/create-page`
	const bodies = await Promise.all(Array.from({ length: 8 }, () => http.get(url).then((response) => response.text())))
	const by = new Set(bodies.map((body) => /id="api-rendered-by"[^>]*>([0-9a-f]+)</.exec(body)?.[1]))
	expect(by.size).toBe(1)
})

test("accept language", async ({ browser, docs }) => {
	const context = await browser.newContext({ locale: "ar", userAgent: DESKTOP_UA })
	try {
		const page = await context.newPage()
		await page.goto(`${docs.origin}/docs/routing`)
		expect(new URL(page.url()).pathname).toBe("/ar/docs/routing")
		await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
	} finally {
		await context.close()
	}
})

test("bad locale cookie", async ({ browser, docs }) => {
	const context = await browser.newContext({ locale: "en-US", userAgent: DESKTOP_UA })
	try {
		await context.addCookies([{ name: "flare.locale", value: "HR", url: docs.origin }])
		const page = await context.newPage()
		const response = await page.goto(`${docs.origin}/`)
		expect(response?.request().redirectedFrom()).toBeNull()
		await expect(page.locator("#message")).toHaveText("Hello")
	} finally {
		await context.close()
	}
})

test("bot stays put", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/`, {
		headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", "accept-language": "hr" },
		maxRedirects: 0,
	})
	expect(response.status()).toBe(200)
	expect(response.headers()["set-cookie"]).toBeUndefined()
	expect(await response.text()).toContain('id="message"')
})

// The rejected POSTs carry no body: local Miniflare resets a kept-alive connection after an answer that left the body
// unread, so the next request on that socket would fail (dx/adapters.md, BUGS.md B56).
test("csrf headers", async ({ http, docs }) => {
	const post = (headers: Record<string, string>, data?: object) =>
		http.post(`${docs.origin}/_flare/fn/${ECHO}`, {
			headers: { "content-type": "application/json", ...headers },
			...(data === undefined ? {} : { data: wire(data) }),
		})
	expect((await post({ "sec-fetch-site": "cross-site" })).status()).toBe(403)
	expect((await post({ referer: "https://evil.test/page" })).status()).toBe(403)
	expect((await post({ "sec-fetch-site": "same-site" })).status()).toBe(403)
	expect((await post({ origin: docs.origin }, { text: "hi" })).status()).toBe(200)
})

test("phone layout", async ({ browser, browserName, docs }) => {
	// Firefox has no mobile emulation, so it gets the phone viewport and touch only.
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: browserName !== "firefox",
	})
	try {
		const page = await context.newPage()
		const problems = await open(page, docs.origin, "/docs/routing")
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
		expect(overflow).toBeLessThanOrEqual(0)
		await expect(page.locator("#sidebar")).toBeHidden()
		await page.locator("#nav").getByRole("link", { name: "Changelog" }).tap()
		await expect(page).toHaveURL(`${docs.origin}/changelog`)
		expect(problems).toEqual([])
	} finally {
		await context.close()
	}
})
