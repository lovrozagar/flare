import { expect, test } from "@playwright/test";
import { clickAndAssertSPA, loadPage } from "./helpers";

test.describe("fsVirtualPaths true — SSR + hydrate", () => {
	test("home", async ({ page }) => {
		await loadPage(page, "/");
		await expect(page.getByTestId("home")).toBeVisible();
		await expect(page).toHaveTitle(/FS paths/);
	});

	test("about", async ({ page }) => {
		await loadPage(page, "/about");
		await expect(page.getByTestId("about")).toHaveText("About");
	});

	test("blog list uses (blog) layout", async ({ page }) => {
		await loadPage(page, "/blog");
		await expect(page.getByTestId("blog-layout")).toBeVisible();
		await expect(page.getByTestId("blog-list")).toHaveText("Blog");
	});

	test("blog post param + layout", async ({ page }) => {
		await loadPage(page, "/blog/hello");
		await expect(page.getByTestId("blog-layout")).toBeVisible();
		await expect(page.getByTestId("blog-post")).toHaveText("hello");
	});

	test("login uses (auth) layout", async ({ page }) => {
		await loadPage(page, "/login");
		await expect(page.getByTestId("auth-layout")).toBeVisible();
		await expect(page.getByTestId("login")).toHaveText("Login");
	});

	test("dynamic user id", async ({ page }) => {
		await loadPage(page, "/users/42");
		await expect(page.getByTestId("user")).toHaveText("42");
	});

	test("catch-all files path", async ({ page }) => {
		await loadPage(page, "/files/a/b/c");
		await expect(page.getByTestId("files")).toContainText("a");
	});

	test("deep-cache nested layouts", async ({ page }) => {
		await loadPage(page, "/deep-cache");
		await expect(page.getByTestId("dc-l1")).toBeVisible();
		await expect(page.getByTestId("dc-l2")).toBeVisible();
		await expect(page.getByTestId("dc-l3")).toBeVisible();
		await expect(page.getByTestId("deep-cache")).toContainText("Deep cache");
	});

	test("deep-cache uncached sibling", async ({ page }) => {
		await loadPage(page, "/deep-cache/uncached");
		await expect(page.getByTestId("dc-l3")).toBeVisible();
		await expect(page.getByTestId("deep-uncached")).toHaveText("Uncached");
	});

	test("optional locale skipped", async ({ page }) => {
		await loadPage(page, "/optional-locale");
		await expect(page.getByTestId("opt-locale")).toHaveText("none");
	});

	test("optional locale consumed", async ({ page }) => {
		await loadPage(page, "/optional-locale/fr");
		await expect(page.getByTestId("opt-locale")).toHaveText("fr");
	});

	test("escaped [_]internal", async ({ page }) => {
		await loadPage(page, "/_internal");
		await expect(page.getByTestId("internal")).toHaveText("Internal");
	});

	test("admin root-scope dashboard", async ({ page }) => {
		await loadPage(page, "/dashboard");
		await expect(page.getByTestId("admin-root")).toBeVisible();
		await expect(page.getByTestId("admin-dash")).toHaveText("Admin dashboard");
	});

	test("pre-root [locale] home", async ({ page }) => {
		await loadPage(page, "/hr");
		await expect(page.getByTestId("locale-root")).toBeVisible();
		await expect(page.getByTestId("locale-home")).toHaveText("hr");
	});

	test("sitemap.xml response route", async ({ request }) => {
		const res = await request.get("/sitemap.xml");
		expect(res.status()).toBe(200);
		expect(res.headers()["content-type"] ?? "").toContain("xml");
		expect(await res.text()).toContain("<urlset");
	});

	test("unknown path is 404", async ({ page }) => {
		const res = await page.goto("/this-is-not-a-route");
		expect(res?.status()).toBe(404);
	});
});

test.describe("fsVirtualPaths true — SPA", () => {
	test("home → about is SPA", async ({ page }) => {
		await loadPage(page, "/");
		await clickAndAssertSPA(page, "a[href='/about']", "/about");
		await expect(page.getByTestId("about")).toBeVisible();
	});

	test("home → blog keeps layout after SPA", async ({ page }) => {
		await loadPage(page, "/");
		await clickAndAssertSPA(page, "a[href='/blog']", "/blog");
		await expect(page.getByTestId("blog-layout")).toBeVisible();
		await expect(page.getByTestId("blog-list")).toBeVisible();
	});

	test("home → user param", async ({ page }) => {
		await loadPage(page, "/");
		await clickAndAssertSPA(page, "a[href='/users/42']", "/users/42");
		await expect(page.getByTestId("user")).toHaveText("42");
	});

	test("home → deep-cache then uncached stays in stacked layouts", async ({ page }) => {
		await loadPage(page, "/");
		await clickAndAssertSPA(page, "a[href='/deep-cache']", "/deep-cache");
		await expect(page.getByTestId("deep-cache")).toBeVisible();
		await clickAndAssertSPA(page, "[data-testid=to-uncached]", "/deep-cache/uncached");
		await expect(page.getByTestId("dc-l1")).toBeVisible();
		await expect(page.getByTestId("deep-uncached")).toBeVisible();
	});

	test("home → dashboard crosses to _admin_ root (full load ok)", async ({ page }) => {
		await loadPage(page, "/");
		await page.click("a[href='/dashboard']");
		await page.waitForURL("**/dashboard", { timeout: 10_000 });
		await expect(page.getByTestId("admin-root")).toBeVisible();
		await expect(page.getByTestId("admin-dash")).toBeVisible();
	});
});

test.describe("cdn + origin store", () => {
	test("cached page emits Cache-Control and Flare-Render ISR", async ({ request }) => {
		let res = await request.get("/about");
		if (res.status() >= 500) res = await request.get("/about");
		expect(res.status()).toBe(200);
		const cacheControl = res.headers()["cache-control"] ?? "";
		expect(cacheControl).toContain("public");
		expect(cacheControl).toContain("max-age=86400");
		expect(cacheControl).toContain("stale-while-revalidate=604800");
		expect(res.headers()["surrogate-key"]).toBe("fs-paths");
		expect((res.headers()["flare-render"] ?? "").toUpperCase()).toBe("ISR");
	});

	test("second request can hit the origin store", async ({ request }) => {
		await request.get("/about");
		const res = await request.get("/about");
		expect(res.status()).toBe(200);
		const status = (res.headers()["flare-cache"] ?? "").toUpperCase();
		expect(["HIT", "STALE", "MISS"]).toContain(status);
	});

	test("uncached sibling stays SSR without CDN headers", async ({ request }) => {
		const res = await request.get("/deep-cache/uncached");
		expect(res.status()).toBe(200);
		expect((res.headers()["flare-render"] ?? "").toUpperCase()).toBe("SSR");
		expect(res.headers()["cache-control"] ?? "").not.toContain("max-age=86400");
		expect(res.headers()["surrogate-key"] ?? "").not.toContain("fs-paths");
	});
});

test.describe("@prod-only hashed assets", () => {
	test("HTML references /assets/ modules", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();
		expect(html).toMatch(/\/assets\/[^"]+\.js/);
		expect(html).not.toContain("/@vite/client");
		expect(html).not.toContain('src="/src/');
	});
});

test.describe("@dev-only fs inspector", () => {
	test("devtools host mounts", async ({ page }) => {
		await loadPage(page, "/");
		await expect(page.locator("#__flare-devtools-host")).toHaveCount(1);
	});
});
