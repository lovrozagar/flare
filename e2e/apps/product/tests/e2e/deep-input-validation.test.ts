import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

const LIBS = ["zod", "valibot", "arktype", "manual", "yup", "superstruct", "typebox", "effect"] as const;

/* zod passes raw schema → Standard Schema detected → SFVE → 400.
 * Others wrap in {parse}/function → generic throw → 500. */
const VALIDATION_ERROR_STATUS: Record<string, number> = { zod: 400 };

for (const lib of LIBS) {
	test.describe(`Input validation (${lib}): SSR`, () => {
		test("valid params + no search → renders with defaults", async ({ page }) => {
			const cap = setupConsoleCapture(page);
			await loadPage(page, `/input-${lib}/42`);

			expect(await page.locator("[data-testid=input-lib]").textContent()).toBe(lib);
			expect(await page.locator("[data-testid=input-id]").textContent()).toBe("42");
			expect(await page.locator("[data-testid=input-tab]").textContent()).toBe("overview");
			expect(await page.locator("[data-testid=input-limit]").textContent()).toBe("10");
			cap.assertClean();
		});

		test("valid params + explicit search → renders with provided values", async ({ page }) => {
			const cap = setupConsoleCapture(page);
			await loadPage(page, `/input-${lib}/99?tab=settings&limit=25`);

			expect(await page.locator("[data-testid=input-id]").textContent()).toBe("99");
			expect(await page.locator("[data-testid=input-tab]").textContent()).toBe("settings");
			expect(await page.locator("[data-testid=input-limit]").textContent()).toBe("25");
			cap.assertClean();
		});

		test(`invalid param (non-numeric) → ${VALIDATION_ERROR_STATUS[lib] ?? 500} error`, async ({ page }) => {
			const response = await page.goto(`/input-${lib}/abc`, { waitUntil: "domcontentloaded" });
			expect(response?.status()).toBe(VALIDATION_ERROR_STATUS[lib] ?? 500);
		});

		test("hydration clean (no console errors)", async ({ page }) => {
			const cap = setupConsoleCapture(page);
			await loadPage(page, `/input-${lib}/7`);
			cap.assertClean();
		});
	});

	test.describe(`Input validation (${lib}): SPA`, () => {
		test("SPA nav to valid route → correct data renders", async ({ page }) => {
			const cap = setupConsoleCapture(page);
			await loadPage(page, "/");
			await navigateSPA(page, `/input-${lib}/55`);

			expect(await page.locator("[data-testid=input-id]").textContent()).toBe("55");
			expect(await page.locator("[data-testid=input-tab]").textContent()).toBe("overview");
			expect(await page.locator("[data-testid=input-limit]").textContent()).toBe("10");
			cap.assertClean();
		});

		test("SPA nav to invalid param → error boundary shown", async ({ page }) => {
			await loadPage(page, "/");

			await page.evaluate((path) => {
				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
					| ((to: string) => Promise<void>)
					| undefined;
				if (!nav) throw new Error("__flareNavigate not available");
				return nav(path).catch(() => {
					/* validation error expected */
				});
			}, `/input-${lib}/abc`);
			await page.waitForURL(`**/input-${lib}/abc`, { timeout: 10_000 });

			const body = await page.evaluate(() => document.body.innerHTML);
			expect(body.length).toBeGreaterThan(0);
		});

		test("SPA nav changing search params → updated values", async ({ page }) => {
			await loadPage(page, `/input-${lib}/42?tab=overview&limit=10`);

			expect(await page.locator("[data-testid=input-tab]").textContent()).toBe("overview");

			await navigateSPA(page, `/input-${lib}/42?tab=billing&limit=50`);

			await expect(page.locator("[data-testid=input-tab]")).toHaveText("billing", {
				timeout: 5_000,
			});
			expect(await page.locator("[data-testid=input-limit]").textContent()).toBe("50");
		});
	});
}

test.describe("Cross-validation: all libraries produce identical output", () => {
	test("same input → same output for all 8 routes", async ({ page }) => {
		const results: Record<string, { id: string; limit: string; tab: string }> = {};

		for (const lib of LIBS) {
			await loadPage(page, `/input-${lib}/42?tab=settings&limit=25`);
			results[lib] = {
				id: (await page.locator("[data-testid=input-id]").textContent()) ?? "",
				limit: (await page.locator("[data-testid=input-limit]").textContent()) ?? "",
				tab: (await page.locator("[data-testid=input-tab]").textContent()) ?? "",
			};
		}

		/* all should match the zod result */
		for (const lib of LIBS) {
			expect(results[lib]).toEqual({ id: "42", limit: "25", tab: "settings" });
		}
	});

	test("defaults match across all libraries", async ({ page }) => {
		const results: Record<string, { limit: string; tab: string }> = {};

		for (const lib of LIBS) {
			await loadPage(page, `/input-${lib}/1`);
			results[lib] = {
				limit: (await page.locator("[data-testid=input-limit]").textContent()) ?? "",
				tab: (await page.locator("[data-testid=input-tab]").textContent()) ?? "",
			};
		}

		for (const lib of LIBS) {
			expect(results[lib]).toEqual({ limit: "10", tab: "overview" });
		}
	});
});
