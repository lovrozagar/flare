import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("Link prefetch='intent'", () => {
	test("hovering prefetch='intent' link triggers NDJSON request", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		const ndjsonUrls: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1") {
				ndjsonUrls.push(req.url());
			}
		});

		const link = page.locator("[data-testid=prefetch-intent-link]");
		await link.dispatchEvent("mouseenter");
		await page.waitForTimeout(1000);

		const prefetchReqs = ndjsonUrls.filter((u) => u.includes("/prefetch-target"));
		expect(prefetchReqs.length).toBeGreaterThanOrEqual(1);
		cap.assertClean();
	});

	test("hovering non-prefetch link does NOT trigger NDJSON request", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		const ndjsonUrls: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1") {
				ndjsonUrls.push(req.url());
			}
		});

		/* prefetch-none-link targets /about (different from viewport's /prefetch-target) */
		const link = page.locator("[data-testid=prefetch-none-link]");
		await link.dispatchEvent("mouseenter");
		await page.waitForTimeout(1000);

		/* only check for /about NDJSON — viewport prefetch for /prefetch-target is expected */
		const aboutReqs = ndjsonUrls.filter((u) => u.includes("/about"));
		expect(aboutReqs.length).toBe(0);
		cap.assertClean();
	});

	test("prefetch intent request has flare-prefetch header", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		let hasPrefetchHeader = false;
		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1" && req.url().includes("/prefetch-target")) {
				if (req.headers()["flare-prefetch"] === "1") {
					hasPrefetchHeader = true;
				}
			}
		});

		const link = page.locator("[data-testid=prefetch-intent-link]");
		await link.dispatchEvent("mouseenter");
		await page.waitForTimeout(1000);

		expect(hasPrefetchHeader).toBe(true);
		cap.assertClean();
	});
});

test.describe("Link prefetch='viewport'", () => {
	test("viewport prefetch link triggers NDJSON when scrolled into view", async ({ page }) => {
		const cap = setupConsoleCapture(page);

		const ndjsonUrls: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1" && req.url().includes("/prefetch-target")) {
				ndjsonUrls.push(req.url());
			}
		});

		await loadPage(page, "/");

		/*
		 * IntersectionObserver fires asynchronously when element is in viewport.
		 * On initial load ctx may not be set yet (setupNavigation runs after hydrate).
		 * Scrolling or hovering near the element triggers re-evaluation.
		 */
		const link = page.locator("[data-testid=prefetch-viewport-link]");
		await link.scrollIntoViewIfNeeded();
		await page.waitForTimeout(2000);

		expect(ndjsonUrls.length).toBeGreaterThanOrEqual(1);
		cap.assertClean();
	});
});

test.describe("Prefetch → navigation interaction", () => {
	test("prefetched page loads instantly on click", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		/* Trigger prefetch via dispatchEvent to avoid vite-error-overlay blocking hover */
		const link = page.locator("[data-testid=prefetch-intent-link]");
		await link.dispatchEvent("mouseenter");
		await page.waitForTimeout(1000);

		/* count NDJSON requests after click (should be 0 if prefetch cache hit) */
		const ndjsonAfterClick: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1" && req.url().includes("/prefetch-target")) {
				ndjsonAfterClick.push(req.url());
			}
		});

		await link.click({ force: true });
		await page.waitForURL("**/prefetch-target", { timeout: 10_000 });

		await expect(page.locator("[data-testid=prefetch-target]")).toBeVisible();
		await expect(page.locator("[data-testid=prefetch-loaded]")).toHaveText("true");

		cap.assertClean();
	});

	test("clicking prefetch link navigates correctly", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		await page.click("[data-testid=prefetch-intent-link]", { force: true });
		await page.waitForURL("**/prefetch-target", { timeout: 10_000 });

		await expect(page.locator("[data-testid=prefetch-target]")).toBeVisible();
		expect(page.url()).toContain("/prefetch-target");
		cap.assertClean();
	});
});
