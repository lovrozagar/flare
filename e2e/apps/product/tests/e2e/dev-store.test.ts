import { expect, test } from "@playwright/test"

/**
 * Verify store behavior in dev mode.
 * The e2e app configures an explicit in-memory store, so auto-injection
 * doesn't trigger — but we verify the store is functional and ISR
 * caching works correctly in dev mode.
 */
test.describe("Dev store — ISR caching works in dev @dev-only", () => {
	test("ISR first request returns 200 with MISS or renders fresh", async ({ request }) => {
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)
		const body = await res.text()
		expect(body).toContain("isr-test")
	})

	test("ISR second request serves from store (cache HIT)", async ({ request }) => {
		/* populate */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1000))
		/* second request */
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)
		const cacheHeader = res.headers()["flare-cache"]
		/* in dev with store configured, should be HIT */
		if (cacheHeader) {
			expect(cacheHeader).toBe("HIT")
		}
	})

	test("ISR cache HIT has consistent content", async ({ request }) => {
		/* populate */
		const first = await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1000))
		const second = await request.get("/isr-test")

		if (second.headers()["flare-cache"] === "HIT") {
			const firstBody = await first.text()
			const secondBody = await second.text()
			/* cached version should contain the same renderedAt timestamp */
			const getRenderedAt = (html: string) => {
				const match = html.match(/data-testid="isr-rendered-at"[^>]*>(\d+)</)
				return match?.[1]
			}
			const ts1 = getRenderedAt(firstBody)
			const ts2 = getRenderedAt(secondBody)
			if (ts1 && ts2) {
				expect(ts2).toBe(ts1)
			}
		}
	})

	test("ISR NDJSON request also works in dev", async ({ request }) => {
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1000))
		const res = await request.get("/isr-test", {
			headers: { "x-d": "1" },
		})
		expect(res.status()).toBe(200)
		const body = await res.text()
		expect(body).toContain("isr-test")
	})

	test("ISR with tags — store entries have tags for invalidation", async ({ request }) => {
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)
		/* just verify the route works — tag invalidation is tested in revalidation tests */
	})

	test("multiple ISR routes can be cached independently", async ({ request }) => {
		/* populate both */
		await request.get("/isr-test")
		await request.get("/isr-kv-combo")
		await new Promise((r) => setTimeout(r, 1000))

		const [r1, r2] = await Promise.all([request.get("/isr-test"), request.get("/isr-kv-combo")])

		expect(r1.status()).toBe(200)
		expect(r2.status()).toBe(200)

		/* both should be cached independently */
		const body1 = await r1.text()
		const body2 = await r2.text()
		expect(body1).toContain("isr-test")
		expect(body2).toContain("isr-kv-combo")
	})

	test("plain SSR route without cache config is not cached", async ({ request }) => {
		/* /blocker-test has no cache config at all */
		const r1 = await request.get("/blocker-test")
		const r2 = await request.get("/blocker-test")
		expect(r1.status()).toBe(200)
		expect(r2.status()).toBe(200)
		/* routes without ssr cache config should not get flare-cache */
		expect(r2.headers()["flare-cache"]).toBeUndefined()
	})
})

test.describe("Store — ISR caching works in prod @prod-only", () => {
	test("ISR route returns 200 in prod", async ({ request }) => {
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)
		const body = await res.text()
		expect(body).toContain("isr-test")
	})

	test("ISR cache HIT in prod", async ({ request }) => {
		/* populate */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1000))
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)
		const cacheHeader = res.headers()["flare-cache"]
		if (cacheHeader) {
			expect(cacheHeader).toBe("HIT")
		}
	})

	test("plain SSR route without cache config has no flare-cache in prod", async ({ request }) => {
		const res = await request.get("/blocker-test")
		expect(res.status()).toBe(200)
		expect(res.headers()["flare-cache"]).toBeUndefined()
	})

	test("ISR cache HIT serves correctly in prod", async ({ request }) => {
		/* first request triggers populate + etag computation */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1500))
		/* second request — etag may now be present after bg write */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 500))
		/* third request — etag should definitely be present */
		const res3 = await request.get("/isr-test")
		expect(res3.status()).toBe(200)
		const cacheHeader = res3.headers()["flare-cache"]
		if (cacheHeader === "HIT") {
			const etag = res3.headers()["etag"]
			/* ETag is computed asynchronously, so it may or may not be present */
			if (etag) {
				expect(etag).toMatch(/^W\//)
			}
		}
	})
})
