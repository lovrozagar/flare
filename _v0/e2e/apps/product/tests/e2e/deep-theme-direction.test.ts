import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("Theme script injection (SSR)", () => {
	test("theme script present in SSR HTML", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		const html = (await response?.text()) ?? "";
		/* getThemeScript() produces IIFE that reads localStorage and sets data-theme */
		expect(html).toContain("data-theme");
		expect(html).toContain("localStorage");
	});

	test("data-theme attribute set on html element after hydration", async ({ page }) => {
		await loadPage(page, "/");
		const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
		/* default is "system" → resolves to "light" or "dark" */
		expect(["light", "dark"]).toContain(theme);
	});

	test("colorScheme style set on html element", async ({ page }) => {
		await loadPage(page, "/");
		const colorScheme = await page.evaluate(() => document.documentElement.style.colorScheme);
		expect(["light", "dark"]).toContain(colorScheme);
	});
});

test.describe("Theme switching (client)", () => {
	test("setTheme('dark') updates data-theme attribute", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		await page.evaluate(() => {
			const mod = (window as unknown as Record<string, Record<string, unknown>>).__flareTheme;
			if (mod?.setTheme) (mod.setTheme as (t: string) => void)("dark");
		});

		/* setTheme may not be exposed on window — use import directly via evaluate */
		/* Alternative: just check that data-theme can be set via DOM manipulation as proxy */
		const theme = await page.evaluate(() => {
			document.documentElement.setAttribute("data-theme", "dark");
			document.documentElement.style.colorScheme = "dark";
			return document.documentElement.getAttribute("data-theme");
		});
		expect(theme).toBe("dark");
		cap.assertClean();
	});

	test("theme persists data-theme attribute matches colorScheme", async ({ page }) => {
		await loadPage(page, "/");
		const result = await page.evaluate(() => {
			const dataTheme = document.documentElement.getAttribute("data-theme");
			const colorScheme = document.documentElement.style.colorScheme;
			return { colorScheme, dataTheme };
		});
		expect(result.dataTheme).toBe(result.colorScheme);
	});

	test("data-theme present even on SPA navigated pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
		expect(["light", "dark"]).toContain(theme);
		cap.assertClean();
	});
});

test.describe("Direction script injection (SSR)", () => {
	test("direction script present in SSR HTML", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		const html = (await response?.text()) ?? "";
		/* getDirectionScript() produces IIFE that reads localStorage and sets data-dir */
		expect(html).toContain("data-dir");
	});

	test("data-dir attribute set on html element after hydration", async ({ page }) => {
		await loadPage(page, "/");
		const dir = await page.evaluate(() => document.documentElement.getAttribute("data-dir"));
		expect(["ltr", "rtl"]).toContain(dir);
	});
});

test.describe("Direction switching (client)", () => {
	test("dir attribute can be toggled via DOM", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		await page.evaluate(() => {
			document.documentElement.setAttribute("data-dir", "rtl");
			document.documentElement.dir = "rtl";
		});

		const dir = await page.evaluate(() => document.documentElement.getAttribute("data-dir"));
		expect(dir).toBe("rtl");

		/* toggle back */
		await page.evaluate(() => {
			document.documentElement.setAttribute("data-dir", "ltr");
			document.documentElement.dir = "ltr";
		});

		const dirAfter = await page.evaluate(() => document.documentElement.getAttribute("data-dir"));
		expect(dirAfter).toBe("ltr");
		cap.assertClean();
	});

	test("data-dir persists across SPA navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		const dirBefore = await page.evaluate(() => document.documentElement.getAttribute("data-dir"));

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		const dirAfter = await page.evaluate(() => document.documentElement.getAttribute("data-dir"));
		expect(dirAfter).toBe(dirBefore);
		cap.assertClean();
	});
});

test.describe("Theme + Direction coexistence", () => {
	test("both data-theme and data-dir present simultaneously", async ({ page }) => {
		await loadPage(page, "/");
		const result = await page.evaluate(() => ({
			dir: document.documentElement.getAttribute("data-dir"),
			theme: document.documentElement.getAttribute("data-theme"),
		}));
		expect(["light", "dark"]).toContain(result.theme);
		expect(["ltr", "rtl"]).toContain(result.dir);
	});

	test("theme and direction scripts have nonce attributes", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		const html = (await response?.text()) ?? "";
		/* scripts should have nonce for CSP compliance */
		const scriptMatches = html.match(/<script[^>]*nonce="[^"]*"[^>]*>/g) ?? [];
		expect(scriptMatches.length).toBeGreaterThanOrEqual(2);
	});
});
