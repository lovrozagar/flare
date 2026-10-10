import { expect, test } from "@playwright/test";
import { BASE } from "./helpers";

test.describe("server-fn ctx.revalidate", () => {
	test("POST to server-fn that calls ctx.revalidate purges cached data", async ({ request }) => {
		/* Load page twice to populate + confirm cache hit */
		const res1 = await request.get(`${BASE}/kv-cache-test`);
		const html1 = await res1.text();
		const ts1 = html1.match(/data-testid="kv-timestamp">(\d+)</);
		expect(ts1).not.toBeNull();

		const res2 = await request.get(`${BASE}/kv-cache-test`);
		const html2 = await res2.text();
		const ts2 = html2.match(/data-testid="kv-timestamp">(\d+)</);
		expect(ts2?.[1]).toBe(ts1?.[1]);

		/* Call server-fn that uses ctx.revalidate */
		const revalRes = await request.post(`${BASE}/_flare/server-fn/revalidate-cache/revalidate-cache`, {
			data: {},
		});
		expect(revalRes.status()).toBe(200);

		/* Next load should get fresh data (cache was purged) */
		const res3 = await request.get(`${BASE}/kv-cache-test`);
		const html3 = await res3.text();
		const ts3 = html3.match(/data-testid="kv-timestamp">(\d+)</);
		expect(ts3).not.toBeNull();
		expect(ts3?.[1]).not.toBe(ts1?.[1]);
	});

	test("response from server-fn includes revalidatedTags", async ({ request }) => {
		const res = await request.post(`${BASE}/_flare/server-fn/revalidate-cache/revalidate-cache`, {
			data: {},
		});
		expect(res.status()).toBe(200);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.data).toEqual({ revalidated: true });
		expect(json.revalidatedTags).toEqual(["kv-test"]);
	});

	test("revalidate-both purges store + CDN and returns revalidatedTags", async ({ request }) => {
		/* Populate store cache */
		await request.get(`${BASE}/kv-cache-test`);
		const cached = await request.get(`${BASE}/kv-cache-test`);
		const cachedHtml = await cached.text();
		const cachedTs = cachedHtml.match(/data-testid="kv-timestamp">(\d+)</);

		/* Call server-fn that purges both tiers */
		const res = await request.post(`${BASE}/_flare/server-fn/revalidate-both/revalidate-both`, { data: {} });
		expect(res.status()).toBe(200);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.data).toEqual({ revalidated: true });
		expect(json.revalidatedTags).toEqual(["kv-test"]);

		/* Store cache should be purged — fresh timestamp */
		const fresh = await request.get(`${BASE}/kv-cache-test`);
		const freshHtml = await fresh.text();
		const freshTs = freshHtml.match(/data-testid="kv-timestamp">(\d+)</);
		expect(freshTs?.[1]).not.toBe(cachedTs?.[1]);
	});

	test("revalidate-both via /_flare/revalidate endpoint purges both tiers", async ({ request }) => {
		/* Populate store cache */
		await request.get(`${BASE}/kv-cache-test`);
		const cached = await request.get(`${BASE}/kv-cache-test`);
		const cachedHtml = await cached.text();
		const cachedTs = cachedHtml.match(/data-testid="kv-timestamp">(\d+)</);

		/* Revalidate both tiers via endpoint */
		const res = await request.post(`${BASE}/_flare/revalidate`, {
			data: { tags: ["kv-test"], tiers: ["ssr", "cdn"] },
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": "e2e-test-secret",
			},
		});
		expect(res.status()).toBe(200);

		/* Store purged — fresh data */
		const fresh = await request.get(`${BASE}/kv-cache-test`);
		const freshHtml = await fresh.text();
		const freshTs = freshHtml.match(/data-testid="kv-timestamp">(\d+)</);
		expect(freshTs?.[1]).not.toBe(cachedTs?.[1]);
	});

	test("cached route serves fresh data after server-fn revalidation", async ({ request }) => {
		/* Populate cache */
		await request.get(`${BASE}/kv-cache-test`);
		const cached = await request.get(`${BASE}/kv-cache-test`);
		const cachedHtml = await cached.text();
		const cachedTs = cachedHtml.match(/data-testid="kv-timestamp">(\d+)</);

		/* Revalidate via server-fn */
		await request.post(`${BASE}/_flare/server-fn/revalidate-cache/revalidate-cache`, { data: {} });

		/* Fresh load should differ */
		const fresh = await request.get(`${BASE}/kv-cache-test`);
		const freshHtml = await fresh.text();
		const freshTs = freshHtml.match(/data-testid="kv-timestamp">(\d+)</);
		expect(freshTs?.[1]).not.toBe(cachedTs?.[1]);
	});
});
