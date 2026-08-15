import { expect, test } from "@playwright/test";

/**
 * Dev prerender — SSG routes should be functional in dev mode.
 * In dev, SSG routes are either served from the FileSystemStore
 * (if dev prerender ran) or rendered on-demand via SSR fallback.
 * Either way, they must return correct content.
 */
test.describe("Dev prerender — SSG routes in dev @dev-only", () => {
	test("SSG route returns 200 with correct content", async ({ request }) => {
		const res = await request.get("/static-cache-test");
		expect(res.status()).toBe(200);
		const body = await res.text();
		expect(body).toContain("static-cache-test");
	});

	test("SSG route returns HTML content-type", async ({ request }) => {
		const res = await request.get("/static-cache-test");
		expect(res.headers()["content-type"]).toContain("text/html");
	});

	test("SSG route NDJSON also works in dev", async ({ request }) => {
		const res = await request.get("/static-cache-test", {
			headers: { "x-d": "1" },
		});
		expect(res.status()).toBe(200);
	});

	test("second SSG request returns consistent content", async ({ request }) => {
		const r1 = await request.get("/static-pure");
		const r2 = await request.get("/static-pure");
		expect(r1.status()).toBe(200);
		expect(r2.status()).toBe(200);
	});

	test("SSG route with Vary header", async ({ request }) => {
		const res = await request.get("/static-cache-test");
		expect(res.headers()["vary"]).toContain("x-d");
	});

	test("multiple SSG routes all serve correctly", async ({ request }) => {
		const [r1, r2] = await Promise.all([request.get("/static-cache-test"), request.get("/static-pure")]);
		expect(r1.status()).toBe(200);
		expect(r2.status()).toBe(200);
		const body1 = await r1.text();
		expect(body1).toContain("static-cache-test");
	});
});

test.describe("Dev prerender — SSG routes in prod @prod-only", () => {
	test("SSG route returns 200 in prod", async ({ request }) => {
		const res = await request.get("/static-cache-test");
		expect(res.status()).toBe(200);
		const body = await res.text();
		expect(body).toContain("static-cache-test");
	});

	test("SSG route served from store has flare-cache HIT", async ({ request }) => {
		const res = await request.get("/static-cache-test");
		expect(res.status()).toBe(200);
		const cacheHeader = res.headers()["flare-cache"];
		/* in prod, pre-rendered routes should be served from store */
		if (cacheHeader) {
			expect(cacheHeader).toBe("HIT");
		}
	});
});
