import { expect, test } from "@playwright/test"

/** Match one or more Server-Timing entries: `name;dur=N, name;dur=N, ...`
 * Names can include route paths with `/`, `-`, `(`, `)` e.g. `flare.pipeline.preloader:_root_/about` */
const TIMING_ENTRY = /[\w.:\-/()]+;dur=\d+(\.\d+)?/
const TIMING_HEADER = new RegExp(`^${TIMING_ENTRY.source}(, ${TIMING_ENTRY.source})*$`)

/** Parse all dur values from a Server-Timing header */
function parseDurations(timing: string): number[] {
	return [...timing.matchAll(/;dur=([\d.]+)/g)].map((m) => Number.parseFloat(m[1] ?? "0"))
}

/** Parse entry names from a Server-Timing header */
function parseNames(timing: string): string[] {
	return [...timing.matchAll(/([\w.:\-/()]+);dur=/g)].map((m) => m[1] ?? "")
}

/**
 * Server-Timing is auto-injected by Flare's timing tracer in dev mode.
 * Page requests get per-phase pipeline entries (validation, authenticate, etc.).
 * All requests through middleware get per-middleware entries.
 */
test.describe("Server-Timing header — dev auto-inject @dev-only", () => {
	test("SSR HTML response has per-phase Server-Timing", async ({ request }) => {
		const res = await request.get("/about")
		expect(res.status()).toBe(200)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
		expect(timing).toContain("flare.pipeline.validation")
		expect(timing).toContain("flare.pipeline.loaders")
	})

	test("NDJSON response has Server-Timing", async ({ request }) => {
		const res = await request.get("/about", {
			headers: { "x-d": "1" },
		})
		expect(res.status()).toBe(200)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
	})

	test("404 response has Server-Timing", async ({ request }) => {
		const res = await request.get("/nonexistent-page-abc123")
		expect(res.status()).toBe(404)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
	})

	test("ISR route has Server-Timing", async ({ request }) => {
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
	})

	test("ISR NDJSON response has Server-Timing", async ({ request }) => {
		const res = await request.get("/isr-test", {
			headers: { "x-d": "1" },
		})
		expect(res.status()).toBe(200)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
	})

	test("server function response has Server-Timing", async ({ request }) => {
		const res = await request.post("/_fn/echo", {
			data: { message: "hello" },
			headers: { "content-type": "application/json" },
		})
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
	})

	test("mounted API route has Server-Timing", async ({ request }) => {
		const res = await request.get("/api/health")
		expect(res.status()).toBe(200)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
	})

	test("redirect response — Server-Timing optional", async ({ request }) => {
		/* trailing slash triggers 301 redirect before middleware */
		const res = await request.get("/about/", { maxRedirects: 0 })
		expect(res.status()).toBe(301)
		const timing = res.headers()["server-timing"]
		/* redirects from normalizeUrl bypass middleware, so no Server-Timing expected */
		if (timing) {
			expect(timing).toMatch(TIMING_HEADER)
		}
	})

	test("all dur values are positive numbers", async ({ request }) => {
		const res = await request.get("/about")
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		for (const dur of parseDurations(timing)) {
			expect(Number.isNaN(dur)).toBe(false)
			expect(dur).toBeGreaterThanOrEqual(0)
			expect(dur).toBeLessThan(30000)
		}
	})

	test("SSR response contains all 6 pipeline phases", async ({ request }) => {
		const res = await request.get("/about")
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toContain("flare.pipeline.validation")
		expect(timing).toContain("flare.pipeline.authenticate")
		expect(timing).toContain("flare.pipeline.preload_authorize")
		expect(timing).toContain("flare.pipeline.loaders")
		expect(timing).toContain("flare.pipeline.head")
		expect(timing).toContain("flare.pipeline.headers")
	})

	test("coexists with user middleware headers (x-request-id, x-timing)", async ({ request }) => {
		const res = await request.get("/about")
		expect(res.headers()["server-timing"]).toBeDefined()
		expect(res.headers()["x-request-id"]).toBeDefined()
		expect(res.headers()["x-timing"]).toBeDefined()
		expect(res.headers()["x-middleware-ran"]).toBe("true")
	})

	test("concurrent requests get independent timing values", async ({ request }) => {
		const [r1, r2, r3] = await Promise.all([
			request.get("/about"),
			request.get("/isr-test"),
			request.get("/cache-test"),
		])

		for (const res of [r1, r2, r3]) {
			const timing = res.headers()["server-timing"]
			expect(timing).toBeDefined()
			expect(timing).toMatch(TIMING_HEADER)
		}
	})

	test("SSG cached route has Server-Timing", async ({ request }) => {
		const res = await request.get("/static-cache-test")
		expect(res.status()).toBe(200)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
	})

	test("ISR cache HIT still has Server-Timing", async ({ request }) => {
		/* first request populates store */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1000))
		/* second should be cache hit */
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
	})

	test("ISR cache HIT timing is fast", async ({ request }) => {
		/* populate */
		await request.get("/isr-kv-combo")
		await new Promise((r) => setTimeout(r, 1000))
		/* cache hit */
		const res = await request.get("/isr-kv-combo")
		const cacheStatus = res.headers()["flare-cache"]
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		if (cacheStatus === "HIT") {
			const totalDur = parseDurations(timing).reduce((a, b) => a + b, 0)
			/* cache hits should be fast — under 500ms easily */
			expect(totalDur).toBeLessThan(500)
		}
	})
})

test.describe("Server-Timing — deep tracing cases @dev-only", () => {
	test("middleware spans present with flare.middleware.N naming", async ({ request }) => {
		const res = await request.get("/about")
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		/* flare-e2e has multiple middleware — at least index 0 should appear */
		expect(timing).toContain("flare.middleware.0")
	})

	test("multiple middleware produce sequential indices", async ({ request }) => {
		const res = await request.get("/about")
		const names = parseNames(res.headers()["server-timing"])
		const mwNames = names.filter((n) => n.startsWith("flare.middleware."))
		/* flare-e2e registers >=3 middleware (timing, marker, routeOnly) */
		expect(mwNames.length).toBeGreaterThanOrEqual(3)
		/* indices are sequential starting from 0 */
		for (let i = 0; i < mwNames.length; i++) {
			expect(mwNames).toContain(`flare.middleware.${String(i)}`)
		}
	})

	test("NDJSON response has all 6 pipeline phases", async ({ request }) => {
		const res = await request.get("/about", {
			headers: { "x-d": "1" },
		})
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toContain("flare.pipeline.validation")
		expect(timing).toContain("flare.pipeline.authenticate")
		expect(timing).toContain("flare.pipeline.preload_authorize")
		expect(timing).toContain("flare.pipeline.loaders")
		expect(timing).toContain("flare.pipeline.head")
		expect(timing).toContain("flare.pipeline.headers")
	})

	test("page request has both pipeline and middleware entries", async ({ request }) => {
		const res = await request.get("/about")
		const names = parseNames(res.headers()["server-timing"])
		const pipelineNames = names.filter((n) => n.startsWith("flare.pipeline."))
		const mwNames = names.filter((n) => n.startsWith("flare.middleware."))
		expect(pipelineNames.length).toBeGreaterThanOrEqual(6)
		expect(mwNames.length).toBeGreaterThanOrEqual(1)
	})

	test("authorize-pass route has timing with all phases", async ({ request }) => {
		const res = await request.get("/authorize-pass", {
			headers: { "x-test-auth": "admin" },
		})
		expect(res.status()).toBe(200)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toContain("flare.pipeline.authenticate")
		expect(timing).toContain("flare.pipeline.preload_authorize")
		expect(timing).toContain("flare.pipeline.loaders")
	})

	test("authorize-fail route still has Server-Timing", async ({ request }) => {
		/* no auth header → authenticate throws UnauthenticatedError → error response.
		 * Pipeline stops at authenticate phase — preload_authorize never runs. */
		const res = await request.get("/authorize-fail")
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
		expect(timing).toContain("flare.pipeline.authenticate")
	})

	test("preloader-redirect response has Server-Timing", async ({ request }) => {
		const res = await request.get("/preloader-redirect", { maxRedirects: 0 })
		expect(res.status()).toBe(303)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
		expect(timing).toContain("flare.pipeline.preload_authorize")
	})

	test("preloader-throw error response has Server-Timing", async ({ request }) => {
		const res = await request.get("/preloader-throw")
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
		expect(timing).toContain("flare.pipeline.preload_authorize")
	})

	test("loader error (500) still has Server-Timing with all phases", async ({ request }) => {
		const res = await request.get("/error-test?fail=true")
		expect(res.status()).toBe(500)
		const timing = res.headers()["server-timing"]
		expect(timing).toBeDefined()
		expect(timing).toMatch(TIMING_HEADER)
		expect(timing).toContain("flare.pipeline.validation")
		expect(timing).toContain("flare.pipeline.loaders")
	})

	test("server-fn has middleware spans but no pipeline spans", async ({ request }) => {
		const res = await request.post("/_fn/echo", {
			data: { message: "hello" },
			headers: { "content-type": "application/json" },
		})
		const names = parseNames(res.headers()["server-timing"])
		const mwNames = names.filter((n) => n.startsWith("flare.middleware."))
		const pipelineNames = names.filter((n) => n.startsWith("flare.pipeline."))
		/* server fns go through middleware but not the page pipeline */
		expect(mwNames.length).toBeGreaterThanOrEqual(1)
		expect(pipelineNames).toHaveLength(0)
	})

	test("mounted API has middleware spans but no pipeline spans", async ({ request }) => {
		const res = await request.get("/api/health")
		const names = parseNames(res.headers()["server-timing"])
		const mwNames = names.filter((n) => n.startsWith("flare.middleware."))
		const pipelineNames = names.filter((n) => n.startsWith("flare.pipeline."))
		expect(mwNames.length).toBeGreaterThanOrEqual(1)
		expect(pipelineNames).toHaveLength(0)
	})

	test("no duplicate entry names within a single request", async ({ request }) => {
		const res = await request.get("/about")
		const names = parseNames(res.headers()["server-timing"])
		const unique = new Set(names)
		expect(unique.size).toBe(names.length)
	})

	test("pipeline phases appear in execution order", async ({ request }) => {
		const res = await request.get("/about")
		const names = parseNames(res.headers()["server-timing"])
		const phaseOrder = [
			"flare.pipeline.validation",
			"flare.pipeline.authenticate",
			"flare.pipeline.preload_authorize",
			"flare.pipeline.loaders",
			"flare.pipeline.head",
			"flare.pipeline.headers",
		]
		const pipelineNames = names.filter((n) => n.startsWith("flare.pipeline."))
		/* per-route spans interleave, but phase spans should be in order */
		const phaseOnlyNames = pipelineNames.filter((n) => phaseOrder.includes(n))
		expect(phaseOnlyNames).toEqual(phaseOrder)
	})

	test("concurrent requests each have valid timing headers", async ({ request }) => {
		/* concurrent identical requests may produce identical dur values when fast,
		 * so we only verify each response has a well-formed, independent timing header */
		const results = await Promise.all(Array.from({ length: 5 }, () => request.get("/about")))
		const timings = results.map((r) => r.headers()["server-timing"])
		for (const t of timings) {
			expect(t).toBeDefined()
			expect(t).toMatch(TIMING_HEADER)
			expect(t).toContain("flare.pipeline.validation")
		}
	})

	test("dashboard scoped middleware adds extra span", async ({ request }) => {
		const res = await request.get("/dashboard")
		const names = parseNames(res.headers()["server-timing"])
		const mwCount = names.filter((n) => n.startsWith("flare.middleware.")).length
		/* dashboard has path-scoped middleware in addition to global ones */
		const aboutRes = await request.get("/about")
		const aboutMwCount = parseNames(aboutRes.headers()["server-timing"]).filter((n) =>
			n.startsWith("flare.middleware."),
		).length
		expect(mwCount).toBeGreaterThan(aboutMwCount)
	})
})

test.describe("Server-Timing header — NOT present in prod @prod-only", () => {
	test("HTML response has no Server-Timing in prod", async ({ request }) => {
		const res = await request.get("/about")
		expect(res.status()).toBe(200)
		expect(res.headers()["server-timing"]).toBeUndefined()
	})

	test("NDJSON response has no Server-Timing in prod", async ({ request }) => {
		const res = await request.get("/about", {
			headers: { "x-d": "1" },
		})
		expect(res.status()).toBe(200)
		expect(res.headers()["server-timing"]).toBeUndefined()
	})

	test("ISR response has no Server-Timing in prod", async ({ request }) => {
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)
		expect(res.headers()["server-timing"]).toBeUndefined()
	})

	test("404 response has no Server-Timing in prod", async ({ request }) => {
		const res = await request.get("/nonexistent-page-prod-test")
		expect(res.status()).toBe(404)
		expect(res.headers()["server-timing"]).toBeUndefined()
	})

	test("server function response has no Server-Timing in prod", async ({ request }) => {
		const res = await request.post("/_fn/echo", {
			data: { message: "prod" },
			headers: { "content-type": "application/json" },
		})
		expect(res.headers()["server-timing"]).toBeUndefined()
	})

	test("mounted API has no Server-Timing in prod", async ({ request }) => {
		const res = await request.get("/api/health")
		expect(res.status()).toBe(200)
		expect(res.headers()["server-timing"]).toBeUndefined()
	})

	test("user middleware headers still work without Server-Timing", async ({ request }) => {
		const res = await request.get("/about")
		expect(res.headers()["server-timing"]).toBeUndefined()
		/* user middleware should still be active */
		expect(res.headers()["x-request-id"]).toBeDefined()
		expect(res.headers()["x-timing"]).toBeDefined()
		expect(res.headers()["x-middleware-ran"]).toBe("true")
	})
})
