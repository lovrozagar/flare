import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

const HREF = "flare-e2e-style-resource";
const SELECTOR = `style[href="${HREF}"]`;

function headStyleCount(page: import("@playwright/test").Page) {
	return page.evaluate(
		(selector) => ({
			inHead: document.head.querySelectorAll(selector).length,
			total: document.querySelectorAll(selector).length,
		}),
		SELECTOR,
	);
}

test.describe("useHead style resource: SSR", () => {
	test("emits one deduplicated <style href> in the SSR head with the render nonce", async ({ page }) => {
		const response = await page.request.get(`${BASE}/head-style-resource`);
		const html = await response.text();
		const head = html.slice(0, html.indexOf("</head>"));

		const tags = html.match(new RegExp(`<style[^>]*href="${HREF}"[^>]*>`, "g")) ?? [];
		expect(tags).toHaveLength(1);
		expect(head).toContain(`href="${HREF}"`);

		/* The render nonce (Flare's own state script carries it in dev and prod). */
		const renderNonce = /<script data-flare-state nonce="([^"]+)"/.exec(html)?.[1];
		expect(renderNonce).toBeTruthy();
		expect(tags[0]).toContain(`nonce="${renderNonce}"`);
	});
});

test.describe("useHead style resource: hydrated", () => {
	test("adopts the SSR style instead of adding a second one, and the rule applies", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/head-style-resource");

		expect(await headStyleCount(page)).toEqual({ inHead: 1, total: 1 });
		for (const id of ["box-first", "box-second"]) {
			const width = await page.getByTestId(id).evaluate((el) => getComputedStyle(el).scrollbarWidth);
			expect(width).toBe("none");
		}
		console.assertClean();
	});

	test("keeps the shared style when one of its users unmounts", async ({ page }) => {
		await loadPage(page, "/head-style-resource");
		await page.getByTestId("toggle-second").click();
		await expect(page.getByTestId("box-second")).toHaveCount(0);

		expect(await headStyleCount(page)).toEqual({ inHead: 1, total: 1 });
		const width = await page.getByTestId("box-first").evaluate((el) => getComputedStyle(el).scrollbarWidth);
		expect(width).toBe("none");

		await page.getByTestId("toggle-second").click();
		await expect(page.getByTestId("box-second")).toBeVisible();
		expect(await headStyleCount(page)).toEqual({ inHead: 1, total: 1 });
	});
});

test.describe("useHead style resource: SPA navigation", () => {
	test("mounts the style once when the page is reached client-side", async ({ page }) => {
		await loadPage(page, "/about");
		expect(await headStyleCount(page)).toEqual({ inHead: 0, total: 0 });

		await navigateSPA(page, "/head-style-resource");
		await expect(page.getByTestId("head-style-resource")).toBeVisible();
		expect(await headStyleCount(page)).toEqual({ inHead: 1, total: 1 });
		const width = await page.getByTestId("box-first").evaluate((el) => getComputedStyle(el).scrollbarWidth);
		expect(width).toBe("none");
	});
});
