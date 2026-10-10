import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("i18n — SSR", () => {
	test("renders default locale (en) without prefix", async ({ page }) => {
		await loadPage(page, "/i18n-test");
		await expect(page.getByTestId("app-name")).toHaveText("My App");
		await expect(page.getByTestId("greeting")).toHaveText("Hello Flare");
		await expect(page.getByTestId("locale-value")).toHaveText("en");
	});

	test("renders hr locale with prefix", async ({ page }) => {
		await loadPage(page, "/i18n-test/hr");
		await expect(page.getByTestId("app-name")).toHaveText("Moja Aplikacija");
		await expect(page.getByTestId("greeting")).toHaveText("Bok Flare");
		await expect(page.getByTestId("locale-value")).toHaveText("hr");
	});

	test("pluralization — zero items", async ({ page }) => {
		await loadPage(page, "/i18n-test");
		await expect(page.getByTestId("items-zero")).toHaveText("No items");
	});

	test("pluralization — one item", async ({ page }) => {
		await loadPage(page, "/i18n-test");
		await expect(page.getByTestId("items-one")).toHaveText("1 item");
	});

	test("pluralization — many items", async ({ page }) => {
		await loadPage(page, "/i18n-test");
		await expect(page.getByTestId("items-many")).toHaveText("5 items");
	});

	test("missing key returns key string", async ({ page }) => {
		await loadPage(page, "/i18n-test");
		await expect(page.getByTestId("missing-key")).toHaveText("common.nonexistent");
	});

	test("hr pluralization", async ({ page }) => {
		await loadPage(page, "/i18n-test/hr");
		await expect(page.getByTestId("items-zero")).toHaveText("Nema stavki");
		await expect(page.getByTestId("items-one")).toHaveText("1 stavka");
		await expect(page.getByTestId("items-many")).toHaveText("5 stavki");
	});
});

test.describe("i18n — SPA navigation", () => {
	test("navigate from default to hr", async ({ page }) => {
		await loadPage(page, "/i18n-test");
		await expect(page.getByTestId("app-name")).toHaveText("My App");

		await navigateSPA(page, "/i18n-test/hr");
		await expect(page.getByTestId("app-name")).toHaveText("Moja Aplikacija");
		await expect(page.getByTestId("greeting")).toHaveText("Bok Flare");
	});

	test("navigate from hr back to default", async ({ page }) => {
		await loadPage(page, "/i18n-test/hr");
		await expect(page.getByTestId("locale-value")).toHaveText("hr");

		await navigateSPA(page, "/i18n-test");
		await expect(page.getByTestId("locale-value")).toHaveText("en");
		await expect(page.getByTestId("app-name")).toHaveText("My App");
	});
});

test.describe("i18n — NDJSON", () => {
	test("NDJSON request returns translated data for hr", async ({ page }) => {
		const response = await page.request.get(`${BASE}/i18n-test/hr`, {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(200);
		const text = await response.text();
		const lines = text.split("\n").filter(Boolean);
		const loaderLine = lines.find((l) => {
			const parsed = JSON.parse(l) as { d?: { t?: unknown }; t: string };
			return parsed.t === "l" && parsed.d && "t" in parsed.d;
		});
		expect(loaderLine).toBeDefined();
		const data = JSON.parse(loaderLine ?? "{}") as { d: { t: { common: Record<string, string> } } };
		expect(data.d.t.common["app.name"]).toBe("Moja Aplikacija");
	});
});

test.describe("i18n — console", () => {
	test("no console errors during locale navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/i18n-test");
		await navigateSPA(page, "/i18n-test/hr");
		cap.assertClean();
	});
});
