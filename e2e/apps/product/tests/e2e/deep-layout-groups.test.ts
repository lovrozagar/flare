import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, clickAndAssertSPA, setupConsoleCapture } from "./helpers";

test.describe("Layout group swap on cross-group navigation", () => {
	test("/blog → /about: blog layout disappears", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();

		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-layout]")).not.toBeVisible();

		cap.assertClean();
	});

	test("/about → /blog: blog layout appears", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/about");
		await expect(page.locator("[data-testid=blog-layout]")).not.toBeVisible();

		await navigateSPA(page, "/blog");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible();

		cap.assertClean();
	});

	test("blog layout absent on non-blog pages (home, about)", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await expect(page.locator("[data-testid=home]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-layout]")).not.toBeVisible();

		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-layout]")).not.toBeVisible();

		cap.assertClean();
	});
});

test.describe("Layout persistence within group", () => {
	test("/blog → /blog/hello-world: blog layout persists, child content changes", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible();

		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-post]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-list]")).not.toBeVisible();

		cap.assertClean();
	});

	test("/blog/hello-world → /blog: layout stays, post replaced by index", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog/hello-world");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-post]")).toBeVisible();

		await clickAndAssertSPA(page, "a[href='/blog']", "/blog");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-post]")).not.toBeVisible();

		cap.assertClean();
	});
});

test.describe("Layout re-mount on re-entry", () => {
	test("/blog → /about → /blog: blog layout re-created correctly", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-nav]")).toContainText("Blog");

		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-layout]")).not.toBeVisible();

		await navigateSPA(page, "/blog");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-nav]")).toContainText("Blog");
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible();

		cap.assertClean();
	});
});

test.describe("Layout data independence", () => {
	test("blog layout section does not leak into dashboard", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");
		await expect(page.locator("[data-testid=blog-nav]")).toContainText("Blog");
		await expect(page.locator("[data-testid=dashboard-layout]")).not.toBeVisible();

		cap.assertClean();
	});

	test("dashboard layout does not leak into blog", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await page.setExtraHTTPHeaders({ "x-test-auth": "user1" });
		await loadPage(page, "/dashboard");
		await expect(page.locator("[data-testid=dashboard-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-layout]")).not.toBeVisible();
		await expect(page.locator("[data-testid=blog-nav]")).not.toBeVisible();

		cap.assertClean();
	});
});

test.describe("Dashboard auth gating", () => {
	test("/dashboard without auth returns 401", async ({ page }) => {
		const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(401);
	});

	test("/dashboard without auth does not render dashboard content", async ({ page }) => {
		await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
		await expect(page.locator("[data-testid=dashboard-layout]")).not.toBeVisible();
		await expect(page.locator("[data-testid=dashboard-home]")).not.toBeVisible();
	});

	test("/dashboard with auth shows dashboard layout and content", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await page.setExtraHTTPHeaders({ "x-test-auth": "user1" });
		await loadPage(page, "/dashboard");
		await expect(page.locator("[data-testid=dashboard-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=dashboard-home]")).toBeVisible();

		cap.assertClean();
	});

	test("/dashboard/settings with auth shows settings within dashboard layout", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await page.setExtraHTTPHeaders({ "x-test-auth": "user1" });
		await loadPage(page, "/dashboard/settings");
		await expect(page.locator("[data-testid=dashboard-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=dashboard-settings]")).toBeVisible();

		cap.assertClean();
	});
});
