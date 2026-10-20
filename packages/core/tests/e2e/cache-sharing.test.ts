import { writeFileSync } from "node:fs"
import type { APIRequestContext, Browser, Page, TestInfo } from "@playwright/test"
import { expect, serverOf, signedIn, test as dashboardTest } from "./dashboard.fixture.ts"
import { fnId, sessionCookie, test as docsTest, wire } from "./docs.fixture.ts"
import { sharedCache, type Decision, type SharedCache } from "./shared-cache.ts"

// What one visitor gets never reaches another through a shared cache (plan 21 5.3, plan 28). Each production runtime
// sits behind tests/e2e/shared-cache.ts, a cache at the permissive edge of RFC 9111 and RFC 9213: it stores whatever a
// compliant cache may, a heuristic freshness included, and replays a stored Set-Cookie. A cache acts on the server's
// headers alone, so one engine is enough.

const SHARED_RUNTIMES = ["node-prod", "bun-prod", "workers-prod"]

function sharedOnly(info: TestInfo, browserName: string): void {
	dashboardTest.skip(
		browserName !== "chromium" || !SHARED_RUNTIMES.includes(serverOf(info)),
		"a cache acts on headers: production runtimes, one engine",
	)
}

// The invariant the visible checks rest on, over every answer the run saw: what the cache stores carries no
// Set-Cookie, and what carries Set-Cookie is private or no-store, so no compliant cache can hand one visitor's cookie
// to another, whether or not the page shows it.
function invariant(cache: SharedCache): void {
	const keepsCookie = cache.decisions.filter((entry) => entry.stored && entry.setCookie)
	const openCookie = cache.decisions.filter(
		(entry: Decision) => entry.setCookie && !/\b(private|no-store)\b/.test(entry.cacheControl ?? ""),
	)
	expect(keepsCookie.map((entry) => entry.url)).toEqual([])
	expect(openCookie.map((entry) => entry.url)).toEqual([])
}

// Every answer the run saw, with the cache's decision for it, beside the case: CI uploads it with the results.
async function recorded(info: TestInfo, cache: SharedCache): Promise<void> {
	const path = info.outputPath("cache-decisions.json")
	writeFileSync(path, JSON.stringify(cache.decisions, null, 2))
	await info.attach("cache decisions", { path, contentType: "application/json" })
}

// The GET URLs a page asked through the cache, as paths with their search.
function asked(page: Page, origin: string): Set<string> {
	const urls = new Set<string>()
	page.on("request", (request) => {
		if (request.method() !== "GET" || !request.url().startsWith(origin)) return
		const url = new URL(request.url())
		urls.add(`${url.pathname}${url.search}`)
	})
	return urls
}

// Another visitor asks every URL: its bodies never hold the first visitor's marks, and it never gets their session.
async function replay(
	request: APIRequestContext,
	from: { origin: string; urls: Iterable<string>; marks: readonly string[]; session: string },
): Promise<void> {
	for (const url of from.urls) {
		const response = await request.get(`${from.origin}${url}`, { maxRedirects: 0 })
		const body = await response.text()
		for (const mark of from.marks) expect(body.includes(mark), `${url} holds ${mark}`).toBe(false)
		const cookies = response.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie")
		expect(
			cookies.some((header) => header.value.includes(from.session)),
			`${url} sets the session`,
		).toBe(false)
	}
}

async function visitor(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
	const context = await browser.newContext()
	return { page: await context.newPage(), close: () => context.close() }
}

dashboardTest("visitors behind a shared cache", async ({ page, dashboard, browser, browserName }, info) => {
	sharedOnly(info, browserName)
	const cache = await sharedCache(dashboard.origin)
	const other = await visitor(browser)
	const anonymous = await browser.newContext()
	try {
		const urls = asked(page, cache.origin)
		const email = await signedIn(page, cache.origin, "/app/settings/profile")
		const name = `Alice ${Math.random().toString(36).slice(2, 10)}`
		await page.locator("#profile-name").fill(name)
		await page.locator("#profile-save").click()
		await expect(page.locator("#profile-state")).toHaveText("Saved")
		// Each section by its sidebar link, hovered first so its prefetch goes through the cache too. The overview's live
		// feed never lets the network go idle, so each step waits for its URL.
		for (const [link, path] of [
			["Overview", /\/app\/overview$/],
			["Projects", /\/app\/projects/],
			["Billing", /\/app\/settings\/billing$/],
			["Settings", /\/app\/settings\/profile$/],
			["Projects", /\/app\/projects/],
		] as const) {
			const target = page.locator("#sidebar").getByRole("link", { name: link })
			await target.hover()
			await target.click()
			await page.waitForURL(path)
		}
		await page.locator("tr[data-id] a").first().click()
		await page.waitForURL(/\/app\/projects\/\d+/)
		const csv = await page.request.get(`${cache.origin}/app/reports/export.csv`)
		expect(csv.status()).toBe(200)
		urls.add("/app/reports/export.csv")
		const session = (await page.context().cookies()).find((cookie) => cookie.name.includes("session"))?.value ?? ""
		expect(session).not.toBe("")
		await signedIn(other.page, cache.origin, "/app/overview")
		const marks = [email, name]
		await replay(other.page.context().request, { origin: cache.origin, urls, marks, session })
		await replay(anonymous.request, { origin: cache.origin, urls, marks, session })
		const front = await anonymous.request.get(`${cache.origin}/app/overview`, { maxRedirects: 0 })
		// Signed out, an app page is the layout's 401 document, which the client replaces with sign-in (bits/17).
		expect(front.status()).toBe(401)
		invariant(cache)
	} finally {
		await recorded(info, cache)
		await anonymous.close()
		await other.close()
		await cache.close()
	}
})

// Pages Flare marks public are what the cache shares: a signed-in reader's copy of a public page is the second
// visitor's hit, the same bytes, rendered as the anonymous request, with nothing of the reader's (dx/cache.md).
docsTest("public pages shared", async ({ page, docs, browser, browserName }, info) => {
	sharedOnly(info, browserName)
	const cache = await sharedCache(docs.origin)
	const anonymous = await browser.newContext()
	try {
		const reader = `reader${Math.random().toString(36).slice(2, 10)}`
		await page.context().addCookies([sessionCookie(cache.origin, reader, "admin")])
		// Tagged URLs: a tagless document under the optional locale root negotiates its locale, so it is private by design
		// (dx/features.md, docs-routing `segment cdn`).
		const paths = ["/hr", "/hr/api/server/create-server"]
		const first: string[] = []
		for (const path of paths) {
			const response = await page.request.get(`${cache.origin}${path}`)
			expect(response.status(), path).toBe(200)
			first.push(await response.text())
		}
		const second: string[] = []
		for (const path of paths) second.push(await (await anonymous.request.get(`${cache.origin}${path}`)).text())
		expect(second).toEqual(first)
		expect(cache.hits).toEqual(paths.map((path) => `GET ${path}`))
		for (const body of first) expect(body.includes(reader)).toBe(false)
		invariant(cache)
	} finally {
		await recorded(info, cache)
		await anonymous.close()
		await cache.close()
	}
})

// The cache-control and the NDJSON lines' statuses of one GET of `buildSteps`, through the cache or not.
async function steps(origin: string, fail: boolean): Promise<[string | null, number[]]> {
	const input = encodeURIComponent(JSON.stringify(wire({ fail })))
	const response = await fetch(`${origin}/_flare/fn/${fnId("src/fns/build-log.ts", "buildSteps")}?_i=${input}`)
	const lines = (await response.text()).trimEnd().split("\n")
	return [response.headers.get("cache-control"), lines.map((line) => Number(JSON.parse(line).status))]
}

// A cached GET `.stream()` is held before it is answered, since its Cache-Control goes out first: a run that throws
// after its first step is private with its error line, so no cache keeps it and a second visitor reaches the origin; a
// run that ends cleanly is public and the second visitor's hit (RFC 9111, BUGS.md 383).
docsTest("public stream held", async ({ docs, browserName }, info) => {
	sharedOnly(info, browserName)
	const cache = await sharedCache(docs.origin)
	try {
		for (const visitor of ["first", "second"]) {
			expect([visitor, ...(await steps(cache.origin, true))]).toEqual([visitor, "private, no-store", [200, 500]])
		}
		const whole = ["public, max-age=60", [200, 200, 200]]
		expect([await steps(cache.origin, false), await steps(cache.origin, false)]).toEqual([whole, whole])
		const id = fnId("src/fns/build-log.ts", "buildSteps")
		expect(cache.hits.map((hit) => hit.includes(id))).toEqual([true])
		invariant(cache)
	} finally {
		await recorded(info, cache)
		await cache.close()
	}
})
