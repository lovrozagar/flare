import { dataRequests, deepOnly, expect, open, prodOnly, serverOf, sessionCookie, test } from "./docs.fixture.ts";

// SSG seeds, ISR, shared SSR, CDN headers, purge, the client match cache, and the store per runtime (bits/15).
deepOnly();

test("ssg seed", async ({ request, docs }, info) => {
	prodOnly(info);
	const response = await request.get(`${docs.origin}/docs/routing`);
	expect(response.headers()["flare-render"]).toBe("ssg");
	expect(response.headers()["flare-cache"]).toBe("hit");
	expect(await response.text()).toContain('id="doc-title"');
});

test("ssg public cdn", async ({ request, docs }, info) => {
	prodOnly(info);
	const response = await request.get(`${docs.origin}/hr`);
	expect(response.headers()["cache-control"]).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=3600");
});

test("isr stored", async ({ request, docs }, info) => {
	prodOnly(info);
	const first = await request.get(`${docs.origin}/changelog`);
	expect(first.headers()["flare-render"]).toBe("isr");
	// The store write runs after the response (waitUntil), so a later request may still miss (BUGS.md B33).
	await expect.poll(async () => (await request.get(`${docs.origin}/changelog`)).headers()["flare-cache"]).toBe("hit");
});

test("shared ssr", async ({ request, docs }, info) => {
	prodOnly(info);
	const read = async (): Promise<{ cache: string | undefined; by: string | undefined }> => {
		const response = await request.get(`${docs.origin}/api/routes/create-page`);
		const by = /id="api-rendered-by"[^>]*>([0-9a-f]+)</.exec(await response.text())?.[1];
		return { cache: response.headers()["flare-cache"], by };
	};
	await read();
	await expect.poll(async () => (await read()).cache).toBe("hit");
	const first = await read();
	const second = await read();
	expect(first.cache).toBe("hit");
	expect(second.by).toBe(first.by);
});

test("revalidate tag", async ({ page, request, docs, context }, info) => {
	prodOnly(info);
	const renderedBy = async (): Promise<string | undefined> => {
		const response = await request.get(`${docs.origin}/api/server-fn/create-server-fn`);
		return /id="api-rendered-by"[^>]*>([0-9a-f]+)</.exec(await response.text())?.[1];
	};
	await renderedBy();
	const stored = await renderedBy();
	expect(await renderedBy()).toBe(stored);
	await context.addCookies([sessionCookie(docs.origin, "ada", "admin")]);
	await open(page, docs.origin, "/admin");
	await page.locator("#republish").click();
	await expect(page.locator("#purged")).toHaveText("api");
	await expect.poll(renderedBy).not.toBe(stored);
});

// The first visit is a client navigation, so its match is in the client cache before the second.
test("client cache stale", async ({ page, docs }) => {
	await open(page, docs.origin, "/");
	await page.locator("#nav").getByRole("link", { name: "Examples" }).click();
	await expect(page.locator("#examples-rest")).toHaveText("null");
	await page.locator("#sidebar").getByRole("link", { name: "Routing" }).click();
	await expect(page.locator("#doc-title")).toHaveText("Routing");
	const requests = dataRequests(page);
	await page.locator("#nav").getByRole("link", { name: "Examples" }).click();
	await expect(page.locator("#examples-rest")).toHaveText("null");
	expect(requests.filter((seen) => seen.path === "/examples" && seen.kind === "data")).toEqual([]);
});

test("cache deferred", async ({ page, docs }) => {
	await open(page, docs.origin, "/");
	await page.locator("#nav").getByRole("link", { name: "Changelog" }).click();
	await expect(page.locator("#stats")).toBeVisible();
	await page.locator("#nav").getByRole("link", { name: "Playground" }).click();
	await expect(page.locator("#echo-send")).toBeVisible();
	const requests = dataRequests(page);
	await page.locator("#nav").getByRole("link", { name: "Changelog" }).click();
	await expect(page.locator("#stats")).toBeVisible();
	expect(requests.filter((seen) => seen.path === "/changelog")).toEqual([]);
});

test("store per runtime", async ({ request, docs }, info) => {
	const response = await request.get(`${docs.origin}/`);
	expect(response.headers()["x-docs-store"]).toBe(serverOf(info).startsWith("workers") ? "cache-api" : "fs");
});
