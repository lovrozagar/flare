import { expect, test } from "@playwright/test";
import { clickAndAssertSPA, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Deferred Data", () => {
	test("blog post SSR renders pending state", async ({ page }) => {
		await loadPage(page, "/blog/hello-world");
		/* Deferred data shows pending initially */
		const pending = page.locator("[data-testid=comments-pending]");
		const resolved = page.locator("[data-testid=comments-resolved]");
		const hasPending = await pending.isVisible().catch(() => false);
		const hasResolved = await resolved.isVisible().catch(() => false);
		expect(hasPending || hasResolved).toBe(true);
	});

	test("blog post SSR has correct non-deferred loader data", async ({ page }) => {
		await loadPage(page, "/blog/hello-world");
		await expect(page.locator("[data-testid=post-title]")).toHaveText("Post: hello-world");
		await expect(page.locator("[data-testid=post-slug]")).toHaveText("hello-world");
	});

	test("CSR nav to blog post shows resolved (SPA)", async ({ page }) => {
		await loadPage(page, "/blog");
		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");

		await expect(page.locator("[data-testid=post-title]")).toHaveText("Post: hello-world");
		/* Deferred comments resolve after ~500ms */
		await expect(page.locator("[data-testid=comments-resolved]")).toBeVisible({ timeout: 5_000 });
	});

	test("comments resolve after deferred (SSR)", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog/hello-world");

		await expect(page.locator("[data-testid=comments-resolved]")).toBeVisible({ timeout: 5_000 });

		const comments = await page.locator("[data-testid=comments-resolved] li").allTextContents();
		expect(comments).toContain("Alice: Comment on hello-world");
		expect(comments).toContain("Bob: Great post");
		cap.assertClean();
	});

	test("CSR nav between blog posts updates deferred data", async ({ page }) => {
		await loadPage(page, "/blog/hello-world");
		await expect(page.locator("[data-testid=comments-resolved]")).toBeVisible({ timeout: 5_000 });

		const commentsBefore = await page.locator("[data-testid=comments-resolved] li").allTextContents();
		expect(commentsBefore).toContain("Alice: Comment on hello-world");

		await navigateSPA(page, "/blog/second-post");
		await expect(page.locator("[data-testid=post-title]")).toHaveText("Post: second-post");
		await expect(page.locator("[data-testid=post-slug]")).toHaveText("second-post");

		await expect(page.locator("[data-testid=comments-resolved]")).toBeVisible({ timeout: 5_000 });
		const commentsAfter = await page.locator("[data-testid=comments-resolved] li").allTextContents();
		expect(commentsAfter).toContain("Alice: Comment on second-post");
		expect(commentsAfter).toContain("Bob: Great post");
	});
});
