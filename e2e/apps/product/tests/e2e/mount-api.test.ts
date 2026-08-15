import { expect, test } from "@playwright/test";

test.describe("Mount — in-process API handler", () => {
	test("GET /api/health returns JSON", async ({ request }) => {
		const response = await request.get("/api/health");
		expect(response.status()).toBe(200);
		const json = await response.json();
		expect(json.ok).toBe(true);
	});

	test("GET /api/echo?msg=hello echoes query param", async ({ request }) => {
		const response = await request.get("/api/echo?msg=hello");
		expect(response.status()).toBe(200);
		const json = await response.json();
		expect(json.msg).toBe("hello");
	});

	test("POST /api/echo echoes JSON body", async ({ request }) => {
		const response = await request.post("/api/echo", {
			data: { name: "test" },
		});
		expect(response.status()).toBe(200);
		const json = await response.json();
		expect(json.body).toEqual({ name: "test" });
	});

	test("mount strips prefix — handler sees /health not /api/health", async ({ request }) => {
		const response = await request.get("/api/health");
		const json = await response.json();
		expect(json.path).toBe("/health");
	});
});

test.describe("Mount — file extension passthrough", () => {
	test(".json extension does not 404 on mount path", async ({ request }) => {
		const response = await request.get("/api/data.json");
		expect(response.status()).toBe(200);
		const json = await response.json();
		expect(json.format).toBe("json");
	});

	test(".xml extension does not 404 on mount path", async ({ request }) => {
		const response = await request.get("/api/feed.xml");
		expect(response.status()).toBe(200);
	});
});

test.describe("Mount — error handling", () => {
	test("mount throwing error returns JSON 500, not HTML", async ({ request }) => {
		const response = await request.get("/api/error");
		expect(response.status()).toBe(500);
		const json = await response.json();
		expect(json.error).toBeTruthy();
		expect(json.status).toBe(500);
	});
});

test.describe("Mount — security headers", () => {
	test("mount responses have API security headers", async ({ request }) => {
		const response = await request.get("/api/health");
		expect(response.headers()["x-content-type-options"]).toBe("nosniff");
		expect(response.headers()["strict-transport-security"]).toContain("max-age=63072000");
		expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
	});

	test("mount responses do NOT have CSP header", async ({ request }) => {
		const response = await request.get("/api/health");
		expect(response.headers()["content-security-policy"]).toBeUndefined();
	});
});

test.describe("Mount — coexistence with page routes", () => {
	test("page routes still work alongside mounts", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(200);
		const html = await page.content();
		expect(html).toContain("<!DOCTYPE html>");
	});

	test("non-mount .json path still 404s", async ({ request }) => {
		const response = await request.get("/data.json");
		expect(response.status()).toBe(404);
	});
});

test.describe("Mount — middleware interaction", () => {
	test("middleware headers present on mount responses", async ({ request }) => {
		const response = await request.get("/api/health");
		expect(response.headers()["x-request-id"]).toBeTruthy();
		expect(response.headers()["x-middleware-ran"]).toBe("true");
	});
});
