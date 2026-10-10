import { expect, test } from "@playwright/test";
import { clickAndAssertSPA, loadPage, setupConsoleCapture } from "./helpers";

test.describe("Deep: meta tag cleanup on SPA navigation", () => {
	test("description meta removed when navigating away from head-demo", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-demo");

		/* head-demo has description meta */
		await expect(page.locator("head meta[name='description']")).toHaveCount(1);

		/* Navigate to home — home has no description meta */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/");
		});
		await page.waitForURL("**/", { timeout: 10_000 });

		/* Description meta should be cleaned up (head-demo's meta removed) */
		const descCount = await page.locator("head meta[name='description']").count();
		expect(descCount).toBe(0);

		cap.assertClean();
	});

	test("OG meta tags removed when navigating away from head-demo", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-demo");

		await expect(page.locator("head meta[property='og:title']")).toHaveCount(1);
		await expect(page.locator("head meta[property='og:type']")).toHaveCount(1);

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		/* OG tags should be cleaned up */
		const ogTitleCount = await page.locator("head meta[property='og:title']").count();
		expect(ogTitleCount).toBe(0);

		const ogTypeCount = await page.locator("head meta[property='og:type']").count();
		expect(ogTypeCount).toBe(0);

		cap.assertClean();
	});

	test("Twitter meta tags removed when navigating away from head-demo", async ({ page }) => {
		await loadPage(page, "/head-demo");

		await expect(page.locator("head meta[name='twitter:card']")).toHaveCount(1);

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/");
		});
		await page.waitForURL("**/", { timeout: 10_000 });

		const twitterCount = await page.locator("head meta[name='twitter:card']").count();
		expect(twitterCount).toBe(0);
	});

	test("canonical link removed when navigating away from head-demo", async ({ page }) => {
		await loadPage(page, "/head-demo");

		await expect(page.locator("head link[rel='canonical']")).toHaveCount(1);

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		const canonicalCount = await page.locator("head link[rel='canonical']").count();
		expect(canonicalCount).toBe(0);
	});

	test("JSON-LD script removed when navigating away from head-demo", async ({ page }) => {
		await loadPage(page, "/head-demo");

		const jsonLdCount = await page.locator("head script[type='application/ld+json']").count();
		expect(jsonLdCount).toBe(1);

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/");
		});
		await page.waitForURL("**/", { timeout: 10_000 });

		const jsonLdAfter = await page.locator("head script[type='application/ld+json']").count();
		expect(jsonLdAfter).toBe(0);
	});
});

test.describe("Deep: no stale/duplicate meta tags after round-trip", () => {
	test("home → head-demo → home: no leftover head-demo meta", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await expect(page).toHaveTitle("Home");

		/* Navigate to head-demo */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/head-demo");
		});
		await page.waitForURL("**/head-demo", { timeout: 10_000 });
		await expect(page).toHaveTitle("Head Demo");

		/* Navigate back to home */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/");
		});
		await page.waitForURL("**/", { timeout: 10_000 });
		await expect(page).toHaveTitle("Home");

		/* No leftover OG/Twitter/description/canonical/jsonLd from head-demo */
		expect(await page.locator("head meta[property='og:title']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(0);
		expect(await page.locator("head meta[name='description']").count()).toBe(0);
		expect(await page.locator("head link[rel='canonical']").count()).toBe(0);
		expect(await page.locator("head script[type='application/ld+json']").count()).toBe(0);

		cap.assertClean();
	});

	test("about → head-demo → about: about description replaces head-demo description", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/about");

		/* About has description "About this app" */
		await expect(page.locator("head meta[name='description']")).toHaveAttribute("content", "About this app");

		/* Navigate to head-demo — different description */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/head-demo");
		});
		await page.waitForURL("**/head-demo", { timeout: 10_000 });
		await expect(page.locator("head meta[name='description']")).toHaveAttribute(
			"content",
			/complex head configuration/,
		);

		/* Navigate back to about */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		/* About description restored, not head-demo's */
		await expect(page.locator("head meta[name='description']")).toHaveAttribute("content", "About this app");

		/* Only one description meta (no duplicates) */
		expect(await page.locator("head meta[name='description']").count()).toBe(1);

		cap.assertClean();
	});
});

test.describe("Deep: head updates through multi-hop SPA chain", () => {
	test("title tracks through / → /about → /head-demo → /blog → /blog/hello-world", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await expect(page).toHaveTitle("Home");

		await clickAndAssertSPA(page, "a[href='/about']", "/about");
		await expect(page).toHaveTitle("About - 2026");

		await clickAndAssertSPA(page, "a[href='/head-demo']", "/head-demo");
		await expect(page).toHaveTitle("Head Demo");

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/blog");
		});
		await page.waitForURL("**/blog", { timeout: 10_000 });
		await expect(page).toHaveTitle("Blog");

		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");
		await expect(page).toHaveTitle("Post: hello-world");

		cap.assertClean();
	});

	test("user page title updates with param (SPA)", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/users/1");
		await expect(page).toHaveTitle("User 1");

		await clickAndAssertSPA(page, "a[href='/users/2']", "/users/2");
		await expect(page).toHaveTitle("User 2");

		cap.assertClean();
	});
});

test.describe("Deep: title fallback to root layout when page has no .head()", () => {
	test("navigating from Home to page without .head() resets title to root layout", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await expect(page).toHaveTitle("Home");

		/* Navigate to empty-loader — has no .head() defined */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/empty-loader");
		});
		await page.waitForURL("**/empty-loader", { timeout: 10_000 });

		/* Title should fall back to root layout's "Flare E2E", NOT stay as "Home" */
		await expect(page).toHaveTitle("Flare E2E");

		cap.assertClean();
	});

	test("navigating from head-demo to page without .head() cleans all meta", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-demo");
		await expect(page).toHaveTitle("Head Demo");
		await expect(page.locator("head meta[name='description']")).toHaveCount(1);

		/* Navigate to empty-loader — has no .head() defined */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/empty-loader");
		});
		await page.waitForURL("**/empty-loader", { timeout: 10_000 });

		/* Title falls back to root layout */
		await expect(page).toHaveTitle("Flare E2E");

		/* All page-specific meta cleaned up */
		expect(await page.locator("head meta[name='description']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:title']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(0);

		cap.assertClean();
	});
});

test.describe("Deep: OG/Twitter/JSON-LD exact values via SPA", () => {
	test("SPA nav to head-demo populates all OG/Twitter/JSON-LD tags", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/about");

		await clickAndAssertSPA(page, "a[href='/head-demo']", "/head-demo");

		/* OG tags */
		await expect(page.locator("head meta[property='og:title']")).toHaveAttribute("content", "Head Demo - OG");
		await expect(page.locator("head meta[property='og:type']")).toHaveAttribute("content", "website");
		await expect(page.locator("head meta[property='og:description']")).toHaveAttribute(
			"content",
			"OG description for head demo",
		);

		/* Twitter tags */
		await expect(page.locator("head meta[name='twitter:card']")).toHaveAttribute("content", "summary");
		await expect(page.locator("head meta[name='twitter:title']")).toHaveAttribute("content", "Head Demo - Twitter");
		await expect(page.locator("head meta[name='twitter:description']")).toHaveAttribute(
			"content",
			"Twitter description for head demo",
		);

		/* Canonical */
		await expect(page.locator("head link[rel='canonical']")).toHaveAttribute("href", "https://example.com/head-demo");

		/* JSON-LD */
		const jsonLdContent = await page.locator("head script[type='application/ld+json']").evaluate((el) => el.innerHTML);
		const parsed = JSON.parse(jsonLdContent) as Record<string, unknown>;
		expect(parsed["@type"]).toBe("WebPage");
		expect(parsed["name"]).toBe("Head Demo");

		cap.assertClean();
	});
});
