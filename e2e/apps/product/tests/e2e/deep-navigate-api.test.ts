import { expect, test } from "@playwright/test";
import { assertSPANavigation, loadPage, setNavMarker, setupConsoleCapture } from "./helpers";

test.describe("useRouter().navigate() — push navigation", () => {
	test("button click navigates to about via useRouter", async ({ page }) => {
		await loadPage(page, "/navigate-demo");
		await setNavMarker(page);
		await page.getByTestId("nav-to-about").click();
		await page.waitForURL("**/about");
		await assertSPANavigation(page);
		await expect(page.getByTestId("about")).toBeVisible();
	});

	test("current path reflects navigate-demo before nav", async ({ page }) => {
		await loadPage(page, "/navigate-demo");
		await expect(page.getByTestId("current-path")).toHaveText("/navigate-demo");
	});
});

test.describe("useRouter().navigate() — replace", () => {
	test("replace navigation does not create history entry", async ({ page }) => {
		await loadPage(page, "/");
		await setNavMarker(page);

		/* Navigate to navigate-demo first to create a known history entry */
		await page.evaluate(() =>
			(window as unknown as { __flareNavigate: (p: string) => void }).__flareNavigate("/navigate-demo"),
		);
		await page.waitForURL("**/navigate-demo");

		/* Click replace button */
		await page.getByTestId("nav-replace-about").click();
		await page.waitForURL("**/about");
		await assertSPANavigation(page);

		/* Back should go to home, not navigate-demo (because replace) */
		await page.goBack();
		await page.waitForURL("**/");
	});
});

test.describe("useRouter().navigate() — with search params", () => {
	test("navigate with search params populates URL", async ({ page }) => {
		await loadPage(page, "/navigate-demo");
		await setNavMarker(page);
		await page.getByTestId("nav-with-search").click();
		await page.waitForURL("**/search-demo?**");
		await assertSPANavigation(page);
		const url = new URL(page.url());
		expect(url.searchParams.get("q")).toBe("hello");
		expect(url.searchParams.get("page")).toBe("2");
	});
});

test.describe("useRouter().invalidate()", () => {
	test("invalidate triggers refetch on current route", async ({ page }) => {
		await loadPage(page, "/navigate-demo");

		/* Capture current state */
		await expect(page.getByTestId("navigate-demo")).toBeVisible();

		/* Click invalidate - should re-run loader without URL change */
		await page.getByTestId("nav-invalidate").click();

		/* URL should remain the same */
		expect(page.url()).toContain("/navigate-demo");

		/* Page should still be visible (re-rendered with fresh data) */
		await expect(page.getByTestId("navigate-demo")).toBeVisible();
	});
});

test.describe("useRouter().navigate() — console", () => {
	test("no console errors during programmatic navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/navigate-demo");
		await page.getByTestId("nav-to-about").click();
		await page.waitForURL("**/about");
		cap.assertClean();
	});
});
