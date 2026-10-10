import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("Middleware response headers (SSR)", () => {
	test("x-request-id header present on SSR response", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		const requestId = response?.headers()["x-request-id"];
		expect(requestId).toBeTruthy();
		expect(requestId).toMatch(/^req-\d+-[a-z0-9]+$/);
	});

	test("x-timing header present on SSR response", async ({ page }) => {
		const response = await page.goto("/about", { waitUntil: "domcontentloaded" });
		const timing = response?.headers()["x-timing"];
		expect(timing).toBeTruthy();
		expect(timing).toMatch(/^\d+ms$/);
	});

	test("x-middleware-ran header present on SSR response", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["x-middleware-ran"]).toBe("true");
	});

	test("request IDs are unique per request", async ({ page }) => {
		const res1 = await page.goto("/", { waitUntil: "domcontentloaded" });
		const id1 = res1?.headers()["x-request-id"];

		const res2 = await page.goto("/about", { waitUntil: "domcontentloaded" });
		const id2 = res2?.headers()["x-request-id"];

		expect(id1).toBeTruthy();
		expect(id2).toBeTruthy();
		expect(id1).not.toBe(id2);
	});
});

test.describe("Middleware response headers (NDJSON)", () => {
	test("x-request-id header on NDJSON data response", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		const ndjsonHeaders: Record<string, string> = {};
		page.on("response", (res) => {
			if (res.request().headers()["flare-data"] === "1") {
				for (const [k, v] of Object.entries(res.headers())) {
					ndjsonHeaders[k] = v;
				}
			}
		});

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		expect(ndjsonHeaders["x-request-id"]).toBeTruthy();
		expect(ndjsonHeaders["x-request-id"]).toMatch(/^req-\d+-[a-z0-9]+$/);
		cap.assertClean();
	});

	test("x-middleware-ran header on NDJSON response", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		const ndjsonHeaders: Record<string, string> = {};
		page.on("response", (res) => {
			if (res.request().headers()["flare-data"] === "1") {
				for (const [k, v] of Object.entries(res.headers())) {
					ndjsonHeaders[k] = v;
				}
			}
		});

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		expect(ndjsonHeaders["x-middleware-ran"]).toBe("true");
		cap.assertClean();
	});

	test("x-timing header on NDJSON response", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		const ndjsonHeaders: Record<string, string> = {};
		page.on("response", (res) => {
			if (res.request().headers()["flare-data"] === "1") {
				for (const [k, v] of Object.entries(res.headers())) {
					ndjsonHeaders[k] = v;
				}
			}
		});

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		expect(ndjsonHeaders["x-timing"]).toBeTruthy();
		expect(ndjsonHeaders["x-timing"]).toMatch(/^\d+ms$/);
		cap.assertClean();
	});
});

test.describe("Middleware chain ordering", () => {
	test("both middlewares run on same request", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		/* timing middleware adds x-request-id + x-timing, marker adds x-middleware-ran */
		expect(response?.headers()["x-request-id"]).toBeTruthy();
		expect(response?.headers()["x-timing"]).toBeTruthy();
		expect(response?.headers()["x-middleware-ran"]).toBe("true");
	});

	test("404 returns correct status without middleware onResponse headers", async ({ page }) => {
		const response = await page.goto("/nonexistent-page-xyz", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(404);
		/*
		 * fallbackHtmlResponse bypasses applyResponseHandlers —
		 * middleware onResponse handlers don't run for fallback error pages.
		 * This is current framework behavior (fallback is pre-pipeline).
		 */
	});

	test("auth-protected route returns 401 status", async ({ page }) => {
		const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(401);
	});
});

test.describe("Middleware + custom route headers coexistence", () => {
	test("middleware headers and route headers both present on SSR", async ({ page }) => {
		const response = await page.goto("/custom-headers", { waitUntil: "domcontentloaded" });
		/* middleware headers */
		expect(response?.headers()["x-request-id"]).toBeTruthy();
		expect(response?.headers()["x-middleware-ran"]).toBe("true");
		/* route headers */
		expect(response?.headers()["x-custom-header"]).toBe("flare-test-value");
	});

	test("middleware headers and route headers both present on NDJSON", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		const ndjsonHeaders: Record<string, string> = {};
		page.on("response", (res) => {
			if (res.request().headers()["flare-data"] === "1") {
				for (const [k, v] of Object.entries(res.headers())) {
					ndjsonHeaders[k] = v;
				}
			}
		});

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/custom-headers");
		});
		await page.waitForURL("**/custom-headers", { timeout: 10_000 });

		/* middleware headers */
		expect(ndjsonHeaders["x-request-id"]).toBeTruthy();
		expect(ndjsonHeaders["x-middleware-ran"]).toBe("true");
		/* route headers */
		expect(ndjsonHeaders["x-custom-header"]).toBe("flare-test-value");
		cap.assertClean();
	});
});
