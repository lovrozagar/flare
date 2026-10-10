import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA } from "./helpers";

/* Browsers forward every document.title write to the tab strip: a navigation that writes the root
 * layout's title before the page's flashes the wrong title in the tab. */
test("a client navigation writes the tab title once, with the page's title", async ({ page }) => {
	await page.addInitScript(() => {
		const w = window as unknown as { __titleWrites: string[] };
		w.__titleWrites = [];
		const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "title");
		Object.defineProperty(Document.prototype, "title", {
			configurable: true,
			get() {
				return descriptor?.get?.call(this);
			},
			set(value: string) {
				w.__titleWrites.push(value);
				descriptor?.set?.call(this, value);
			},
		});
	});
	const takeWrites = () =>
		page.evaluate(() => (window as unknown as { __titleWrites: string[] }).__titleWrites.splice(0));

	await loadPage(page, "/");
	await takeWrites();

	await navigateSPA(page, "/about");
	await expect(page).toHaveTitle(/^About - /);
	const toAbout = await takeWrites();
	expect(toAbout).toHaveLength(1);
	expect(toAbout[0]).toMatch(/^About - /);

	await navigateSPA(page, "/");
	await expect(page).not.toHaveTitle(/^About - /);
	const home = await page.title();
	expect(await takeWrites()).toEqual([home]);
});
