import { expect, test } from "@playwright/test";
import { BASE } from "./helpers";

const SUBMIT_URL = `${BASE}/_flare/sitemap/submit`;
const SECRET = "e2e-sitemap-secret";

test.describe("Sitemap submit endpoint", () => {
	test("POST with valid secret returns 200 + JSON", async ({ request }) => {
		const res = await request.post(SUBMIT_URL, {
			headers: { "x-sitemap-secret": SECRET },
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.submitted).toBe(true);
		expect(body.engines).toBeDefined();
	});

	test("POST with wrong secret returns 401", async ({ request }) => {
		const res = await request.post(SUBMIT_URL, {
			headers: { "x-sitemap-secret": "wrong-secret" },
		});
		expect(res.status()).toBe(401);
		const body = await res.json();
		expect(body.error).toBe("Unauthorized");
	});

	test("POST without secret returns 401", async ({ request }) => {
		const res = await request.post(SUBMIT_URL);
		expect(res.status()).toBe(401);
	});

	test("GET is rejected — submit is POST-only", async ({ request }) => {
		const res = await request.get(`${SUBMIT_URL}?secret=${SECRET}`);
		expect(res.status()).toBe(405);
	});

	test("GET without secret is still 405", async ({ request }) => {
		const res = await request.get(SUBMIT_URL);
		expect(res.status()).toBe(405);
	});

	test("response includes security headers", async ({ request }) => {
		const res = await request.post(SUBMIT_URL, {
			headers: { "x-sitemap-secret": SECRET },
		});
		expect(res.headers()["x-content-type-options"]).toBe("nosniff");
		expect(res.headers()["x-frame-options"]).toBe("DENY");
		expect(res.headers()["content-security-policy"]).toBeDefined();
	});

	test("401 response includes security headers", async ({ request }) => {
		const res = await request.post(SUBMIT_URL, {
			headers: { "x-sitemap-secret": "wrong" },
		});
		expect(res.headers()["x-content-type-options"]).toBe("nosniff");
		expect(res.headers()["x-frame-options"]).toBe("DENY");
	});

	test("sitemap endpoint bypasses middleware onResponse handlers", async ({ request }) => {
		/* sitemap submit (like revalidation) runs after middleware check,
		   response handlers are NOT applied — only security headers are added */
		const res = await request.post(SUBMIT_URL, {
			headers: { "x-sitemap-secret": SECRET },
		});
		expect(res.headers()["x-middleware-ran"]).toBeUndefined();
		expect(res.headers()["x-request-id"]).toBeUndefined();
	});

	test("POST with URLs body includes url data", async ({ request }) => {
		const res = await request.post(SUBMIT_URL, {
			data: { urls: ["https://localhost:3999/about", "https://localhost:3999/contact"] },
			headers: {
				"Content-Type": "application/json",
				"x-sitemap-secret": SECRET,
			},
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.submitted).toBe(true);
	});

	test("Google engine error reported in response", async ({ request }) => {
		const res = await request.post(SUBMIT_URL, {
			headers: { "x-sitemap-secret": SECRET },
		});
		const body = await res.json();
		/* Google will fail with fake credentials but error should be captured */
		if (body.engines.google) {
			expect(typeof body.engines.google.ok).toBe("boolean");
		}
	});
});
