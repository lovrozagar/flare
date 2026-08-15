import { expect, test } from "@playwright/test";
import { assertSPANavigation, clickAndAssertSPA, loadPage, setNavMarker, setupConsoleCapture } from "./helpers";

test.describe("Deep: layout persists content across child navigations", () => {
	test("blog layout visible on both blog list and blog post pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");

		/* Layout visible with correct data */
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-nav]")).toContainText("Blog");
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible();

		/* Navigate to blog post — layout still visible */
		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");

		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-nav]")).toContainText("Blog");
		await expect(page.locator("[data-testid=blog-post]")).toBeVisible();
		expect(await page.locator("[data-testid=post-title]").textContent()).toBe("Post: hello-world");

		cap.assertClean();
	});

	test("blog layout persists through list → post → different post", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");

		/* blog list → first post */
		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");
		expect(await page.locator("[data-testid=post-title]").textContent()).toBe("Post: hello-world");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();

		/* first post → blog list → second post */
		await clickAndAssertSPA(page, "a[href='/blog']", "/blog");
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();

		await clickAndAssertSPA(page, "a[href='/blog/second-post']", "/blog/second-post");
		expect(await page.locator("[data-testid=post-title]").textContent()).toBe("Post: second-post");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-nav]")).toContainText("Blog");

		cap.assertClean();
	});

	test("navigating OUT of blog destroys layout, re-entering recreates it", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();

		/* Leave blog section entirely */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		/* Wait for about page to render (NDJSON + view transition complete) */
		await expect(page.locator("[data-testid=about]")).toBeVisible({ timeout: 5_000 });

		/* Blog layout should be gone */
		const layoutExists = await page
			.locator("[data-testid=blog-layout]")
			.isVisible()
			.catch(() => false);
		expect(layoutExists).toBe(false);

		/* Navigate back to blog — layout recreated */
		await clickAndAssertSPA(page, "a[href='/blog']", "/blog");
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-nav]")).toContainText("Blog");
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible();

		cap.assertClean();
	});
});

test.describe("Deep: layout loader data persists", () => {
	test("blog layout section text survives child page navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");

		/* Blog layout loader returns { section: "Blog" } */
		const navText = await page.locator("[data-testid=blog-nav]").textContent();
		expect(navText).toContain("Blog");

		/* Navigate to post */
		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");

		/* Layout nav text must persist */
		const navTextAfter = await page.locator("[data-testid=blog-nav]").textContent();
		expect(navTextAfter).toContain("Blog");

		/* And child has its own data */
		expect(await page.locator("[data-testid=post-title]").textContent()).toBe("Post: hello-world");

		cap.assertClean();
	});

	test("blog-content slot contains child page content (not empty)", async ({ page }) => {
		await loadPage(page, "/blog");

		/* blog-content should contain the blog list */
		const contentHtml = await page.locator("[data-testid=blog-content]").innerHTML();
		expect(contentHtml.length).toBeGreaterThan(0);
		expect(contentHtml).toContain("blog-list");

		/* Navigate to post — blog-content should now contain blog-post */
		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");
		/* Wait for post content to render after NDJSON resolves */
		await expect(page.locator("[data-testid=blog-post]")).toBeVisible({ timeout: 5_000 });
		const postContentHtml = await page.locator("[data-testid=blog-content]").innerHTML();
		expect(postContentHtml.length).toBeGreaterThan(0);
		expect(postContentHtml).toContain("blog-post");
	});
});

test.describe("Deep: layout and page data independence", () => {
	test("layout data does NOT bleed into page data", async ({ page }) => {
		await loadPage(page, "/blog/hello-world");

		/* Layout has section="Blog", page has title="Post: hello-world" */
		const navText = await page.locator("[data-testid=blog-nav]").textContent();
		expect(navText).toContain("Blog");
		expect(navText).not.toContain("hello-world");

		const postTitle = await page.locator("[data-testid=post-title]").textContent();
		expect(postTitle).toBe("Post: hello-world");
		expect(postTitle).not.toContain("Blog");
	});

	test("multiple NDJSON messages arrive for layout+page during SPA nav to blog post", async ({ page }) => {
		await loadPage(page, "/");

		const ndjsonRequests: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["x-d"] === "1") {
				ndjsonRequests.push(req.url());
			}
		});

		/* Navigate to blog post — should fetch data for both layout and page */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/blog/hello-world");
		});
		await page.waitForURL("**/blog/hello-world", { timeout: 10_000 });

		expect(ndjsonRequests.length).toBeGreaterThanOrEqual(1);
		expect(ndjsonRequests[0]).toContain("/blog/hello-world");

		/* Both layout and page rendered with correct data */
		await expect(page.locator("[data-testid=blog-nav]")).toContainText("Blog");
		expect(await page.locator("[data-testid=post-title]").textContent()).toBe("Post: hello-world");
	});
});

test.describe("Deep: history nav with layouts", () => {
	test("back from blog post to blog list preserves layout content", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");
		await setNavMarker(page);

		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");
		await expect(page.locator("[data-testid=blog-post]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();

		await page.goBack();
		await page.waitForURL("**/blog");
		await assertSPANavigation(page);
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible();

		/* Layout still present with correct data */
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=blog-nav]")).toContainText("Blog");

		cap.assertClean();
	});

	test("forward after back restores blog post with layout", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");
		await setNavMarker(page);

		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");
		await expect(page.locator("[data-testid=post-title]")).toHaveText("Post: hello-world");

		await page.goBack();
		await page.waitForURL("**/blog");
		await assertSPANavigation(page);

		await page.goForward();
		await page.waitForURL("**/blog/hello-world");
		await assertSPANavigation(page);

		/* Both layout and post content restored */
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=post-title]")).toHaveText("Post: hello-world");

		cap.assertClean();
	});
});
