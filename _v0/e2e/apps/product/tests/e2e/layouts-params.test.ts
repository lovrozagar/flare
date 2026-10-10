import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("blog layout data", () => {
	test("layout label visible on index and post", async ({ page }) => {
		await loadPage(page, "/blog");
		await expect(page.getByTestId("blog-nav")).toContainText("Blog");
		await page.getByTestId("post-link").click({ force: true });
		await page.waitForURL("**/blog/hello-world");
		await expect(page.getByTestId("blog-nav")).toContainText("Blog");
		await expect(page.getByTestId("post-slug")).toHaveText("hello-world");
	});
});

test.describe("optional + path segment + empty loaders", () => {
	test("optional locale default and value", async ({ page }) => {
		await loadPage(page, "/optional-locale");
		await expect(page.getByTestId("locale-value")).toHaveText("default");
		await loadPage(page, "/optional-locale/fr");
		await expect(page.getByTestId("locale-value")).toHaveText("fr");
	});

	test("path segment category", async ({ page }) => {
		await loadPage(page, "/path-segment-test/books/detail");
		await expect(page.getByTestId("path-seg-category")).toHaveText("books");
	});

	test("empty and null loaders render", async ({ page }) => {
		await loadPage(page, "/empty-loader");
		await expect(page.getByTestId("empty-loader-keys")).toHaveText("0");
		await loadPage(page, "/null-loader");
		await expect(page.getByTestId("null-loader-value")).toHaveText("null");
	});

	test("unknown .html is 404", async ({ page }) => {
		const res = await page.goto("/about.html");
		expect(res?.status()).toBe(404);
	});
});
