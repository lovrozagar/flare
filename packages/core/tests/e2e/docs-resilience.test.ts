import { dataRequests, deepOnly, documents, DESKTOP_UA, expect, fnId, isProd, open, test } from "./docs.fixture.ts";

// What happens when things go wrong or arrive at once: a new deploy, a missing chunk, a dead network, the overlay
// history, concurrent misses, locale negotiation, CSRF headers, and a phone (bits/15 docs-resilience).
deepOnly();

const ECHO = fnId("src/fns/echo.ts", "echo");

test("build mismatch reload", async ({ page, docs }) => {
	// The newer deploy answers every data and prefetch request from the start, as a real deploy would.
	await page.route(/[?&]_flare=(data|prefetch)/, async (route) => {
		const response = await route.fetch();
		await route.fulfill({ response, headers: { ...response.headers(), "flare-build": "a-newer-deploy" } });
	});
	await open(page, docs.origin, "/docs/routing");
	const loads = documents(page);
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click();
	await expect.poll(() => loads).toEqual(["/docs/caching"]);
	await expect(page.locator("#doc-title")).toHaveText("Caching");
	expect(await page.evaluate(() => sessionStorage.getItem("flare_chunk_reload"))).toContain("/docs/caching");
});

test("missing chunk reload", async ({ page, docs }, info) => {
	test.skip(!isProd(info), "chunk files exist only in a production build");
	// After hydrate every script request fails, as a chunk a newer deploy deleted would.
	let hydrated = false;
	await page.route("**/assets/*.js", (route) => (hydrated ? route.abort() : route.continue()));
	await page.goto(`${docs.origin}/`);
	await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" });
	hydrated = true;
	const loads = documents(page);
	await page.getByRole("link", { name: "Open the playground" }).click();
	await expect.poll(() => loads).toEqual(["/playground"]);
});

test("network failure", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing");
	const depth = await page.evaluate(() => history.length);
	// Every data request, the prefetch the hover started included, fails as a dead network would.
	await page.route("**/*_flare=*", (route) => route.abort("internetdisconnected"));
	await page.locator("#sidebar").getByRole("link", { name: "Auth" }).click();
	await page.waitForTimeout(500);
	await expect(page.locator("#doc-title")).toHaveText("Routing");
	expect(new URL(page.url()).pathname).toBe("/docs/routing");
	expect(await page.evaluate(() => history.length)).toBe(depth);
});

test("abort keeps latest", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing");
	await page.route("**/docs/auth?_flare=data*", async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 800));
		await route.continue().catch(() => {});
	});
	const sidebar = page.locator("#sidebar");
	await sidebar.getByRole("link", { name: "Auth" }).click();
	await sidebar.getByRole("link", { name: "Styling" }).click();
	await expect(page.locator("#doc-title")).toHaveText("Styling");
	await page.waitForTimeout(1000);
	await expect(page.locator("#doc-title")).toHaveText("Styling");
	expect(new URL(page.url()).pathname).toBe("/docs/styling");
});

test("overlay history", async ({ page, docs }) => {
	await open(page, docs.origin, "/");
	await page.locator("#search-input").fill("route");
	await page.locator("#search-input").press("Enter");
	await expect(page.locator("#search-modal")).toBeVisible();
	const requests = dataRequests(page);
	await page.goBack();
	await expect(page.locator("#search-modal")).toHaveCount(0);
	await expect(page.locator("#message")).toBeVisible();
	await page.goForward();
	await expect(page.locator("#search-modal")).toBeVisible();
	expect(requests.filter((seen) => seen.path === "/")).toEqual([]);
});

test("concurrent misses render once", async ({ request, docs }, info) => {
	test.skip(!isProd(info), "the shared store answers only in a production build");
	const url = `${docs.origin}/hr/api/routes/create-page`;
	const bodies = await Promise.all(
		Array.from({ length: 8 }, () => request.get(url).then((response) => response.text())),
	);
	const by = new Set(bodies.map((body) => /id="api-rendered-by"[^>]*>([0-9a-f]+)</.exec(body)?.[1]));
	expect(by.size).toBe(1);
});

test("accept language", async ({ browser, docs }) => {
	const context = await browser.newContext({ locale: "ar", userAgent: DESKTOP_UA });
	try {
		const page = await context.newPage();
		await page.goto(`${docs.origin}/docs/routing`);
		expect(new URL(page.url()).pathname).toBe("/ar/docs/routing");
		await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	} finally {
		await context.close();
	}
});

test("bad locale cookie", async ({ browser, docs }) => {
	const context = await browser.newContext({ locale: "en-US", userAgent: DESKTOP_UA });
	try {
		await context.addCookies([{ name: "flare.locale", value: "HR", url: docs.origin }]);
		const page = await context.newPage();
		const response = await page.goto(`${docs.origin}/`);
		expect(response?.request().redirectedFrom()).toBeNull();
		await expect(page.locator("#message")).toHaveText("Hello");
	} finally {
		await context.close();
	}
});

test("bot stays put", async ({ request, docs }) => {
	const response = await request.get(`${docs.origin}/`, {
		headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", "accept-language": "hr" },
		maxRedirects: 0,
	});
	expect(response.status()).toBe(200);
	expect(response.headers()["set-cookie"]).toBeUndefined();
	expect(await response.text()).toContain('id="message"');
});

// The rejected POSTs carry no body: local Miniflare resets a kept-alive connection after an answer that left the body
// unread, so the next request on that socket would fail (dx/adapters.md, BUGS.md B56).
test("csrf headers", async ({ request, docs }) => {
	const post = (headers: Record<string, string>, data?: object) =>
		request.post(`${docs.origin}/_flare/fn/${ECHO}`, {
			headers: { "content-type": "application/json", ...headers },
			...(data === undefined ? {} : { data }),
		});
	expect((await post({ "sec-fetch-site": "cross-site" })).status()).toBe(403);
	expect((await post({ referer: "https://evil.test/page" })).status()).toBe(403);
	expect((await post({ "sec-fetch-site": "same-site" })).status()).toBe(403);
	expect((await post({ origin: docs.origin }, { text: "hi" })).status()).toBe(200);
});

test("phone layout", async ({ browser, browserName, docs }) => {
	// Firefox has no mobile emulation, so it gets the phone viewport and touch only.
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: browserName !== "firefox",
	});
	try {
		const page = await context.newPage();
		const problems = await open(page, docs.origin, "/docs/routing");
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		expect(overflow).toBeLessThanOrEqual(0);
		await expect(page.locator("#sidebar")).toBeHidden();
		await page.locator("#nav").getByRole("link", { name: "Changelog" }).tap();
		await expect(page).toHaveURL(`${docs.origin}/changelog`);
		expect(problems).toEqual([]);
	} finally {
		await context.close();
	}
});
