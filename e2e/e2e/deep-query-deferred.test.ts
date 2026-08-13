import { expect, test } from "@playwright/test"
import {
	assertSPANavigation,
	BASE,
	loadPage,
	navigateSPA,
	setNavMarker,
	setupConsoleCapture,
} from "./helpers"

/* ── 1. SSR deferred QC streaming ──────────────────────────────────────── */

test.describe("QueryClient: deferred streaming (SSR)", () => {
	test("SSR page loads with deferred query data visible", async ({ page }) => {
		const capture = setupConsoleCapture(page)
		await loadPage(page, "/query-deferred")

		/* shell data renders immediately */
		await expect(page.locator("[data-testid=shell]")).toHaveText("ready")

		/* deferred QC data should stream in and useSuspenseQuery should pick it up */
		await expect(page.locator("[data-testid=deferred-item]")).toHaveText("from-deferred", {
			timeout: 10_000,
		})

		capture.assertClean()
	})

	test("__flare_qc script present in streamed HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/query-deferred`)
		const html = await response.text()
		/* shell data in initial HTML */
		expect(html).toContain("ready")
		/* __flare_qc script should be streamed after </body> */
		expect(html).toContain("__flare_qc")
		/* deferred data should contain our QC entry */
		expect(html).toContain("from-deferred")
		expect(html).toContain("deferred-item")
	})

	test("initial self.flare.q has fallback, __flare_qc overrides it", async ({ page }) => {
		const response = await page.request.get(`${BASE}/query-deferred`)
		const html = await response.text()
		/* self.flare.q has the initial queryFn result (fallback) */
		const flareQMatch = html.match(/self\.flare\.q=(\[.*?\]);/)
		expect(flareQMatch).toBeTruthy()
		const initialQ = JSON.parse(flareQMatch?.[1] ?? "[]") as Array<{
			data: unknown
			key: unknown[]
		}>
		const deferredEntry = initialQ.find(
			(e) => JSON.stringify(e.key) === JSON.stringify(["deferred-item"]),
		)
		expect(deferredEntry).toBeTruthy()
		expect((deferredEntry?.data as { name: string }).name).toBe("fallback")

		/* __flare_qc has the deferred override */
		expect(html).toContain('"name":"from-deferred"')
	})

	test("no hydration mismatch with deferred QC", async ({ page }) => {
		const warnings: string[] = []
		page.on("console", (msg) => {
			const text = msg.text()
			if (text.toLowerCase().includes("hydration") || text.toLowerCase().includes("mismatch")) {
				warnings.push(text)
			}
		})
		await loadPage(page, "/query-deferred")
		await expect(page.locator("[data-testid=deferred-item]")).toHaveText("from-deferred", {
			timeout: 10_000,
		})
		expect(warnings).toEqual([])
	})
})

/* ── 2. SPA navigation to deferred page ────────────────────────────────── */

test.describe("QueryClient: deferred streaming (SPA nav)", () => {
	test("SPA navigation to deferred page works", async ({ page }) => {
		await loadPage(page, "/query-basic")
		await navigateSPA(page, "/query-deferred")

		await expect(page.locator("[data-testid=shell]")).toHaveText("ready")
		await expect(page.locator("[data-testid=deferred-item]")).toHaveText("from-deferred", {
			timeout: 10_000,
		})
	})

	test("SPA navigate from deferred to basic preserves basic data", async ({ page }) => {
		await loadPage(page, "/query-deferred")
		await expect(page.locator("[data-testid=deferred-item]")).toHaveText("from-deferred", {
			timeout: 10_000,
		})

		await navigateSPA(page, "/query-basic")
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42")
	})

	test("SPA navigate preserves marker (no full reload)", async ({ page }) => {
		await loadPage(page, "/query-basic")
		await setNavMarker(page)
		await page.evaluate((path) => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			return nav(path)
		}, "/query-deferred")
		await page.waitForURL("**/query-deferred", { timeout: 10_000 })
		await assertSPANavigation(page)
	})
})

/* ── 3. NDJSON data request contains "q" messages ──────────────────────── */

test.describe("QueryClient: deferred NDJSON", () => {
	test("NDJSON data request contains q message for deferred QC", async ({ page }) => {
		const response = await page.request.get(`${BASE}/query-deferred`, {
			headers: { "x-d": "1" },
		})
		const text = await response.text()
		const lines = text.trim().split("\n")
		const qMessages = lines
			.map((l) => JSON.parse(l) as { t: string; d?: unknown })
			.filter((m) => m.t === "q")

		expect(qMessages.length).toBeGreaterThan(0)
		const firstQ = qMessages[0]
		expect(Array.isArray(firstQ.d)).toBe(true)
		const entries = firstQ.d as Array<{ data: unknown; key: unknown[] }>
		const deferredEntry = entries.find(
			(e) => JSON.stringify(e.key) === JSON.stringify(["deferred-item"]),
		)
		expect(deferredEntry).toBeTruthy()
		expect((deferredEntry?.data as { name: string }).name).toBe("from-deferred")
	})

	test("NDJSON has correct message order: l, r, c, q, d", async ({ page }) => {
		const response = await page.request.get(`${BASE}/query-deferred`, {
			headers: { "x-d": "1" },
		})
		const text = await response.text()
		const types = text
			.trim()
			.split("\n")
			.map((l) => (JSON.parse(l) as { t: string }).t)

		/* l (loader), r (ready), c (chunk), q (query cache), d (done) */
		const rIdx = types.indexOf("r")
		const qIdx = types.indexOf("q")
		const dIdx = types.indexOf("d")

		expect(rIdx).toBeGreaterThan(-1)
		expect(qIdx).toBeGreaterThan(rIdx)
		expect(dIdx).toBeGreaterThan(qIdx)
	})
})

/* ── 4. Clean operation ────────────────────────────────────────────────── */

test.describe("QueryClient: deferred clean operation", () => {
	test("query-deferred clean console", async ({ page }) => {
		const capture = setupConsoleCapture(page)
		await loadPage(page, "/query-deferred")
		await expect(page.locator("[data-testid=deferred-item]")).toHaveText("from-deferred", {
			timeout: 10_000,
		})
		capture.assertClean()
	})
})
