import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("Standalone hooks — useLoaderData, useLocation, useMatch, useParams, useSearch", () => {
	test("H1: useLoaderData returns loader data", async ({ page }) => {
		await loadPage(page, "/hooks-test");
		await expect(page.getByTestId("loader-greeting")).toHaveText("hello from hooks");
		const ts = await page.getByTestId("loader-timestamp").textContent();
		expect(Number(ts)).toBeGreaterThan(0);
	});

	test("H2: useLocation returns current pathname and virtualPath", async ({ page }) => {
		await loadPage(page, "/hooks-test");
		await expect(page.getByTestId("location-pathname")).toHaveText("/hooks-test");
		await expect(page.getByTestId("location-virtualpath")).toHaveText("_root_/hooks-test");
	});

	test("H3: useMatch returns match for current route", async ({ page }) => {
		await loadPage(page, "/hooks-test");
		await expect(page.getByTestId("match-exists")).toHaveText("matched");
		await expect(page.getByTestId("match-virtualpath")).toHaveText("_root_/hooks-test");
	});

	test("H4: useParams returns params object", async ({ page }) => {
		await loadPage(page, "/hooks-test");
		const paramsText = await page.getByTestId("params-json").textContent();
		expect(paramsText).toBeTruthy();
		/* no dynamic segments on this route, so params should be empty-ish */
		expect(JSON.parse(paramsText ?? "{}")).toBeDefined();
	});

	test("H5: useSearch reflects query string", async ({ page }) => {
		await loadPage(page, "/hooks-test?filter=active&page=3");
		const searchText = await page.getByTestId("search-json").textContent();
		const parsed = JSON.parse(searchText ?? "{}");
		expect(parsed.filter).toBe("active");
		expect(parsed.page).toBe("3");
	});

	test("H6: useSearch returns empty when no query", async ({ page }) => {
		await loadPage(page, "/hooks-test");
		const searchText = await page.getByTestId("search-json").textContent();
		expect(JSON.parse(searchText ?? "{}")).toEqual({});
	});
});

test.describe("Standalone hooks — useNavigate", () => {
	test("H7: useNavigate triggers SPA navigation with search params", async ({ page }) => {
		await loadPage(page, "/hooks-test");
		await page.getByTestId("navigate-btn").click();
		await page.waitForURL("**/hooks-test?filter=active", { timeout: 5000 });
		await expect(page.getByTestId("navigate-called")).toHaveText("true");

		/* search signal updates reactively after navigate */
		await expect(page.getByTestId("search-json")).toContainText("filter", { timeout: 5000 });
	});
});

test.describe("Standalone hooks — useBlocker", () => {
	test("H8: blocker starts not-blocked with clean state", async ({ page }) => {
		await loadPage(page, "/hooks-test");
		await expect(page.getByTestId("dirty-state")).toHaveText("clean");
		await expect(page.getByTestId("blocked-state")).toHaveText("not-blocked");
	});

	test("H9: dirty toggle activates blocker condition", async ({ page }) => {
		await loadPage(page, "/hooks-test");
		await page.getByTestId("toggle-dirty").click();
		await expect(page.getByTestId("dirty-state")).toHaveText("dirty");
	});

	test("H10: navigation blocked when dirty, proceed continues", async ({ page }) => {
		await loadPage(page, "/hooks-test");
		await page.getByTestId("toggle-dirty").click();
		await expect(page.getByTestId("dirty-state")).toHaveText("dirty");

		/* attempt navigation — should be blocked */
		await page.getByTestId("about-link").click();
		await page.waitForTimeout(300);
		expect(page.url()).toContain("/hooks-test");
		await expect(page.getByTestId("blocked-state")).toHaveText("blocked");

		/* clear dirty first (otherwise blocker fires again on proceed) */
		await page.getByTestId("toggle-dirty").click();
		await expect(page.getByTestId("dirty-state")).toHaveText("clean");

		/* proceed — should navigate away */
		await page.getByTestId("proceed-btn").click();
		await page.waitForURL("**/about", { timeout: 10000 });
		expect(page.url()).toContain("/about");
	});

	test("H11: reset clears blocked state without navigating", async ({ page }) => {
		await loadPage(page, "/hooks-test");
		await page.getByTestId("toggle-dirty").click();

		/* trigger block */
		await page.getByTestId("about-link").click();
		await expect(page.getByTestId("blocked-state")).toHaveText("blocked");

		/* reset — stay on page */
		await page.getByTestId("reset-btn").click();
		await expect(page.getByTestId("blocked-state")).toHaveText("not-blocked");
		await expect(page.getByTestId("hooks-test")).toBeVisible();
	});
});

test.describe("Standalone hooks — no console errors", () => {
	test("H12: no console errors on hooks-test page", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/hooks-test");
		cap.assertClean();
	});
});
