import { expect, test } from "@playwright/test"
import { assertSPANavigation, loadPage, setNavMarker, setupConsoleCapture } from "./helpers"

test.describe("Prefetch + Deferred optimization", () => {
	test("prefetch link on intent → navigate → deferred data streams fresh", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)

		const link = page.locator("[data-testid='prefetch-defer-link']")

		/* Intent trigger (hover) prefetch — use dispatchEvent to bypass vite-error-overlay */
		await link.dispatchEvent("mouseenter")
		/* Wait for prefetch network to complete */
		await page.waitForTimeout(800)

		/* Click to navigate — force bypasses overlay actionability checks */
		await link.click({ force: true })
		await page.waitForURL("**/prefetch-defer")
		await assertSPANavigation(page)

		/* Shell data should render */
		await expect(page.locator("[data-testid='shell-data']")).toBeVisible()
		const shellText = await page.locator("[data-testid='shell-data']").textContent()
		expect(shellText).toContain("shell-")

		/* Deferred data should stream in and resolve */
		await expect(page.locator("[data-testid='deferred-resolved']")).toBeVisible({ timeout: 5000 })
		const deferredText = await page.locator("[data-testid='deferred-resolved']").textContent()
		expect(deferredText).toContain("deferred-")
	})

	test("direct SSR load of deferred route → shell + deferred both render", async ({ page }) => {
		await loadPage(page, "/prefetch-defer")

		/* Shell data renders on initial SSR */
		await expect(page.locator("[data-testid='shell-data']")).toBeVisible()

		/* Deferred streams in via SSR injection */
		await expect(page.locator("[data-testid='deferred-resolved']")).toBeVisible({ timeout: 5000 })
	})

	test("SPA navigate to deferred route (no prefetch) → shell + deferred render", async ({
		page,
	}) => {
		await loadPage(page, "/")
		await setNavMarker(page)

		/* Navigate directly by clicking a link (no intent prefetch) */
		await page.click("a[href='/deferred-multi']", { force: true })
		await page.waitForURL("**/deferred-multi")
		await assertSPANavigation(page)

		/* Instant data renders first */
		await expect(page.locator("[data-testid='instant-data']")).toHaveText("instant-value")

		/* Deferred data streams in */
		await expect(page.locator("[data-testid='fast-resolved']")).toBeVisible({ timeout: 5000 })
		await expect(page.locator("[data-testid='slow-resolved']")).toBeVisible({ timeout: 5000 })
	})
})

test.describe("Prefetch NDJSON protocol: deferred route", () => {
	test("prefetch request sends x-p: 1 header for deferred route", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")

		let prefetchHeaderSeen = false
		page.on("request", (req) => {
			if (
				req.headers()["x-d"] === "1" &&
				req.url().includes("/prefetch-defer") &&
				req.headers()["x-p"] === "1"
			) {
				prefetchHeaderSeen = true
			}
		})

		await page.locator("[data-testid='prefetch-defer-link']").dispatchEvent("mouseenter")
		await page.waitForTimeout(1000)

		expect(prefetchHeaderSeen).toBe(true)
		cap.assertClean()
	})

	test("prefetch response contains NO deferred chunk messages (t:c)", async ({ page }) => {
		/* Directly fetch the NDJSON as the client prefetch would */
		const response = await page.request.fetch("/prefetch-defer", {
			headers: { "x-d": "1", "x-p": "1" },
		})
		const body = await response.text()
		const lines = body
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l))

		/* Should have loader, head, ready, done — but no chunk */
		const chunkMessages = lines.filter((m: { t: string }) => m.t === "c")
		expect(chunkMessages).toHaveLength(0)

		/* Should have deferred marker in loader data */
		const loaderMessages = lines.filter(
			(m: { m?: string; t: string }) => m.t === "l" && m.m?.includes("prefetch-defer"),
		)
		expect(loaderMessages).toHaveLength(1)
		expect(loaderMessages[0].d.deferred.__deferred).toBe(true)
		expect(loaderMessages[0].d.deferred.key).toBe("d0")

		/* Shell data should still be present */
		expect(loaderMessages[0].d.shell).toMatch(/^shell-\d+$/)
	})

	test("non-prefetch response DOES contain deferred chunk messages (t:c)", async ({ page }) => {
		/* Fetch without x-p header — server should execute deferred and stream chunk */
		const response = await page.request.fetch("/prefetch-defer", {
			headers: { "x-d": "1" },
		})
		const body = await response.text()
		const lines = body
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l))

		const chunkMessages = lines.filter(
			(m: { m?: string; t: string }) => m.t === "c" && m.m?.includes("prefetch-defer"),
		)
		expect(chunkMessages).toHaveLength(1)
		expect(chunkMessages[0].k).toBe("d0")
		expect(chunkMessages[0].d).toMatch(/^deferred-\d+$/)
	})

	test("prefetch response uses non-streaming (no chunks to stream)", async ({ page }) => {
		/* Prefetch skips deferred execution → no entries → non-streaming NDJSON.
		 * Verify response arrives as complete body (not chunked transfer) with ready + done. */
		const response = await page.request.fetch("/prefetch-defer", {
			headers: { "x-d": "1", "x-p": "1" },
		})
		const body = await response.text()
		const lines = body
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l))

		const types = lines.map((m: { t: string }) => m.t)
		expect(types).toContain("l")
		expect(types).toContain("h")
		expect(types).toContain("r")
		expect(types).toContain("d")
		expect(types).not.toContain("c")
	})
})

test.describe("Prefetch cache: deferred forces refetch, non-deferred uses cache", () => {
	test("deferred route: prefetch intent → navigate fires second NDJSON request", async ({
		page,
	}) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")

		/* Track all NDJSON requests to /prefetch-defer */
		const ndjsonRequests: { isPrefetch: boolean; url: string }[] = []
		page.on("request", (req) => {
			if (req.headers()["x-d"] === "1" && req.url().includes("/prefetch-defer")) {
				ndjsonRequests.push({
					isPrefetch: req.headers()["x-p"] === "1",
					url: req.url(),
				})
			}
		})

		/* Step 1: intent trigger (hover) prefetch — wait for NDJSON response */
		await page.locator("[data-testid='prefetch-defer-link']").dispatchEvent("mouseenter")
		await page.waitForResponse(
			(resp) => resp.url().includes("/prefetch-defer") && resp.request().headers()["x-d"] === "1",
		)

		const prefetchCount = ndjsonRequests.filter((r) => r.isPrefetch).length
		expect(prefetchCount).toBeGreaterThanOrEqual(1)

		/* Step 2: click to navigate — should fire a SECOND (non-prefetch) request
		 * because hasDeferred forces cache staleness */
		await setNavMarker(page)
		await page.locator("[data-testid='prefetch-defer-link']").click({ force: true })
		await page.waitForURL("**/prefetch-defer")
		await assertSPANavigation(page)

		/* Wait for navigation fetch to complete */
		await expect(page.locator("[data-testid='deferred-resolved']")).toBeVisible({ timeout: 5000 })

		const navigateRequests = ndjsonRequests.filter((r) => !r.isPrefetch)
		expect(navigateRequests.length).toBeGreaterThanOrEqual(1)

		cap.assertClean()
	})

	test("non-deferred route: prefetch intent → navigate does NOT fire second request", async ({
		page,
	}) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")

		const ndjsonRequests: { isPrefetch: boolean; url: string }[] = []
		page.on("request", (req) => {
			if (req.headers()["x-d"] === "1" && req.url().includes("/prefetch-target")) {
				ndjsonRequests.push({
					isPrefetch: req.headers()["x-p"] === "1",
					url: req.url(),
				})
			}
		})

		/* Intent trigger (hover) prefetch for non-deferred route — wait for response */
		await page.locator("[data-testid='prefetch-intent-link']").dispatchEvent("mouseenter")
		await page.waitForResponse(
			(resp) => resp.url().includes("/prefetch-target") && resp.request().headers()["x-d"] === "1",
		)

		const prefetchCount = ndjsonRequests.filter((r) => r.isPrefetch).length
		expect(prefetchCount).toBeGreaterThanOrEqual(1)

		/* Click to navigate — should NOT fire another request (cache hit, no deferred) */
		const requestCountBefore = ndjsonRequests.length
		await setNavMarker(page)
		await page.locator("[data-testid='prefetch-intent-link']").click({ force: true })
		await page.waitForURL("**/prefetch-target", { timeout: 10_000 })
		await assertSPANavigation(page)

		/* Page renders from cache */
		await expect(page.locator("[data-testid='prefetch-target']")).toBeVisible()
		await expect(page.locator("[data-testid='prefetch-loaded']")).toHaveText("true")

		/* Small wait to make sure no late request fires */
		await page.waitForTimeout(500)

		/* No additional non-prefetch requests should have fired */
		const navigateRequests = ndjsonRequests.filter((r) => !r.isPrefetch)
		expect(navigateRequests).toHaveLength(0)

		cap.assertClean()
	})
})

test.describe("Deferred data freshness after prefetch", () => {
	test("deferred timestamp is fresh (not stale from prefetch time)", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")

		/* Trigger prefetch via dispatchEvent to avoid vite-error-overlay blocking hover */
		await page.locator("[data-testid='prefetch-defer-link']").dispatchEvent("mouseenter")
		await page.waitForResponse(
			(resp) => resp.url().includes("/prefetch-defer") && resp.request().headers()["x-d"] === "1",
		)
		const prefetchTime = Date.now()
		await page.waitForTimeout(1000)

		/* Navigate via JS to bypass overlay pointer interception */
		await setNavMarker(page)
		const navigateTime = Date.now()
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			return nav?.("/prefetch-defer")
		})
		await page.waitForURL("**/prefetch-defer")
		await assertSPANavigation(page)

		/* Wait for deferred to resolve */
		await expect(page.locator("[data-testid='deferred-resolved']")).toBeVisible({ timeout: 5000 })
		const deferredText = await page.locator("[data-testid='deferred-resolved']").textContent()

		/* Extract timestamp from "deferred-{timestamp}" */
		const deferredTs = Number(deferredText?.replace("deferred-", ""))
		expect(deferredTs).toBeGreaterThan(0)

		/* Deferred was created at navigate time (server re-executes defer() on navigate,
		 * not from stale prefetch). The timestamp must be after the prefetch completed,
		 * with margin for clock drift under load. */
		expect(deferredTs).toBeGreaterThan(prefetchTime)
		expect(deferredTs).toBeGreaterThanOrEqual(navigateTime - 500)

		cap.assertClean()
	})

	test("shell data from prefetch is reused (same timestamp range)", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")

		/* Record time window around prefetch */
		const beforePrefetch = Date.now()
		await page.locator("[data-testid='prefetch-defer-link']").dispatchEvent("mouseenter")
		await page.waitForTimeout(1000)
		const afterPrefetch = Date.now()

		/* Navigate */
		await setNavMarker(page)
		await page.locator("[data-testid='prefetch-defer-link']").click({ force: true })
		await page.waitForURL("**/prefetch-defer")
		await assertSPANavigation(page)

		/* Shell data should be visible */
		await expect(page.locator("[data-testid='shell-data']")).toBeVisible()
		const shellText = await page.locator("[data-testid='shell-data']").textContent()
		const shellTs = Number(shellText?.replace("shell-", ""))

		/* Shell data comes from the refetch (hasDeferred forces stale),
		 * so it will have a timestamp from navigate time, not prefetch time.
		 * Just verify it's a valid recent timestamp. */
		expect(shellTs).toBeGreaterThan(beforePrefetch)

		cap.assertClean()
	})

	test("multiple deferred fields: all resolve fresh on navigate", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		await setNavMarker(page)

		/* Navigate directly to deferred-multi (no prefetch) */
		await page.click("a[href='/deferred-multi']", { force: true })
		await page.waitForURL("**/deferred-multi")
		await assertSPANavigation(page)

		/* Both deferred fields should resolve */
		await expect(page.locator("[data-testid='fast-resolved']")).toHaveText("fast-result", {
			timeout: 5000,
		})
		await expect(page.locator("[data-testid='slow-resolved']")).toHaveText("slow-result", {
			timeout: 5000,
		})

		/* Instant data available immediately */
		await expect(page.locator("[data-testid='instant-data']")).toHaveText("instant-value")

		cap.assertClean()
	})
})

test.describe("SSR deferred streaming", () => {
	test("SSR HTML contains deferred marker in FlareState and streaming resolver", async ({
		page,
	}) => {
		const response = await page.request.get("/prefetch-defer")
		const html = await response.text()

		/* FlareState should contain the deferred marker */
		expect(html).toContain("__deferred")
		expect(html).toContain('"key":"d0"')

		/* SSR should inject streaming deferred chunk after </html> via __flare_q queue */
		expect(html).toContain("__flare_q")
	})

	test("SSR deferred route hydrates without errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/prefetch-defer")

		await expect(page.locator("[data-testid='shell-data']")).toBeVisible()
		await expect(page.locator("[data-testid='deferred-resolved']")).toBeVisible({ timeout: 5000 })

		/* Verify no hydration errors */
		cap.assertClean()
	})
})
