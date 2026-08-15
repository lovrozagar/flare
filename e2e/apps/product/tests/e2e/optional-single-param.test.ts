import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

const BASE = "";

test.describe("Optional single param [[lang]] — SSR", () => {
	test("renders without param (default)", async ({ page }) => {
		await loadPage(page, "/opt-single-param");
		await expect(page.getByTestId("lang-value")).toHaveText("default");
		await expect(page.getByTestId("opt-greeting")).toHaveText("Hello");
	});

	test("renders with lang=de", async ({ page }) => {
		await loadPage(page, "/opt-single-param/de");
		await expect(page.getByTestId("lang-value")).toHaveText("de");
		await expect(page.getByTestId("opt-greeting")).toHaveText("Hallo");
	});

	test("renders with lang=fr", async ({ page }) => {
		await loadPage(page, "/opt-single-param/fr");
		await expect(page.getByTestId("lang-value")).toHaveText("fr");
		await expect(page.getByTestId("opt-greeting")).toHaveText("Bonjour");
	});

	test("layout wrapper present", async ({ page }) => {
		await loadPage(page, "/opt-single-param/es");
		await expect(page.getByTestId("opt-single-param-layout")).toBeVisible();
	});

	test("head title reflects lang", async ({ page }) => {
		await loadPage(page, "/opt-single-param/de");
		await expect(page).toHaveTitle("Lang: de");
	});

	test("head title for default", async ({ page }) => {
		await loadPage(page, "/opt-single-param");
		await expect(page).toHaveTitle("Lang: default");
	});
});

test.describe("Optional single param [[lang]] — static child", () => {
	test("about page without lang", async ({ page }) => {
		await loadPage(page, "/opt-single-param/about");
		await expect(page.getByTestId("about-lang")).toHaveText("default");
	});

	test("about page with lang=fr", async ({ page }) => {
		await loadPage(page, "/opt-single-param/fr/about");
		await expect(page.getByTestId("about-lang")).toHaveText("fr");
	});

	test("static child wins over param consumption", async ({ page }) => {
		/* /opt-single-param/about should match about route, not consume "about" as lang */
		await loadPage(page, "/opt-single-param/about");
		await expect(page.getByTestId("opt-single-about")).toBeVisible();
		await expect(page.getByTestId("about-lang")).toHaveText("default");
	});
});

test.describe("Optional single param [[lang]] — SPA navigation", () => {
	test("navigate from index to lang route", async ({ page }) => {
		await loadPage(page, "/opt-single-param");
		await navigateSPA(page, "/opt-single-param/de");
		await expect(page.getByTestId("lang-value")).toHaveText("de");
	});

	test("navigate from lang to no-lang", async ({ page }) => {
		await loadPage(page, "/opt-single-param/fr");
		await navigateSPA(page, "/opt-single-param");
		await expect(page.getByTestId("lang-value")).toHaveText("default");
	});

	test("navigate between index and about (skipping param)", async ({ page }) => {
		await loadPage(page, "/opt-single-param");
		await navigateSPA(page, "/opt-single-param/about");
		await expect(page.getByTestId("about-lang")).toHaveText("default");
	});

	test("navigate between lang/about and no-lang/about", async ({ page }) => {
		await loadPage(page, "/opt-single-param/de/about");
		await navigateSPA(page, "/opt-single-param/about");
		await expect(page.getByTestId("about-lang")).toHaveText("default");
	});
});

test.describe("Optional single param [[lang]] — NDJSON", () => {
	test("NDJSON request with lang param", async ({ page }) => {
		const response = await page.request.get(`${BASE}/opt-single-param/de`, {
			headers: { "x-d": "1" },
		});
		expect(response.status()).toBe(200);
		const text = await response.text();
		const lines = text.split("\n").filter(Boolean);
		const loaderLine = lines.find((l) => {
			const parsed = JSON.parse(l) as { d?: { lang?: string }; t: string };
			return parsed.t === "l" && parsed.d && "lang" in parsed.d;
		});
		expect(loaderLine).toBeDefined();
		const data = JSON.parse(loaderLine ?? "{}") as { d: { greeting: string; lang: string } };
		expect(data.d.lang).toBe("de");
		expect(data.d.greeting).toBe("Hallo");
	});

	test("NDJSON request without lang param", async ({ page }) => {
		const response = await page.request.get(`${BASE}/opt-single-param`, {
			headers: { "x-d": "1" },
		});
		expect(response.status()).toBe(200);
		const text = await response.text();
		const lines = text.split("\n").filter(Boolean);
		const loaderLine = lines.find((l) => {
			const parsed = JSON.parse(l) as { d?: { lang?: string }; t: string };
			return parsed.t === "l" && parsed.d && "lang" in parsed.d;
		});
		expect(loaderLine).toBeDefined();
		const data = JSON.parse(loaderLine ?? "{}") as { d: { greeting: string; lang: string } };
		expect(data.d.lang).toBe("default");
		expect(data.d.greeting).toBe("Hello");
	});
});

test.describe("Optional single param [[lang]] — console", () => {
	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/opt-single-param/en");
		await navigateSPA(page, "/opt-single-param");
		await navigateSPA(page, "/opt-single-param/about");
		cap.assertClean();
	});
});
