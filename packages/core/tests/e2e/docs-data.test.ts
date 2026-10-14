import { dataRequests, deepOnly, expect, fnId, isProd, open, serverOf, test } from "./docs.fixture.ts";

// Deferred data, TanStack Query, server functions, server context, and the env helpers (bits/15 docs-data).
deepOnly();

const SEARCH = fnId("src/fns/search.ts", "searchDocs");
const FEEDBACK_COUNT = fnId("src/fns/feedback.ts", "feedbackCount");
const HOLD_STATS = fnId("src/fns/stats-gate.ts", "holdStats");
const RELEASE_STATS = fnId("src/fns/stats-gate.ts", "releaseStats");

// The fast boundary does not wait for the slow one. `stats` is held on the server until the test has seen its skeleton
// beside the released list, so the order holds on any machine; a slow runner once settled `stats` first (BUGS.md 69).
test("defer two skeletons", async ({ page, request, docs }) => {
	const call = (id: string) =>
		request.post(`${docs.origin}/_flare/fn/${id}`, { headers: { origin: docs.origin }, data: {} });
	expect((await call(HOLD_STATS)).status()).toBe(200);
	try {
		await open(page, docs.origin, "/changelog");
		await expect(page.locator("#releases")).toBeVisible();
		await expect(page.locator("#stats-loading")).toBeVisible();
	} finally {
		expect((await call(RELEASE_STATS)).status()).toBe(200);
	}
	await expect(page.locator("#stats")).toContainText("18,420 downloads");
	await expect(page.locator("#latest")).toContainText("1.0.0");
});

// Production hides an unsafe thrown message behind the generic one (B76). Dev shows it.
test("defer rejects", async ({ page, docs }, info) => {
	await open(page, docs.origin, "/changelog");
	await expect(page.locator("#broken-error")).toContainText(
		isProd(info) ? "Something went wrong" : "The stats service is down",
	);
	await expect(page.locator("#stats")).toBeVisible();
	await expect(page.locator("#releases li")).toHaveCount(3);
	await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});

test("stream fill", async ({ page, docs }) => {
	const requests = dataRequests(page);
	await open(page, docs.origin, "/changelog");
	await expect(page.locator("#releases")).toBeVisible();
	expect(requests.filter((seen) => seen.kind === "fill" && seen.path === "/changelog")).toHaveLength(1);
});

test("defer resolve stored", async ({ request, docs }, info) => {
	test.skip(!isProd(info), "a stored body exists only in a production store (B94)");
	await request.get(`${docs.origin}/changelog`);
	const body = await (await request.get(`${docs.origin}/changelog`)).text();
	expect(body).toMatch(/id="latest"[^>]*>Latest: <strong[^>]*>1\.0\.0/);
	expect(body).toContain('id="releases-loading"');
});

test("query prefetched", async ({ page, docs }) => {
	const calls: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes(`/_flare/fn/${SEARCH}`)) calls.push(request.url());
	});
	await open(page, docs.origin, "/search?q=route");
	await expect(page.locator("#results li").first()).toBeVisible();
	await page.waitForTimeout(300);
	expect(calls).toEqual([]);
});

// A document load of a doc page hydrates with the feedback query the server filled and sends no request for it, during
// the hydration mount or in the second after it, on TanStack's default staleTime (B102). The refetch it replaces went
// out from the hydration mount itself, before `data-flare-hydrated`.
test("query hydrates once", async ({ page, docs }) => {
	const calls: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/_flare/fn/")) calls.push(request.url());
	});
	await open(page, docs.origin, "/docs/routing");
	await page.waitForTimeout(1000);
	expect(calls).toEqual([]);
});

test("query suspense", async ({ page, docs }) => {
	await open(page, docs.origin, "/search?q=route");
	await page.locator("#search-page-input").fill("fonts");
	await page.locator("#search-page-input").press("Enter");
	await expect(page).toHaveURL(`${docs.origin}/search?q=fonts`);
	await expect(page.locator("#results")).toContainText("Images and fonts");
	await expect(page.locator("#result-count")).toHaveText("1 result");
});

test("mutation sets data", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/auth");
	const up = page.locator("#votes-up");
	await expect(up).toHaveText(/^\d+$/);
	const before = Number(await up.textContent());
	const counts: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes(`/_flare/fn/${FEEDBACK_COUNT}`)) counts.push(request.url());
	});
	await page.locator("#vote-up").click();
	await expect(up).toHaveText(String(before + 1));
	expect(counts).toEqual([]);
});

test("server fn get cached", async ({ request, docs }) => {
	const input = encodeURIComponent(JSON.stringify({ q: "route" }));
	const response = await request.get(`${docs.origin}/_flare/fn/${SEARCH}?_i=${input}`);
	expect(response.status()).toBe(200);
	expect(response.headers()["cache-control"]).toMatch(/max-age=60/);
	expect(await response.json()).toMatchObject({ name: "searchDocs", status: 200 });
});

test("server fn post validates", async ({ page, docs }) => {
	await open(page, docs.origin, "/playground");
	await page.locator("#echo-input").fill("   ");
	await page.locator("#echo-send").click();
	await expect(page.locator("#echo-error")).toHaveText("Type something first");
	await page.locator("#echo-input").fill("hello flare");
	await page.locator("#echo-send").click();
	await expect(page.locator("#echo-answer")).toContainText('"text":"HELLO FLARE"');
});

test("safe error", async ({ page, docs }) => {
	await open(page, docs.origin, "/playground");
	await page.locator("#fail-safe").click();
	await expect(page.locator("#echo-error")).toHaveText("The playground quota is used up for today");
});

test("unsafe error", async ({ page, docs }, info) => {
	await open(page, docs.origin, "/playground");
	await page.locator("#fail-loud").click();
	const error = page.locator("#echo-error");
	await expect(error).not.toHaveText("");
	if (isProd(info)) await expect(error).not.toContainText("hunter2");
	else await expect(error).toContainText("hunter2");
});

test("stream", async ({ page, docs }) => {
	await open(page, docs.origin, "/playground");
	await page.locator("#stream-start").click();
	await expect(page.locator("#stream-log li")).toHaveCount(1);
	await expect(page.locator("#stream-log li")).toHaveCount(6);
	await expect(page.locator("#stream-status")).toHaveText("done");
});

// A line lands every 150 ms, faster than the expect retry backs off, so the stop polls each frame for a second line.
test("stream abort", async ({ page, docs }, info) => {
	test.skip(
		serverOf(info).startsWith("workers"),
		"Miniflare never reports a client disconnect to the worker (BUGS.md B45, dx/adapters.md)",
	);
	// A held run waits after its second line for the stop, so a slow click cannot let it finish first (BUGS.md B55).
	await open(page, docs.origin, "/playground?hold");
	const log = page.locator("#stream-log li");
	await page.locator("#stream-start").click();
	await page.waitForFunction(() => document.querySelectorAll("#stream-log li").length >= 2);
	await page.locator("#stream-stop").click();
	await expect(page.locator("#stream-status")).toHaveText("aborted");
	// 500 ms is more than three lines: a count that holds means the stream stopped.
	const stopped = await log.count();
	await page.waitForTimeout(500);
	expect(await log.count()).toBe(stopped);
});

test("server context", async ({ page, docs }) => {
	await open(page, docs.origin, "/playground");
	const first = await page.locator("#request-id").textContent();
	expect(first).toMatch(/^[0-9a-f]{8}$/);
	await open(page, docs.origin, "/playground");
	await expect(page.locator("#request-id")).not.toHaveText(first ?? "");
});

test("fetch dedupe", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing");
	await expect(page.locator("#fetch-calls")).toHaveText("1");
});

test("env fns", async ({ page, docs, browserName }) => {
	if (browserName === "chromium") await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	await open(page, docs.origin, "/docs/routing");
	await expect(page.locator("#runtime")).toHaveText(/^(node|bun|workers)$/);
	await expect(page.locator("#rendered-on")).toHaveText("client");
	await page.locator("[data-copy]").first().click();
	await expect(page.locator("[data-copy]").first()).not.toHaveText("copy");
});

test("t plural", async ({ page, docs }) => {
	await open(page, docs.origin, "/search?q=ro");
	await expect(page.locator("#result-count")).toHaveText(/^\d+ results$/);
	await open(page, docs.origin, "/hr/search?q=zzzz");
	await expect(page.locator("#result-count")).toHaveText("Nema rezultata");
	await expect(page.locator("#release-count")).toHaveText("14 releases");
});
