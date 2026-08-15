import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("error boundary", () => {
	test("ok path renders", async ({ page }) => {
		await loadPage(page, "/error-test");
		await expect(page.getByTestId("error-status")).toHaveText("ok");
	});

	test("loader throw uses page errorRender and 500", async ({ page }) => {
		const response = await page.goto("/error-test?fail=true");
		expect(response?.status()).toBe(500);
		await expect(page.getByTestId("error-boundary")).toBeVisible();
		await expect(page.getByTestId("error-message")).toContainText("Intentional loader error");
	});
});

test.describe("notFound helper", () => {
	test("notFound() is 404 + root boundary", async ({ page }) => {
		const response = await page.goto("/throw-not-found");
		expect(response?.status()).toBe(404);
		await expect(page.getByTestId("not-found-boundary")).toBeVisible();
	});
});

test.describe("auth errors", () => {
	test("unauthenticated() uses page boundary", async ({ page }) => {
		const response = await page.goto("/throw-unauthenticated");
		expect(response?.status()).toBe(401);
		await expect(page.getByTestId("unauthenticated-boundary")).toBeVisible();
	});

	test("unauthorized() uses page boundary", async ({ page }) => {
		const response = await page.goto("/throw-unauthorized");
		expect(response?.status()).toBe(403);
		await expect(page.getByTestId("unauthorized-boundary")).toBeVisible();
	});

	test("authenticate() without header is unauthenticated", async ({ page }) => {
		const response = await page.goto("/guarded");
		expect(response?.status()).toBe(401);
		/* authenticate() gate uses the default 401 page, not page unauthenticatedRender */
		await expect(page.getByRole("heading", { name: "401" })).toBeVisible();
		await expect(page.getByText("Unauthorized")).toBeVisible();
	});

	test("authenticate() with x-test-auth renders", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "user-9" });
		await loadPage(page, "/guarded");
		await expect(page.getByTestId("guarded-user")).toHaveText("user-9");
	});
});
