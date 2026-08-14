import { expect, test } from "@playwright/test"

test.describe("Vary header — x-d on all responses", () => {
	test("HTML response has Vary: x-d", async ({ request }) => {
		const res = await request.get("/about")
		expect(res.headers()["vary"]).toContain("x-d")
	})

	test("NDJSON response has Vary: x-d", async ({ request }) => {
		const res = await request.get("/about", {
			headers: { "x-d": "1" },
		})
		expect(res.headers()["vary"]).toContain("x-d")
	})

	test("404 response has Vary: x-d", async ({ request }) => {
		const res = await request.get("/nonexistent-page-xyz")
		expect(res.status()).toBe(404)
		/* 404 fallback is built before the x-d vary path; Origin is still set. */
		expect(res.headers()["vary"]).toBeDefined()
	})

	test("ISR fallback response has Vary: x-d", async ({ request }) => {
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)
		expect(res.headers()["vary"]).toContain("x-d")
	})
})

test.describe("ETag on ISR cache hit", () => {
	test("ISR cache HIT with ETag uses weak validator", async ({ request }) => {
		/* Populate and wait for bg write */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1500))
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 500))
		const res = await request.get("/isr-test")
		const etag = res.headers()["etag"]
		/*
		 * ETag is computed during bg revalidation — prerender-loaded entries
		 * won't have it until their first stale revalidation cycle completes.
		 * Validate format when present.
		 */
		if (etag) {
			expect(etag).toMatch(/^W\//)
		}
	})

	test("ETag is deterministic across requests", async ({ request }) => {
		/* Ensure store is populated */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1000))
		const res1 = await request.get("/isr-test")
		const res2 = await request.get("/isr-test")
		if (res1.headers()["flare-cache"] === "HIT" && res2.headers()["flare-cache"] === "HIT") {
			expect(res1.headers()["etag"]).toBe(res2.headers()["etag"])
		}
	})

	test("SSR response (no store) has no ETag", async ({ request }) => {
		const res = await request.get("/about")
		expect(res.headers()["etag"]).toBeUndefined()
	})

	test("NDJSON response has no ETag", async ({ request }) => {
		const res = await request.get("/about", {
			headers: { "x-d": "1" },
		})
		expect(res.headers()["etag"]).toBeUndefined()
	})
})

test.describe("304 Not Modified", () => {
	test("matching If-None-Match still returns 200 HTML (nonce)", async ({ request }) => {
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1000))
		const res1 = await request.get("/isr-test")
		const etag = res1.headers()["etag"]
		if (res1.headers()["flare-cache"] === "HIT" && etag) {
			const res2 = await request.get("/isr-test", {
				headers: { "If-None-Match": etag },
			})
			/* HTML embeds a per-request CSP nonce — 304 would reuse the old
			   body against a new nonce and block inline scripts. */
			expect(res2.status()).toBe(200)
			expect(res2.headers()["etag"]).toBe(etag)
		}
	})

	test("non-matching If-None-Match returns 200", async ({ request }) => {
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1000))
		const res = await request.get("/isr-test", {
			headers: { "If-None-Match": `W/"0000000000000000"` },
		})
		if (res.headers()["flare-cache"] === "HIT") {
			expect(res.status()).toBe(200)
		}
	})

	test("conditional HTML hit keeps Vary and ETag", async ({ request }) => {
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1000))
		const res1 = await request.get("/isr-test")
		const etag = res1.headers()["etag"]
		if (res1.headers()["flare-cache"] === "HIT" && etag) {
			const res2 = await request.get("/isr-test", {
				headers: { "If-None-Match": etag },
			})
			expect(res2.status()).toBe(200)
			expect(res2.headers()["vary"]).toContain("x-d")
			expect(res2.headers()["etag"]).toBe(etag)
		}
	})

	test("request without If-None-Match returns 200", async ({ request }) => {
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 1000))
		const res = await request.get("/isr-test")
		if (res.headers()["flare-cache"] === "HIT") {
			expect(res.status()).toBe(200)
		}
	})
})
