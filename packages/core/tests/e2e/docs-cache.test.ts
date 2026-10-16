import { writeFileSync } from "node:fs"
import type { Page } from "@playwright/test"
import { dataRequests, deepOnly, expect, fnId, open, prodOnly, serverOf, sessionCookie, test } from "./docs.fixture.ts"

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

const HOLD_STATS = fnId("src/fns/stats-gate.ts", "holdStats")
const RELEASE_STATS = fnId("src/fns/stats-gate.ts", "releaseStats")

// Every data body's chunks as the page reads them: when each arrived, in ms after the click that `mark` stamps, its
// size, and the frames it held (`t` and `k`), so a failure shows whether a value never came or never painted.
async function traceData(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const chunks: unknown[] = []
		Reflect.set(window, "__flareChunks", chunks)
		const real = window.fetch.bind(window)
		window.fetch = async (input, init) => {
			const response = await real(input, init)
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
			if (!url.includes("_flare=") || response.body === null) return response
			const [kept, read] = response.body.tee()
			void (async () => {
				const reader = read.getReader()
				const decoder = new TextDecoder()
				for (let step = await reader.read(); !step.done; step = await reader.read()) {
					const text = decoder.decode(step.value, { stream: true })
					const frames = [...text.matchAll(/"t":"(\w)"(?:,"m":"[^"]*")?(?:,"k":"(\w+)")?/g)].map(
						(m) => m[1] + (m[2] ?? ""),
					)
					const at = Math.round(performance.now() - Number(Reflect.get(window, "__flareClick") ?? 0))
					chunks.push({ url: url.replace(location.origin, ""), at, bytes: step.value.byteLength, frames })
				}
				chunks.push({ url: url.replace(location.origin, ""), closed: true })
			})()
			return new Response(kept, response)
		}
	})
}

const mark = (page: Page) => page.evaluate(() => Reflect.set(window, "__flareClick", performance.now()))

// On a failed wait for `#stats`: whether its skeleton is on screen, the outlet's markup, and every data chunk's
// timing, attached to the case, so the failure carries its own answer (BUGS.md 102.4).
async function statsShown(page: Page): Promise<void> {
	try {
		await expect(page.locator("#stats")).toBeVisible()
	} catch (error) {
		const state = await page.evaluate(() => ({
			statsLoading: document.getElementById("stats-loading") !== null,
			stats: document.getElementById("stats") !== null,
			outlet: (document.querySelector("main")?.outerHTML ?? "").slice(0, 6000),
			chunks: Reflect.get(window, "__flareChunks"),
		}))
		// A file beside the case, so CI's uploaded test results carry it.
		const path = test.info().outputPath("stats-diagnostics.json")
		writeFileSync(path, JSON.stringify(state, null, 2))
		await test.info().attach("stats diagnostics", { path, contentType: "application/json" })
		throw error
	}
}

// A client navigation to the changelog paints the held `stats` skeleton, then the value once the server releases it:
// the gate holds `stats` until the skeleton is seen, so a value that never paints reads apart from one that arrives
// late. A second visit inside staleTime is served from the client cache with no request (BUGS.md 102.4).
test("cache deferred", async ({ page, http, docs }) => {
	const call = (id: string) =>
		http.post(`${docs.origin}/_flare/fn/${id}`, { headers: { origin: docs.origin }, data: {} })
	await traceData(page)
	await open(page, docs.origin, "/")
	expect(await (await call(HOLD_STATS)).json()).toMatchObject({ data: { held: true } })
	try {
		await mark(page)
		await page.locator("#nav").getByRole("link", { name: "Changelog" }).click()
		await expect(page.locator("#stats-loading")).toBeVisible()
		await expect(page.locator("#stats")).toHaveCount(0)
	} finally {
		expect((await call(RELEASE_STATS)).status()).toBe(200)
	}
	await statsShown(page)
	await page.locator("#nav").getByRole("link", { name: "Playground" }).click()
	await expect(page.locator("#echo-send")).toBeVisible()
	const requests = dataRequests(page)
	await mark(page)
	await page.locator("#nav").getByRole("link", { name: "Changelog" }).click()
	await statsShown(page)
	expect(requests.filter((seen) => seen.path === "/changelog")).toEqual([])
})

test("store per runtime", async ({ http, docs }, info) => {
	const response = await http.get(`${docs.origin}/`)
	expect(response.headers()["x-docs-store"]).toBe(serverOf(info).startsWith("workers") ? "cache-api" : "fs")
})
