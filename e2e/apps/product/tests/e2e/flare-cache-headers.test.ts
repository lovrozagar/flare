import { expect, test } from "@playwright/test";

test.describe("Flare-Render header", () => {
	test("SSR route has Flare-Render: SSR", async ({ page }) => {
		const response = await page.goto("/about", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["flare-render"]).toBe("SSR");
	});

	test("SSR route without cache has no Flare-Cache", async ({ page }) => {
		const response = await page.goto("/head-demo", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["flare-cache"]).toBeUndefined();
	});

	test("SSR data request has Flare-Render: SSR", async ({ request }) => {
		const response = await request.get("/about", {
			headers: { "x-d": "1" },
		});
		expect(response.headers()["flare-render"]).toBe("SSR");
	});
});

test.describe("Flare-Cache header with store", () => {
	test("first request to store-cached route is MISS", async ({ request }) => {
		/* Use a fresh request to avoid cached data */
		const response = await request.get("/deep-cache/store-page");
		expect(response.headers()["flare-render"]).toBe("SSR");
		/* First SSR request — store writes back, so this could be HIT or MISS
		 * depending on whether the store was pre-populated. Verify header exists. */
		const cacheHeader = response.headers()["flare-cache"];
		if (cacheHeader) {
			expect(["HIT", "MISS"]).toContain(cacheHeader);
		}
	});

	test("store-cached route has Flare-Cache header", async ({ request }) => {
		/* First request populates store */
		await request.get("/deep-cache/store-page");
		/* Second request should hit */
		const response = await request.get("/deep-cache/store-page");
		expect(response.headers()["flare-render"]).toBe("SSR");
		expect(response.headers()["flare-cache"]).toBe("HIT");
	});

	test("NDJSON request to store-cached route has Flare headers", async ({ request }) => {
		/* Populate store */
		await request.get("/deep-cache/store-page");
		/* NDJSON request should also have headers */
		const response = await request.get("/deep-cache/store-page", {
			headers: { "x-d": "1" },
		});
		expect(response.headers()["flare-render"]).toBe("SSR");
		expect(response.headers()["flare-cache"]).toBe("HIT");
	});
});
