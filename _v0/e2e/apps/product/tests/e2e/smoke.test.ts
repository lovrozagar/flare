import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("SSR + hydration", () => {
	test("home returns HTML", async ({ page }) => {
		const response = await page.goto("/");
		expect(response).not.toBeNull();
		expect(response?.status()).toBe(200);
		expect(response?.headers()["content-type"]).toContain("text/html");
	});

	test("html lang is en", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
	});

	test("home hydrates with FlareState", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/");
		await expect(page.getByTestId("home-heading")).toHaveText("Hello from Flare");
		console.assertClean();
	});

	test("about hydrates with loader data", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/about");
		await expect(page.getByTestId("about-content")).toHaveText("This is the about page for the Flare E2E test app.");
		await expect(page.getByTestId("about-year")).toHaveText("2026");
		console.assertClean();
	});

	test("route headers are set", async ({ page }) => {
		const response = await page.goto("/");
		expect(response?.headers()["x-powered-by"]).toBe("flare");
		expect(response?.headers()["x-middleware-ran"]).toBe("true");
	});
});
