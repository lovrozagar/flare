import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

test.describe("client cache", () => {
	test("revisit within staleTime keeps timestamp", async ({ page }) => {
		await loadPage(page, "/cache-test")
		const first = await page.getByTestId("cache-timestamp").textContent()
		await page.evaluate(() => {
			const nav = (window as unknown as { __flareNavigate: (to: string) => Promise<void> })
				.__flareNavigate
			return nav("/about")
		})
		await page.waitForURL("**/about")
		await page.evaluate(() => {
			const nav = (window as unknown as { __flareNavigate: (to: string) => Promise<void> })
				.__flareNavigate
			return nav("/cache-test")
		})
		await page.waitForURL("**/cache-test")
		await expect(page.getByTestId("cache-timestamp")).toHaveText(first ?? "")
	})
})

test.describe("KV / ISR / duration / Vary", () => {
	test("second SSR hit reuses KV call count", async ({ request }) => {
		const a = await request.get("/kv-cache-test")
		const b = await request.get("/kv-cache-test")
		expect(a.status()).toBe(200)
		expect(b.status()).toBe(200)
		const countA = (await a.text()).match(/data-testid="kv-call-count">(\d+)/)?.[1]
		const countB = (await b.text()).match(/data-testid="kv-call-count">(\d+)/)?.[1]
		expect(countA).toBeTruthy()
		expect(countB).toBe(countA)
	})

	test("ISR page renders", async ({ page }) => {
		await loadPage(page, "/isr-test")
		await expect(page.getByTestId("isr-source")).toHaveText("ssr")
		const ts = Number(await page.getByTestId("isr-rendered-at").textContent())
		expect(ts).toBeGreaterThan(0)
	})

	test("duration cache renders", async ({ page }) => {
		await page.goto("/duration-cache-test")
		expect(Number(await page.getByTestId("duration-timestamp").textContent())).toBeGreaterThan(0)
	})

	test("Vary includes x-d", async ({ request }) => {
		const res = await request.get("/")
		const vary = res.headers().vary ?? ""
		expect(vary.toLowerCase()).toContain("x-d")
	})

	test("Flare-Cache or Flare-Render header may appear on ISR", async ({ request }) => {
		const res = await request.get("/isr-test")
		const keys = Object.keys(res.headers())
		expect(keys.length).toBeGreaterThan(0)
	})

	test("second ISR request can HIT after populate", async ({ request }) => {
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 500))
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)
		const html = await res.text()
		expect(html).toContain('data-testid="isr-test"')
		const cache = res.headers()["flare-cache"]
		if (cache) {
			expect(["HIT", "STALE", "MISS"]).toContain(cache)
		}
	})

	test("ISR ETag is weak when present; If-None-Match still 200 with matching nonce", async ({
		request,
	}) => {
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 800))
		const res1 = await request.get("/isr-test")
		const etag = res1.headers()["etag"]
		if (res1.headers()["flare-cache"] === "HIT" && etag) {
			expect(etag).toMatch(/^W\//)
			const res2 = await request.get("/isr-test", { headers: { "If-None-Match": etag } })
			/* Body embeds a per-request CSP nonce — 304 would pair a new CSP with a
			   cached body and block ThemeScript. Always rewrite as 200. */
			expect(res2.status()).toBe(200)
			expect(res2.headers()["etag"]).toBe(etag)
			expect(res2.headers()["vary"] ?? "").toContain("x-d")
			const html = await res2.text()
			const headerNonce = /nonce-([a-f0-9]+)/.exec(res2.headers()["content-security-policy"] ?? "")
			const scriptNonce = /nonce="([a-f0-9]+)"/.exec(html)
			if (headerNonce && scriptNonce) {
				expect(scriptNonce[1]).toBe(headerNonce[1])
			}
		}
	})
})

test.describe("SSG / ISR param allowlist", () => {
	test("listed SSG slugs serve 200", async ({ request }) => {
		for (const slug of ["hello", "world"]) {
			const res = await request.get(`/ssg-dynamic/${slug}`)
			expect(res.status()).toBe(200)
			expect(await res.text()).toContain(`data-testid="ssg-dynamic-slug">${slug}`)
		}
	})

	test("unlisted SSG slug is 404", async ({ request }) => {
		const res = await request.get("/ssg-dynamic/nonexistent")
		expect(res.status()).toBe(404)
	})

	test("SSG static page renders", async ({ request }) => {
		const res = await request.get("/ssg-static")
		expect(res.status()).toBe(200)
		expect(await res.text()).toContain('data-testid="ssg-static"')
	})

	test("ISR dynamicParams false rejects unlisted slug", async ({ request }) => {
		const res = await request.get("/isr-allowlist/not-allowed")
		expect(res.status()).toBe(404)
	})

	test("listed ISR slugs HIT from prerender artifacts @prod-only @node-only", async ({
		request,
	}) => {
		for (const slug of ["alpha", "beta"]) {
			const res = await request.get(`/isr-allowlist/${slug}`)
			expect(res.status()).toBe(200)
			expect(await res.text()).toContain(`data-testid="isr-allowlist-slug">${slug}`)
			/* revalidate is 10s — a long suite can cross the window. STALE
			   still means the prerender artifact was served from the store. */
			expect(["HIT", "STALE"]).toContain(res.headers()["flare-cache"])
		}
	})
})
