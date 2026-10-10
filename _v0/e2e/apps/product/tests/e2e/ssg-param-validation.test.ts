import { expect, test } from "@playwright/test";

/**
 * @prod-only
 *
 * SSG/ISR param validation — routes with explicit params reject unlisted values at runtime.
 */

test.describe("@prod-only SSG param validation — listed values serve 200", () => {
	test("/ssg-dynamic/hello → 200", async ({ request }) => {
		const res = await request.get("/ssg-dynamic/hello");
		expect(res.status()).toBe(200);
	});

	test("/ssg-dynamic/world → 200", async ({ request }) => {
		const res = await request.get("/ssg-dynamic/world");
		expect(res.status()).toBe(200);
	});

	test("/en/ssg-about → 200", async ({ request }) => {
		const res = await request.get("/en/ssg-about");
		expect(res.status()).toBe(200);
	});

	test("/fr/ssg-about → 200", async ({ request }) => {
		const res = await request.get("/fr/ssg-about");
		expect(res.status()).toBe(200);
	});
});

test.describe("@prod-only SSG param validation — unlisted values return 404", () => {
	test("/ssg-dynamic/nonexistent → 404", async ({ request }) => {
		const res = await request.get("/ssg-dynamic/nonexistent");
		expect(res.status()).toBe(404);
	});

	test("/de/ssg-about → 404 (unlisted locale)", async ({ request }) => {
		const res = await request.get("/de/ssg-about");
		expect(res.status()).toBe(404);
	});

	test("/zm/ssg-about → 404 (unlisted locale)", async ({ request }) => {
		const res = await request.get("/zm/ssg-about");
		expect(res.status()).toBe(404);
	});
});
