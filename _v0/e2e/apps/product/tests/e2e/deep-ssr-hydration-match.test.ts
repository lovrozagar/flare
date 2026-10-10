import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Deep: SSR text survives hydration unchanged", () => {
	test("home page SSR text present after hydration", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		expect(await page.locator("[data-testid=home] h1").textContent()).toBe("Hello from Flare");
		cap.assertClean();
	});

	test("about page SSR content matches after hydration", async ({ page }) => {
		await loadPage(page, "/about");
		expect(await page.locator("[data-testid=about-content]").textContent()).toBe(
			"This is the about page for the Flare E2E test app.",
		);
		expect(await page.locator("[data-testid=about-year]").textContent()).toBe("2026");
	});

	test("user/42 SSR param data matches after hydration", async ({ page }) => {
		await loadPage(page, "/users/42");
		expect(await page.locator("[data-testid=user-name]").textContent()).toBe("User 42");
		expect(await page.locator("[data-testid=user-id]").textContent()).toBe("42");
	});

	test("blog post SSR title matches slug after hydration", async ({ page }) => {
		await loadPage(page, "/blog/hello-world");
		expect(await page.locator("[data-testid=post-title]").textContent()).toBe("Post: hello-world");
		expect(await page.locator("[data-testid=post-slug]").textContent()).toBe("hello-world");
	});

	test("blog layout SSR section text present after hydration", async ({ page }) => {
		await loadPage(page, "/blog");
		expect(await page.locator("[data-testid=blog-nav] span").textContent()).toBe("Blog");
	});

	test("nested layout+page SSR content both present after hydration", async ({ page }) => {
		await loadPage(page, "/blog/second-post");
		/* Layout content */
		expect(await page.locator("[data-testid=blog-nav] span").textContent()).toBe("Blog");
		/* Page content */
		expect(await page.locator("[data-testid=post-title]").textContent()).toBe("Post: second-post");
	});
});

test.describe("Deep: FlareState matches hydrated component state", () => {
	test("FlareState.p matches DOM pathname for /about", async ({ page }) => {
		await loadPage(page, "/about");
		const state = await page.evaluate(() => (self as unknown as { flare: { p: string } }).flare);
		expect(state.p).toBe("/about");
	});

	test("FlareState.p matches DOM pathname for /users/42", async ({ page }) => {
		await loadPage(page, "/users/42");
		const state = await page.evaluate(
			() => (self as unknown as { flare: { p: string; r: Record<string, string> } }).flare,
		);
		expect(state.p).toBe("/users/42");
		expect(state.r.id).toBe("42");
	});

	test("FlareState.r params match rendered param values", async ({ page }) => {
		await loadPage(page, "/users/99");
		const state = await page.evaluate(() => (self as unknown as { flare: { r: Record<string, string> } }).flare);
		expect(state.r.id).toBe("99");
		/* Rendered value matches */
		expect(await page.locator("[data-testid=user-id]").textContent()).toBe("99");
	});

	test("FlareState.r slug param matches blog post", async ({ page }) => {
		await loadPage(page, "/blog/hello-world");
		const state = await page.evaluate(() => (self as unknown as { flare: { r: Record<string, string> } }).flare);
		expect(state.r.slug).toBe("hello-world");
		expect(await page.locator("[data-testid=post-slug]").textContent()).toBe("hello-world");
	});

	test("FlareState.m has correct number of matches (page only)", async ({ page }) => {
		await loadPage(page, "/about");
		const state = await page.evaluate(
			() => (self as unknown as { flare: { m: Array<{ i: string; d: unknown }> } }).flare,
		);
		/* root-layout + about page = 2 matches */
		expect(state.m.length).toBe(2);
	});

	test("FlareState.m has correct matches for nested route (layout+page)", async ({ page }) => {
		await loadPage(page, "/blog/hello-world");
		const state = await page.evaluate(
			() => (self as unknown as { flare: { m: Array<{ i: string; d: unknown }> } }).flare,
		);
		/* root-layout + blog layout + blog post = 3 matches */
		expect(state.m.length).toBe(3);
	});

	test("FlareState.m loader data matches rendered content", async ({ page }) => {
		await loadPage(page, "/about");
		const state = await page.evaluate(() => (self as unknown as { flare: { m: Array<{ d: unknown }> } }).flare);
		/* Last match is the page match with loader data */
		const pageMatch = state.m[state.m.length - 1];
		const data = pageMatch?.d as { content: string; year: number } | undefined;
		expect(data?.content).toBe("This is the about page for the Flare E2E test app.");
		expect(data?.year).toBe(2026);
	});

	test("FlareState.c has router config", async ({ page }) => {
		await loadPage(page, "/");
		const state = await page.evaluate(() => (self as unknown as { flare: { c: Record<string, unknown> } }).flare);
		expect(state.c).toBeDefined();
		expect(typeof state.c).toBe("object");
		expect(state.c.router).toBeDefined();
	});
});

test.describe("Deep: no hydration mismatch warnings", () => {
	test("no Solid hydration warnings on /", async ({ page }) => {
		const warnings: string[] = [];
		page.on("console", (msg) => {
			const text = msg.text();
			if (text.toLowerCase().includes("hydration") || text.toLowerCase().includes("mismatch")) {
				warnings.push(text);
			}
		});
		await loadPage(page, "/");
		expect(warnings).toEqual([]);
	});

	test("no Solid hydration warnings on /about", async ({ page }) => {
		const warnings: string[] = [];
		page.on("console", (msg) => {
			const text = msg.text();
			if (text.toLowerCase().includes("hydration") || text.toLowerCase().includes("mismatch")) {
				warnings.push(text);
			}
		});
		await loadPage(page, "/about");
		expect(warnings).toEqual([]);
	});

	test("no Solid hydration warnings on /blog/hello-world (nested)", async ({ page }) => {
		const warnings: string[] = [];
		page.on("console", (msg) => {
			const text = msg.text();
			if (text.toLowerCase().includes("hydration") || text.toLowerCase().includes("mismatch")) {
				warnings.push(text);
			}
		});
		await loadPage(page, "/blog/hello-world");
		expect(warnings).toEqual([]);
	});

	test("no Solid hydration warnings on /users/42 (param route)", async ({ page }) => {
		const warnings: string[] = [];
		page.on("console", (msg) => {
			const text = msg.text();
			if (text.toLowerCase().includes("hydration") || text.toLowerCase().includes("mismatch")) {
				warnings.push(text);
			}
		});
		await loadPage(page, "/users/42");
		expect(warnings).toEqual([]);
	});

	test("no Solid hydration warnings on /props-nested (layout with preloader)", async ({ page }) => {
		const warnings: string[] = [];
		page.on("console", (msg) => {
			const text = msg.text();
			if (text.toLowerCase().includes("hydration") || text.toLowerCase().includes("mismatch")) {
				warnings.push(text);
			}
		});
		await loadPage(page, "/props-nested");
		expect(warnings).toEqual([]);
	});
});

test.describe("Deep: SSR raw HTML structure", () => {
	test("SSR HTML has data-hk markers inside body", async ({ page }) => {
		/* Fetch raw HTML without JS execution */
		const response = await page.request.get("/about");
		const html = await response.text();
		/* Solid 2 hydration keys are `_hk` (Solid 1 used data-hk). */
		expect(html).toContain("_hk=");
		const bodyStart = html.indexOf("<body");
		const afterBody = html.substring(bodyStart);
		expect(afterBody).toContain("_hk=");
	});

	test("SSR HTML has data-hk on <html> element (full-document hydration)", async ({ page }) => {
		const response = await page.request.get("/");
		const html = await response.text();
		const htmlTagMatch = html.match(/<html[^>]*>/);
		expect(htmlTagMatch).toBeTruthy();
		expect(htmlTagMatch?.[0]).toContain("_hk=");
	});

	test("SSR HTML has flare state script with self.flare=", async ({ page }) => {
		const response = await page.request.get("/about");
		const html = await response.text();
		expect(html).toContain("self.flare=");
	});

	test("SSR HTML has csp-nonce meta tag", async ({ page }) => {
		const response = await page.request.get("/");
		const html = await response.text();
		expect(html).toContain('name="csp-nonce"');
	});

	test("SSR HTML has _$HY hydration init script", async ({ page }) => {
		const response = await page.request.get("/");
		const html = await response.text();
		expect(html).toContain("window._$HY");
	});

	test("SSR HTML has correct title from head() chain", async ({ page }) => {
		const response = await page.request.get("/about");
		const html = await response.text();
		expect(html).toContain("<title>About - 2026</title>");
	});

	test("SSR HTML has entry script tag", async ({ page }) => {
		const response = await page.request.get("/");
		const html = await response.text();
		/* dev: Vite injects <script type="module" src="...">, prod: inline import() */
		expect(html).toMatch(/<script[^>]*type="module"/);
	});

	test("SSR HTML contains loader data text in body", async ({ page }) => {
		const response = await page.request.get("/about");
		const html = await response.text();
		expect(html).toContain("This is the about page for the Flare E2E test app.");
		expect(html).toContain("2026");
	});

	test("SSR HTML for /users/42 contains param-derived data", async ({ page }) => {
		const response = await page.request.get("/users/42");
		const html = await response.text();
		expect(html).toContain("User 42");
		expect(html).toContain("42");
	});
});

test.describe("Deep: SSR ↔ CSR data consistency after SPA nav", () => {
	test("SSR-rendered about data identical to SPA-navigated about data", async ({ page }) => {
		/* Load /about via SSR */
		const ssrResponse = await page.request.get("/about");
		const ssrHtml = await ssrResponse.text();

		/* Extract content from SSR HTML */
		const ssrContentMatch = ssrHtml.match(/data-testid="about-content"[^>]*>([^<]+)</);
		const ssrContent = ssrContentMatch?.[1];

		/* Now load home and SPA nav to about */
		await loadPage(page, "/");
		await navigateSPA(page, "/about");
		const csrContent = await page.locator("[data-testid=about-content]").textContent();

		expect(ssrContent).toBe(csrContent);
	});

	test("SSR-rendered user data identical to SPA-navigated user data", async ({ page }) => {
		const ssrResponse = await page.request.get("/users/77");
		const ssrHtml = await ssrResponse.text();
		const ssrNameMatch = ssrHtml.match(/data-testid="user-name"[^>]*>([^<]+)</);
		const ssrName = ssrNameMatch?.[1];

		await loadPage(page, "/");
		await navigateSPA(page, "/users/77");
		const csrName = await page.locator("[data-testid=user-name]").textContent();

		expect(ssrName).toBe(csrName);
		expect(csrName).toBe("User 77");
	});

	test("SSR FlareState.p matches post-hydration URL", async ({ page }) => {
		await loadPage(page, "/blog");
		const state = await page.evaluate(() => (self as unknown as { flare: { p: string } }).flare);
		expect(state.p).toBe("/blog");
		expect(page.url()).toContain("/blog");
	});
});

test.describe("Deep: search params in SSR and hydration", () => {
	test("FlareState.s contains search params from SSR", async ({ page }) => {
		await loadPage(page, "/about?foo=bar");
		const state = await page.evaluate(() => (self as unknown as { flare: { s: Record<string, string> } }).flare);
		expect(state.s.foo).toBe("bar");
	});

	test("FlareState.s empty when no search params", async ({ page }) => {
		await loadPage(page, "/about");
		const state = await page.evaluate(() => (self as unknown as { flare: { s: Record<string, string> } }).flare);
		expect(Object.keys(state.s).length).toBe(0);
	});

	test("multiple search params in FlareState.s", async ({ page }) => {
		await loadPage(page, "/about?a=1&b=2");
		const state = await page.evaluate(() => (self as unknown as { flare: { s: Record<string, string> } }).flare);
		expect(state.s.a).toBe("1");
		expect(state.s.b).toBe("2");
	});
});
