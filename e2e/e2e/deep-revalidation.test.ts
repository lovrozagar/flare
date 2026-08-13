import { expect, test } from "@playwright/test"

const SECRET = "e2e-test-secret"
const REVALIDATE_URL = "/_flare/revalidate"

test.describe("/_flare/revalidate endpoint", () => {
	test("POST revalidate by tags invalidates cached data", async ({ request }) => {
		/* Load page twice to populate + confirm cache hit */
		const res1 = await request.get("/kv-cache-test")
		const html1 = await res1.text()
		const ts1 = html1.match(/data-testid="kv-timestamp">(\d+)</)
		expect(ts1).not.toBeNull()

		const res2 = await request.get("/kv-cache-test")
		const html2 = await res2.text()
		const ts2 = html2.match(/data-testid="kv-timestamp">(\d+)</)
		expect(ts2?.[1]).toBe(ts1?.[1])

		/* Revalidate by tag */
		const revalRes = await request.post(REVALIDATE_URL, {
			data: { tags: ["kv-test"], tiers: ["ssr"] },
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": SECRET,
			},
		})
		expect(revalRes.status()).toBe(200)
		const revalJson = await revalRes.json()
		expect(revalJson.revalidated).toBe(true)
		expect(revalJson.tags).toEqual(["kv-test"])

		/* Next load should get fresh data (cache was purged) */
		const res3 = await request.get("/kv-cache-test")
		const html3 = await res3.text()
		const ts3 = html3.match(/data-testid="kv-timestamp">(\d+)</)
		expect(ts3).not.toBeNull()
		expect(ts3?.[1]).not.toBe(ts1?.[1])
	})

	test("GET revalidate rejected with 405 (secret leak prevention)", async ({ request }) => {
		const revalRes = await request.get(`${REVALIDATE_URL}?secret=${SECRET}&tags=kv-test&tiers=ssr`)
		expect(revalRes.status()).toBe(405)
	})

	test("returns 401 for wrong secret", async ({ request }) => {
		const res = await request.post(REVALIDATE_URL, {
			data: { tags: ["kv-test"], tiers: ["ssr"] },
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": "wrong-secret",
			},
		})
		expect(res.status()).toBe(401)
	})

	test("returns 401 for missing secret", async ({ request }) => {
		const res = await request.post(REVALIDATE_URL, {
			data: { tags: ["kv-test"], tiers: ["ssr"] },
			headers: { "content-type": "application/json" },
		})
		expect(res.status()).toBe(401)
	})

	test("returns 400 for missing tags and keys", async ({ request }) => {
		const res = await request.post(REVALIDATE_URL, {
			data: { tiers: ["ssr"] },
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": SECRET,
			},
		})
		expect(res.status()).toBe(400)
	})

	test("returns 400 for missing tiers", async ({ request }) => {
		const res = await request.post(REVALIDATE_URL, {
			data: { tags: ["kv-test"] },
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": SECRET,
			},
		})
		expect(res.status()).toBe(400)
	})

	test("returns 400 for invalid tier", async ({ request }) => {
		const res = await request.post(REVALIDATE_URL, {
			data: { tags: ["kv-test"], tiers: ["invalid"] },
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": SECRET,
			},
		})
		expect(res.status()).toBe(400)
	})
})
