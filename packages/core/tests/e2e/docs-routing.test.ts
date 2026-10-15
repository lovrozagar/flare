import { deepOnly, documents, expect, isProd, open, sessionCookie, test } from "./docs.fixture.ts";

// Route files, params, boundaries, and the two roots (bits/15 docs-routing).
deepOnly();

test("slug params", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/caching");
	await expect(page.locator("#doc-title")).toHaveText("Caching");
	await expect(page.locator("#hook-params")).toContainText('"slug":"caching"');
});

test("ssg unknown slug", async ({ page, docs }) => {
	const response = await page.goto(`${docs.origin}/docs/not-a-doc`);
	expect(response?.status()).toBe(404);
});

test("catch-all", async ({ page, docs }) => {
	await open(page, docs.origin, "/api/router/create-router");
	await expect(page.locator("#api-name")).toHaveText("createRouter");
	// An unknown entry is a 404: the loader throws `notFound()` and the page paints its own not-found (BUGS.md 105).
	const unknown = await page.goto(`${docs.origin}/api/x/y/z`);
	expect(unknown?.status()).toBe(404);
	await expect(page.locator("#api-unknown")).toHaveText("No entry at /x/y/z");
});

test("optional catch-all", async ({ page, docs }) => {
	await open(page, docs.origin, "/examples");
	await expect(page.locator("#examples-rest")).toHaveText("null");
	await open(page, docs.origin, "/examples/a/b");
	await expect(page.locator("#examples-rest")).toHaveText('["a","b"]');
});

test("literal brackets", async ({ page, docs }) => {
	const response = await page.goto(`${docs.origin}/[flare]`);
	expect(response?.status()).toBe(200);
	await expect(page.locator("#literal")).toHaveText("[flare]");
});

test("group no segment", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing");
	await expect(page.locator("#sidebar")).toBeVisible();
	expect(new URL(page.url()).pathname).toBe("/docs/routing");
	await expect(page.locator("[data-guide-match]")).toHaveAttribute("data-guide-match", "[[locale]]/_root_/(guide)");
});

test("fuzzy not found", async ({ page, docs }) => {
	const response = await page.goto(`${docs.origin}/docs/zzz/qq`);
	expect(response?.status()).toBe(404);
	await expect(page.locator("#docs-not-found")).toBeVisible();
	await expect(page.locator("#sidebar")).toBeVisible();
});

test("root not found", async ({ page, docs }) => {
	const response = await page.goto(`${docs.origin}/nope/deeper`);
	expect(response?.status()).toBe(404);
	await expect(page.locator("#root-not-found")).toBeVisible();
});

test("response redirect", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/legacy`, { maxRedirects: 0 });
	expect(response.status()).toBe(301);
	expect(response.headers()["location"]).toBe("/docs/routing#params");
	const hr = await http.get(`${docs.origin}/hr/legacy`, { maxRedirects: 0 });
	expect(hr.headers()["location"]).toBe("/hr/docs/routing#params");
});

test("client rewrite", async ({ page, docs }) => {
	const problems = await open(page, docs.origin, "/examples");
	const loads = documents(page);
	await page.locator("#guide-alias").click();
	await expect(page.locator("#doc-title")).toHaveText("Routing");
	expect(loads).toEqual([]);
	expect(problems).toEqual([]);
});

test("second root full load", async ({ page, docs, context }) => {
	await context.addCookies([sessionCookie(docs.origin, "ada", "admin")]);
	await open(page, docs.origin, "/login");
	const loads = documents(page);
	await page.getByRole("link", { name: "Open admin" }).click();
	await expect(page.locator("#admin-greeting")).toHaveText("Hi ada");
	expect(loads).toEqual(["/admin"]);
});

test("static beats locale", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/admin`, { maxRedirects: 0 });
	expect(response.headers()["x-docs-area"]).toBe("admin");
});

test("error boundary reset", async ({ page, docs, context }, info) => {
	await context.clearCookies();
	const response = await page.goto(`${docs.origin}/error`);
	expect(response?.status()).toBe(500);
	await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" });
	await expect(page.locator("#error-boundary")).toBeVisible();
	// In dev a loader throw also opens Vite's overlay (B76). It covers the page, so close it first.
	if (!isProd(info)) await page.keyboard.press("Escape");
	const depth = await page.evaluate(() => history.length);
	await page.locator("#error-reset").click();
	await expect(page.locator("#error-recovered")).toBeVisible();
	expect(await page.evaluate(() => history.length)).toBe(depth);
	expect(new URL(page.url()).pathname).toBe("/error");
});

// A URL with a locale tag: a tagless document under an optional locale root is private by design (dx/features.md).
test("segment cdn", async ({ http, docs }) => {
	await http.get(`${docs.origin}/hr/api/server/create-server`);
	const response = await http.get(`${docs.origin}/hr/api/server/create-server`);
	expect(response.headers()["cache-control"]).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=600");
	expect(response.headers()["cache-tag"]).toBe("api-reference");
});

test("locale prefix routes", async ({ page, docs }) => {
	await open(page, docs.origin, "/hr/docs/routing");
	await expect(page.locator("html")).toHaveAttribute("lang", "hr");
	await expect(page.locator("#nav")).toContainText("Dokumentacija");
});
