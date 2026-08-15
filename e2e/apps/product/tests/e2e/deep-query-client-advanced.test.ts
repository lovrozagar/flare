import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

/* ── 1. Error queries ──────────────────────────────────────────────── */

test.describe("QueryClient Advanced: error queries @node-only", () => {
	test("error boundary renders after streaming resolves error", async ({ page }) => {
		await page.goto(`${BASE}/query-error`, { waitUntil: "domcontentloaded" });
		/* SSR streams the error; client-side ErrorBoundary catches it */
		await page.waitForSelector("[data-testid=query-error-boundary]", { timeout: 15_000 });
		await expect(page.locator("[data-testid=query-error-boundary]")).toBeVisible();
	});

	test("error message propagates to error boundary", async ({ page }) => {
		await page.goto(`${BASE}/query-error`, { waitUntil: "domcontentloaded" });
		await page.waitForSelector("[data-testid=query-error-msg]", { timeout: 15_000 });
		const msg = await page.locator("[data-testid=query-error-msg]").textContent();
		expect(msg).toContain("query-exploded");
	});
});

/* ── 2. Dynamic param query keys ───────────────────────────────────── */

test.describe("QueryClient Advanced: dynamic params", () => {
	test("SSR HTML contains param-specific data", async ({ page }) => {
		const response = await page.request.get(`${BASE}/query-dynamic/abc`);
		const html = await response.text();
		expect(html).toContain("abc");
		expect(html).toContain("Item-abc");
	});

	test("page hydrates with dynamic param data", async ({ page }) => {
		await loadPage(page, "/query-dynamic/xyz");
		await expect(page.locator("[data-testid=dynamic-id]")).toHaveText("xyz");
		await expect(page.locator("[data-testid=dynamic-name]")).toHaveText("Item-xyz");
	});

	test("different params yield different data", async ({ page }) => {
		await loadPage(page, "/query-dynamic/first");
		await expect(page.locator("[data-testid=dynamic-name]")).toHaveText("Item-first");

		await navigateSPA(page, "/query-dynamic/second");
		await expect(page.locator("[data-testid=dynamic-name]")).toHaveText("Item-second");
	});
});

/* ── 3. Null data queries ──────────────────────────────────────────── */

test.describe("QueryClient Advanced: null data", () => {
	test("page hydrates with null query data", async ({ page }) => {
		const capture = setupConsoleCapture(page);
		await loadPage(page, "/query-null");
		await expect(page.locator("[data-testid=null-data]")).toHaveText("null");
		capture.assertClean();
	});

	test("FlareState.q contains null data entry", async ({ page }) => {
		await loadPage(page, "/query-null");
		const q = await page.evaluate(
			() => (self as unknown as { flare?: { q?: Array<{ data: unknown; key: unknown[] }> } }).flare?.q ?? [],
		);
		const entry = q.find((e) => Array.isArray(e.key) && e.key[0] === "null-query");
		expect(entry).toBeDefined();
		expect(entry?.data).toBeNull();
	});
});

/* ── 4. Large payload queries ──────────────────────────────────────── */

test.describe("QueryClient Advanced: large payloads", () => {
	test("200-item payload renders correctly", async ({ page }) => {
		await loadPage(page, "/query-large");
		await expect(page.locator("[data-testid=large-count]")).toHaveText("200");
		await expect(page.locator("[data-testid=large-first]")).toHaveText("Item-0");
		await expect(page.locator("[data-testid=large-last]")).toHaveText("Item-199");
	});

	test("large payload clean console", async ({ page }) => {
		const capture = setupConsoleCapture(page);
		await loadPage(page, "/query-large");
		capture.assertClean();
	});
});

/* ── 5. Cache invalidation ─────────────────────────────────────────── */

test.describe("QueryClient Advanced: cache invalidation", () => {
	test("invalidation causes data to update", async ({ page }) => {
		await loadPage(page, "/query-invalidation");
		const ts1 = await page.locator("[data-testid=inv-ts]").textContent();
		expect(ts1).toBeTruthy();

		await page.click("[data-testid=invalidate-btn]");
		/* wait for the value to change */
		await page.waitForFunction(
			(prevTs) => {
				const el = document.querySelector("[data-testid=inv-ts]");
				return el && el.textContent !== prevTs;
			},
			ts1,
			{ timeout: 10_000 },
		);
		const ts2 = await page.locator("[data-testid=inv-ts]").textContent();
		expect(ts2).not.toBe(ts1);
	});

	test("invalidation clean console", async ({ page }) => {
		const capture = setupConsoleCapture(page);
		await loadPage(page, "/query-invalidation");
		capture.assertClean();
	});
});

/* ── 6. Cross-route query consistency ──────────────────────────────── */

test.describe("QueryClient Advanced: cross-route consistency", () => {
	test("SPA navigate from query-basic to query-large preserves basic data", async ({ page }) => {
		await loadPage(page, "/query-basic");
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42");

		await navigateSPA(page, "/query-large");
		await expect(page.locator("[data-testid=large-count]")).toHaveText("200");

		await navigateSPA(page, "/query-basic");
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42");
	});
});

/* ── 7. Dynamic param: FlareState.q key verification ───────────────── */

test.describe("QueryClient Advanced: dynamic FlareState", () => {
	test("FlareState.q contains dynamic param in query key", async ({ page }) => {
		await loadPage(page, "/query-dynamic/my-param");
		const q = await page.evaluate(
			() => (self as unknown as { flare?: { q?: Array<{ data: unknown; key: unknown[] }> } }).flare?.q ?? [],
		);
		const entry = q.find((e) => Array.isArray(e.key) && e.key[0] === "item" && e.key[1] === "my-param");
		expect(entry).toBeDefined();
		expect((entry?.data as { name: string })?.name).toBe("Item-my-param");
	});

	test("SSR HTML for dynamic route contains correct query data", async ({ page }) => {
		const response = await page.request.get(`${BASE}/query-dynamic/ssr-check`);
		const html = await response.text();
		expect(html).toContain("Item-ssr-check");
		expect(html).toContain("ssr-check");
	});
});

/* ── 8. Error: SPA navigation into error page ──────────────────────── */

test.describe("QueryClient Advanced: SPA to error page", () => {
	test("SPA navigate into error page shows error boundary", async ({ page }) => {
		await loadPage(page, "/query-basic");
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42");

		/* SPA navigate to the error page */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (nav) return nav("/query-error");
			return Promise.resolve();
		});
		/* error boundary should appear after query fails */
		await page.waitForSelector("[data-testid=query-error-boundary]", { timeout: 15_000 });
		await expect(page.locator("[data-testid=query-error-boundary]")).toBeVisible();
	});
});

/* ── 9. Null data: SPA navigation ──────────────────────────────────── */

test.describe("QueryClient Advanced: null SPA navigation", () => {
	test("SPA navigate to null data page shows null", async ({ page }) => {
		await loadPage(page, "/query-basic");
		await navigateSPA(page, "/query-null");
		await expect(page.locator("[data-testid=null-data]")).toHaveText("null");
	});

	test("SPA navigate from null to basic preserves basic data", async ({ page }) => {
		await loadPage(page, "/query-null");
		await expect(page.locator("[data-testid=null-data]")).toHaveText("null");
		await navigateSPA(page, "/query-basic");
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42");
	});
});

/* ── 10. Large payload: SSR response ───────────────────────────────── */

test.describe("QueryClient Advanced: large SSR", () => {
	test("SSR HTML contains 200-item data", async ({ page }) => {
		const response = await page.request.get(`${BASE}/query-large`);
		const html = await response.text();
		expect(html).toContain("Item-0");
		expect(html).toContain("Item-199");
		expect(html).toContain("200");
	});

	test("large payload FlareState.q is populated", async ({ page }) => {
		await loadPage(page, "/query-large");
		const q = await page.evaluate(
			() => (self as unknown as { flare?: { q?: Array<{ data: unknown; key: unknown[] }> } }).flare?.q ?? [],
		);
		const entry = q.find((e) => Array.isArray(e.key) && e.key[0] === "large-data");
		expect(entry).toBeDefined();
		const data = entry?.data as Array<{ id: number }> | undefined;
		expect(data?.length).toBe(200);
	});
});

/* ── 11. Cache invalidation: double invalidation ──────────────────── */

test.describe("QueryClient Advanced: double invalidation", () => {
	test("second invalidation produces new value", async ({ page }) => {
		await loadPage(page, "/query-invalidation");
		const ts1 = await page.locator("[data-testid=inv-ts]").textContent();

		/* first invalidation */
		await page.click("[data-testid=invalidate-btn]");
		await page.waitForFunction(
			(prevTs) => {
				const el = document.querySelector("[data-testid=inv-ts]");
				return el && el.textContent !== prevTs;
			},
			ts1,
			{ timeout: 10_000 },
		);
		const ts2 = await page.locator("[data-testid=inv-ts]").textContent();
		expect(ts2).not.toBe(ts1);

		/* second invalidation */
		await page.click("[data-testid=invalidate-btn]");
		await page.waitForFunction(
			(prevTs) => {
				const el = document.querySelector("[data-testid=inv-ts]");
				return el && el.textContent !== prevTs;
			},
			ts2,
			{ timeout: 10_000 },
		);
		const ts3 = await page.locator("[data-testid=inv-ts]").textContent();
		expect(ts3).not.toBe(ts2);
	});
});

/* ── 12. Sequential navigation stress ──────────────────────────────── */

test.describe("QueryClient Advanced: sequential navigation stress", () => {
	test("navigate through all query routes in sequence", async ({ page }) => {
		const capture = setupConsoleCapture(page);

		await loadPage(page, "/query-basic");
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42");

		await navigateSPA(page, "/query-null");
		await expect(page.locator("[data-testid=null-data]")).toHaveText("null");

		await navigateSPA(page, "/query-large");
		await expect(page.locator("[data-testid=large-count]")).toHaveText("200");

		await navigateSPA(page, "/query-dynamic/stress-test");
		await expect(page.locator("[data-testid=dynamic-name]")).toHaveText("Item-stress-test");

		await navigateSPA(page, "/query-invalidation");
		await expect(page.locator("[data-testid=inv-ts]")).not.toHaveText("");

		await navigateSPA(page, "/query-multi");
		await expect(page.locator("[data-testid=user-name]")).toHaveText("Alice");
		await expect(page.locator("[data-testid=items-count]")).toHaveText("2");

		/* navigate back to basic — cache should still be intact */
		await navigateSPA(page, "/query-basic");
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42");

		capture.assertClean();
	});
});
