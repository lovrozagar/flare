import { expect, test } from "@playwright/test";

test.describe("mount /api", () => {
	test("GET /api/health", async ({ request }) => {
		const response = await request.get("/api/health");
		expect(response.status()).toBe(200);
		const json = await response.json();
		expect(json.ok).toBe(true);
		expect(json.path).toBe("/health");
	});

	test("GET /api/echo echoes query", async ({ request }) => {
		const json = await (await request.get("/api/echo?msg=hello")).json();
		expect(json.msg).toBe("hello");
	});

	test("POST /api/echo echoes body", async ({ request }) => {
		const response = await request.post("/api/echo", { data: { name: "test" } });
		expect((await response.json()).body).toEqual({ name: "test" });
	});

	test(".json and .xml passthrough", async ({ request }) => {
		expect((await (await request.get("/api/data.json")).json()).format).toBe("json");
		expect((await request.get("/api/feed.xml")).status()).toBe(200);
	});
});

test.describe("keepalive + sitemap submit", () => {
	test("GET /_flare/keepalive is 204", async ({ request }) => {
		const response = await request.get("/_flare/keepalive");
		expect(response.status()).toBe(204);
	});

	test("GET sitemap submit is 405", async ({ request }) => {
		const response = await request.get("/_flare/sitemap/submit");
		expect(response.status()).toBe(405);
	});

	test("POST sitemap submit without secret is rejected", async ({ request }) => {
		const response = await request.post("/_flare/sitemap/submit");
		expect(response.status()).toBeGreaterThanOrEqual(400);
	});
});

test.describe("sitemap.xml response route", () => {
	test("returns XML with urls", async ({ request }) => {
		const response = await request.get("/sitemap.xml");
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("xml");
		const text = await response.text();
		expect(text).toContain("<urlset");
		expect(text).toContain("http://localhost:4101/about");
	});
});
