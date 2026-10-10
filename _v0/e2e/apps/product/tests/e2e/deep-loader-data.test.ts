import { expect, test } from "@playwright/test";
import { assertSPANavigation, clickAndAssertSPA, loadPage, setNavMarker, setupConsoleCapture } from "./helpers";

test.describe("Deep: NDJSON fetch occurs on SPA nav", () => {
	test("SPA nav triggers NDJSON data request with flare-data header", async ({ page }) => {
		await loadPage(page, "/");

		/* Intercept requests to detect NDJSON fetch */
		const ndjsonRequests: { url: string; headers: Record<string, string> }[] = [];
		page.on("request", (req) => {
			const xd = req.headers()["flare-data"];
			if (xd === "1") {
				ndjsonRequests.push({ headers: req.headers(), url: req.url() });
			}
		});

		await clickAndAssertSPA(page, "a[href='/about']", "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();

		expect(ndjsonRequests.length).toBeGreaterThanOrEqual(1);
		expect(ndjsonRequests[0].url).toContain("/about");
		expect(ndjsonRequests[0].headers["flare-data"]).toBe("1");
	});

	test("NDJSON response returns 200 with correct content type", async ({ page }) => {
		await loadPage(page, "/");

		const ndjsonResponses: { status: number; contentType: string }[] = [];
		page.on("response", (res) => {
			const req = res.request();
			if (req.headers()["flare-data"] === "1") {
				ndjsonResponses.push({
					contentType: res.headers()["content-type"] ?? "",
					status: res.status(),
				});
			}
		});

		await clickAndAssertSPA(page, "a[href='/about']", "/about");
		await expect(page.locator("[data-testid=about-content]")).toBeVisible();

		expect(ndjsonResponses.length).toBeGreaterThanOrEqual(1);
		expect(ndjsonResponses[0].status).toBe(200);
		expect(ndjsonResponses[0].contentType).toContain("application/x-ndjson");
	});
});

test.describe("Deep: loader data values are correct after SPA nav", () => {
	test("about page loader data values match exactly after SPA nav", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		await clickAndAssertSPA(page, "a[href='/about']", "/about");

		/* Verify exact data values, not just visibility */
		const content = await page.locator("[data-testid=about-content]").textContent();
		expect(content).toBe("This is the about page for the Flare E2E test app.");

		const year = await page.locator("[data-testid=about-year]").textContent();
		expect(year).toBe("2026");

		cap.assertClean();
	});

	test("user page loader data derives from params after SPA nav", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/about");

		await clickAndAssertSPA(page, "a[href='/users/1']", "/users/1");

		const name = await page.locator("[data-testid=user-name]").textContent();
		expect(name).toBe("User 1");

		const id = await page.locator("[data-testid=user-id]").textContent();
		expect(id).toBe("1");

		cap.assertClean();
	});

	test("param change updates loader data via NDJSON (not cached stale data)", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/users/1");

		await expect(page.locator("[data-testid=user-name]")).toHaveText("User 1");

		/* Track NDJSON requests for param change */
		let ndjsonFired = false;
		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1" && req.url().includes("/users/2")) {
				ndjsonFired = true;
			}
		});

		await clickAndAssertSPA(page, "a[href='/users/2']", "/users/2");

		/* Wait for new loader data to render after NDJSON resolves */
		await expect(page.locator("[data-testid=user-name]")).toHaveText("User 2", { timeout: 5_000 });
		await expect(page.locator("[data-testid=user-id]")).toHaveText("2");

		/* Verify data actually came from new NDJSON fetch, not stale cache */
		expect(ndjsonFired).toBe(true);

		cap.assertClean();
	});

	test("back then forward preserves correct loader data per page", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await setNavMarker(page);

		/* Navigate / → /about → back → forward */
		await clickAndAssertSPA(page, "a[href='/about']", "/about");
		const aboutYear = await page.locator("[data-testid=about-year]").textContent();
		expect(aboutYear).toBe("2026");

		await page.goBack();
		await page.waitForURL("**/");
		await assertSPANavigation(page);

		/* Home must have its own data, not about's */
		const timestamp = await page.locator("[data-testid=timestamp]").textContent();
		expect(Number(timestamp)).toBeGreaterThan(0);

		await page.goForward();
		await page.waitForURL("**/about");
		await assertSPANavigation(page);

		/* About data must still be correct after forward nav */
		const aboutYear2 = await page.locator("[data-testid=about-year]").textContent();
		expect(aboutYear2).toBe("2026");

		cap.assertClean();
	});
});

test.describe("Deep: SSR vs CSR data consistency", () => {
	test("SSR-rendered data matches what CSR nav produces (about)", async ({ page, context }) => {
		/* Load about via SSR first, capture data */
		await loadPage(page, "/about");
		const ssrContent = await page.locator("[data-testid=about-content]").textContent();
		const ssrYear = await page.locator("[data-testid=about-year]").textContent();

		/* Load home, then navigate to about via SPA */
		const page2 = await context.newPage();
		await loadPage(page2, "/");
		await clickAndAssertSPA(page2, "a[href='/about']", "/about");
		const csrContent = await page2.locator("[data-testid=about-content]").textContent();
		const csrYear = await page2.locator("[data-testid=about-year]").textContent();

		/* SSR and CSR must produce identical data */
		expect(csrContent).toBe(ssrContent);
		expect(csrYear).toBe(ssrYear);

		await page2.close();
	});

	test("SSR-rendered data matches CSR nav (users/42)", async ({ page, context }) => {
		await loadPage(page, "/users/42");
		const ssrName = await page.locator("[data-testid=user-name]").textContent();
		const ssrId = await page.locator("[data-testid=user-id]").textContent();

		const page2 = await context.newPage();
		await loadPage(page2, "/about");
		await clickAndAssertSPA(page2, "a[href='/users/1']", "/users/1");
		/* Navigate to /users/42 via programmatic nav */
		await page2.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/users/42");
		});
		await page2.waitForURL("**/users/42", { timeout: 10_000 });
		/* Wait for NDJSON data to render before reading */
		await expect(page2.locator("[data-testid=user-name]")).toHaveText("User 42", { timeout: 5_000 });
		const csrName = await page2.locator("[data-testid=user-name]").textContent();
		const csrId = await page2.locator("[data-testid=user-id]").textContent();

		expect(csrName).toBe(ssrName);
		expect(csrId).toBe(ssrId);

		await page2.close();
	});
});

test.describe("Deep: FlareState correctness", () => {
	test("FlareState.p matches actual URL pathname", async ({ page }) => {
		for (const path of ["/", "/about", "/blog", "/users/1", "/blog/hello-world"]) {
			await page.goto(path, { waitUntil: "domcontentloaded" });
			const state = await page.evaluate(() => (self as unknown as { flare?: Record<string, unknown> }).flare);
			expect(state).toBeDefined();
			expect((state as Record<string, unknown>).p).toBe(path);
		}
	});

	test("FlareState.r has correct params for dynamic routes", async ({ page }) => {
		await page.goto("/users/42", { waitUntil: "domcontentloaded" });
		const state = (await page.evaluate(() => (self as unknown as { flare?: Record<string, unknown> }).flare)) as {
			r: Record<string, string>;
		};
		expect(state.r.id).toBe("42");
	});

	test("FlareState.r has slug param for blog posts", async ({ page }) => {
		await page.goto("/blog/hello-world", { waitUntil: "domcontentloaded" });
		const state = (await page.evaluate(() => (self as unknown as { flare?: Record<string, unknown> }).flare)) as {
			r: Record<string, string>;
		};
		expect(state.r.slug).toBe("hello-world");
	});

	test("FlareState.m has match entries with data for each route segment", async ({ page }) => {
		await page.goto("/about", { waitUntil: "domcontentloaded" });
		const state = (await page.evaluate(() => (self as unknown as { flare?: Record<string, unknown> }).flare)) as {
			m: Array<{ d?: unknown }>;
		};
		/* at least root-layout match + page match */
		expect(state.m.length).toBeGreaterThanOrEqual(2);
		/* page match should have loader data with year/content */
		const pageMatch = state.m[state.m.length - 1];
		expect(pageMatch.d).toBeDefined();
		const data = pageMatch.d as { content: string; year: number };
		expect(data.year).toBe(2026);
		expect(data.content).toBe("This is the about page for the Flare E2E test app.");
	});

	test("FlareState.c contains router config", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const state = (await page.evaluate(() => (self as unknown as { flare?: Record<string, unknown> }).flare)) as {
			c: { router?: unknown };
		};
		expect(state.c).toBeDefined();
		expect(state.c.router).toBeDefined();
	});
});

test.describe("Deep: blog list posts verify NDJSON data", () => {
	test("blog list has exactly 3 posts with correct titles after SSR", async ({ page }) => {
		await loadPage(page, "/blog");
		const links = page.locator("[data-testid=blog-list] a");
		await expect(links).toHaveCount(3);
		await expect(links.nth(0)).toHaveText("Hello World");
		await expect(links.nth(1)).toHaveText("Second Post");
		await expect(links.nth(2)).toHaveText("Third Post");
	});

	test("blog list has exactly 3 posts after SPA nav from home", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await clickAndAssertSPA(page, "a[href='/blog']", "/blog");

		const links = page.locator("[data-testid=blog-list] a");
		await expect(links).toHaveCount(3);
		await expect(links.nth(0)).toHaveText("Hello World");
		await expect(links.nth(1)).toHaveText("Second Post");
		await expect(links.nth(2)).toHaveText("Third Post");

		cap.assertClean();
	});

	test("blog post title matches slug from SPA nav", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");

		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");
		const title = await page.locator("[data-testid=post-title]").textContent();
		expect(title).toBe("Post: hello-world");

		const slug = await page.locator("[data-testid=post-slug]").textContent();
		expect(slug).toBe("hello-world");

		cap.assertClean();
	});

	test("navigating between blog posts updates both title and slug", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");

		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world");
		expect(await page.locator("[data-testid=post-title]").textContent()).toBe("Post: hello-world");
		expect(await page.locator("[data-testid=post-slug]").textContent()).toBe("hello-world");

		/* Navigate back to blog list then to second post */
		await clickAndAssertSPA(page, "a[href='/blog']", "/blog");
		await clickAndAssertSPA(page, "a[href='/blog/second-post']", "/blog/second-post");

		expect(await page.locator("[data-testid=post-title]").textContent()).toBe("Post: second-post");
		expect(await page.locator("[data-testid=post-slug]").textContent()).toBe("second-post");

		cap.assertClean();
	});
});

test.describe("Deep: multi-hop data integrity", () => {
	test("/ → /about → /users/1 → /blog all load correct data", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		/* Home has timestamp > 0 */
		const ts = await page.locator("[data-testid=timestamp]").textContent();
		expect(Number(ts)).toBeGreaterThan(0);

		/* Navigate to about */
		await clickAndAssertSPA(page, "a[href='/about']", "/about");
		expect(await page.locator("[data-testid=about-content]").textContent()).toBe(
			"This is the about page for the Flare E2E test app.",
		);
		expect(await page.locator("[data-testid=about-year]").textContent()).toBe("2026");

		/* Navigate to users/1 */
		await clickAndAssertSPA(page, "a[href='/users/1']", "/users/1");
		expect(await page.locator("[data-testid=user-name]").textContent()).toBe("User 1");
		expect(await page.locator("[data-testid=user-id]").textContent()).toBe("1");

		/* Navigate back to home then to blog */
		await clickAndAssertSPA(page, "a[href='/']", "/");
		await clickAndAssertSPA(page, "a[href='/blog']", "/blog");
		const blogLinks = page.locator("[data-testid=blog-list] a");
		await expect(blogLinks).toHaveCount(3);

		cap.assertClean();
	});
});
