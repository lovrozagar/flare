import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loadPage } from "./helpers";

/**
 * Automated WCAG 2.1 AA scanning via axe-core.
 *
 * Catches violations that manual assertion-based tests miss:
 * color contrast, missing alt text, invalid ARIA, landmark misuse, etc.
 * Each route is scanned independently for comprehensive coverage.
 */

function axeScan(page: Page, tags: string[] = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]) {
	return new AxeBuilder({ page }).withTags(tags).exclude("[data-flare-dev-overlay]");
}

const ROUTES = [
	"/",
	"/about",
	"/a11y-test",
	"/a11y-form-test",
	"/a11y-nav-test",
	"/perf-bench",
	"/fonts-category-test",
	"/error-test",
];

test.describe("Axe WCAG 2.1 AA — route scans", () => {
	for (const route of ROUTES) {
		test(`${route} has zero WCAG 2.1 AA violations`, async ({ page }) => {
			await loadPage(page, route);

			const results = await axeScan(page).analyze();

			const violations = results.violations.map((v) => ({
				help: v.help,
				id: v.id,
				impact: v.impact,
				nodes: v.nodes.length,
			}));

			expect(violations, `WCAG violations on ${route}:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
		});
	}
});

test.describe("Axe WCAG 2.1 AA — after SPA navigation", () => {
	test("page remains accessible after SPA nav", async ({ page }) => {
		await loadPage(page, "/");

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (nav) return nav("/a11y-test");
		});
		await page.waitForURL("**/a11y-test");

		const results = await axeScan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	test("form page accessible after SPA nav", async ({ page }) => {
		await loadPage(page, "/");

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (nav) return nav("/a11y-form-test");
		});
		await page.waitForURL("**/a11y-form-test");

		const results = await axeScan(page).analyze();
		expect(results.violations).toEqual([]);
	});
});

test.describe("Axe WCAG 2.1 AA — error pages", () => {
	test("error boundary page is accessible", async ({ page }) => {
		await page.goto("/error-test?fail=true", { waitUntil: "domcontentloaded" });
		await page.waitForSelector("[data-testid=error-test-boundary]");

		const results = await axeScan(page).analyze();
		expect(results.violations).toEqual([]);
	});

	test("404 page is accessible", async ({ page }) => {
		await page.goto("/nonexistent-axe-check", { waitUntil: "domcontentloaded" });

		const results = await axeScan(page).analyze();
		expect(results.violations).toEqual([]);
	});
});

test.describe("@prod-only Axe WCAG 2.1 AA — prod scans", () => {
	const PROD_ROUTES = ["/", "/about", "/a11y-test", "/a11y-form-test"];

	for (const route of PROD_ROUTES) {
		test(`prod ${route} has zero WCAG violations`, async ({ page }) => {
			await loadPage(page, route);

			const results = await axeScan(page).analyze();
			expect(results.violations).toEqual([]);
		});
	}
});
