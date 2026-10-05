import { expect, type Page, test } from "@playwright/test";
import { loadPage } from "./helpers";

/**
 * The document state at the moment the blocking theme script sets data-theme. A MutationObserver
 * fires as a microtask in that same task, so this is strictly before hydration; reading right
 * after navigation commit instead can run before <html> exists.
 */
function themeAtFirstLand(page: Page) {
	return page.evaluate(
		() =>
			new Promise<{ colorScheme: string; hydrated: boolean; theme: string | null }>((resolve) => {
				const read = () => ({
					colorScheme: document.documentElement.style.colorScheme,
					hydrated: document.documentElement.hasAttribute("data-flare-hydrated"),
					theme: document.documentElement.getAttribute("data-theme"),
				});
				if (document.documentElement?.hasAttribute("data-theme")) return resolve(read());
				const observer = new MutationObserver(() => {
					if (!document.documentElement?.hasAttribute("data-theme")) return;
					observer.disconnect();
					resolve(read());
				});
				observer.observe(document, { attributes: true, childList: true, subtree: true });
			}),
	);
}

test.describe("theme first land", () => {
	test("blocking theme script is in SSR HTML before modulepreload and CSS", async ({ request }) => {
		const response = await request.get("/theme-dir");
		expect(response.status()).toBe(200);
		const html = await response.text();
		const themeIdx = html.indexOf("flare.theme");
		const preloadIdx = html.indexOf('rel="modulepreload"');
		const cssIdx = html.indexOf('rel="stylesheet"');
		expect(themeIdx).toBeGreaterThan(0);
		if (preloadIdx >= 0) expect(themeIdx).toBeLessThan(preloadIdx);
		if (cssIdx >= 0) expect(themeIdx).toBeLessThan(cssIdx);
		expect(html).toContain("localStorage");
		expect(html).toMatch(/nonce="[^"]+"/);
	});

	test("stored dark theme applies at first land, before hydration", async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem("flare.theme", "dark");
		});
		await page.goto("/theme-dir", { waitUntil: "commit" });
		const beforeHydrate = await themeAtFirstLand(page);
		expect(beforeHydrate.theme).toBe("dark");
		expect(beforeHydrate.colorScheme).toBe("dark");
		expect(beforeHydrate.hydrated).toBe(false);
	});

	test("system preference applies at first land, before hydration", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "dark" });
		await page.goto("/theme-dir", { waitUntil: "commit" });
		const beforeHydrate = await themeAtFirstLand(page);
		expect(beforeHydrate.theme).toBe("dark");
		expect(beforeHydrate.colorScheme).toBe("dark");
		expect(beforeHydrate.hydrated).toBe(false);
	});

	test("first land and reload both keep data-theme", async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem("flare.theme", "light");
		});
		await page.goto("/theme-dir", { waitUntil: "domcontentloaded" });
		expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");

		await page.reload({ waitUntil: "commit" });
		await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light");
		expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");
	});

	test("toggle persists across a full reload without waiting for hydrate", async ({ page }) => {
		await loadPage(page, "/theme-dir");
		const before = await page.getByTestId("theme-resolved").textContent();
		await page.getByTestId("theme-toggle").click();
		await expect.poll(async () => page.getByTestId("theme-resolved").textContent()).not.toBe(before);
		const resolved = await page.getByTestId("theme-resolved").textContent();

		await page.reload({ waitUntil: "domcontentloaded" });
		expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(resolved);
	});

	test("useTheme matches the first-paint attribute after hydrate", async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem("flare.theme", "dark");
		});
		await loadPage(page, "/theme-dir");
		await expect.poll(async () => page.getByTestId("theme-value").textContent()).toBe("dark");
		await expect.poll(async () => page.getByTestId("theme-resolved").textContent()).toBe("dark");
		expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
	});
});
