import { dataRequests, deepOnly, expect, fnId, idle, isProd, open, serverOf, test } from "./docs.fixture.ts";
import { flushEvents } from "./flush.ts";

// Deferred data, TanStack Query, server functions, server context, and the env helpers (bits/15 docs-data).
deepOnly();

const SEARCH = fnId("src/fns/search.ts", "searchDocs");
const FEEDBACK_COUNT = fnId("src/fns/feedback.ts", "feedbackCount");
const VOTE = fnId("src/fns/feedback.ts", "vote");
const HOLD_STATS = fnId("src/fns/stats-gate.ts", "holdStats");
const RELEASE_STATS = fnId("src/fns/stats-gate.ts", "releaseStats");
const HOLD_BUILD = fnId("src/fns/build-log.ts", "holdBuild");
const RELEASE_BUILD = fnId("src/fns/build-log.ts", "releaseBuild");
// The playground's streamed log, as `buildLog` sends it.
const STEPS = ["resolve routes", "bundle client", "bundle server", "prerender pages", "write sitemap", "done"];

// The fast boundary does not wait for the slow one. `stats` is held on the server until the test has seen its skeleton
// beside the released list, so the order holds on any machine; a slow runner once settled `stats` first (BUGS.md 69).
test("defer two skeletons", async ({ page, request, docs }) => {
	const call = (id: string) =>
		request.post(`${docs.origin}/_flare/fn/${id}`, { headers: { origin: docs.origin }, data: {} });
	// The boot sets FLARE_E2E, without which the gate refuses to hold.
	expect(await (await call(HOLD_STATS)).json()).toMatchObject({ data: { held: true } });
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
	// The fill kept the stored `latest`: the page still shows it once the fill has committed (BUGS.md 94).
	await expect(page.locator("#stats")).toBeVisible();
	await expect(page.locator("#latest")).toContainText("1.0.0");
});

test("defer resolve stored", async ({ request, docs }, info) => {
	test.skip(!isProd(info), "a stored body exists only in a production store (B94)");
	await request.get(`${docs.origin}/changelog`);
	const body = await (await request.get(`${docs.origin}/changelog`)).text();
	expect(body).toMatch(/id="latest"[^>]*>Latest: <strong[^>]*>1\.0\.0/);
	expect(body).toContain('id="releases-loading"');
	// The stored state carries the store-resolved value inline, and the fill, which runs only the holes, sends it as
	// `kept` with no frame of its own (BUGS.md 94).
	expect(body).toContain('"latest":{"__deferred":true,"key":"latest","value":{"version":"1.0.0"');
	const fill = await (await request.get(`${docs.origin}/changelog?_flare=fill`)).text();
	expect(fill).toContain('"latest":{"__deferred":true,"key":"latest","kept":true}');
	expect(fill).not.toContain('"k":"latest"');
	expect(fill).toContain('"k":"releases"');
});

test("query prefetched", async ({ page, docs }) => {
	const calls: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes(`/_flare/fn/${SEARCH}`)) calls.push(request.url());
	});
	await open(page, docs.origin, "/search?q=route");
	await expect(page.locator("#results li").first()).toBeVisible();
	await idle(page);
	await flushEvents(page);
	expect(calls).toEqual([]);
});

// A document load of a doc page hydrates with the feedback query the server filled and sends no request for it, during
// the hydration mount or before the page goes idle, on TanStack's default staleTime (B102). The refetch it replaces
// went out from the hydration mount itself, before `data-flare-hydrated`.
test("query hydrates once", async ({ page, docs }) => {
	const calls: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/_flare/fn/")) calls.push(request.url());
	});
	await open(page, docs.origin, "/docs/routing");
	await idle(page);
	await flushEvents(page);
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

// A pending vote changes neither button's look, where both used to dim and so flash on every vote, and a second click
// while it is pending sends nothing (BUGS.md 119.1). The test holds the vote until it has checked both.
test("vote holds still", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/server-functions");
	const up = page.locator("#votes-up");
	await expect(up).toHaveText(/^\d+$/);
	const before = Number(await up.textContent());
	const held = Promise.withResolvers<void>();
	const votes: string[] = [];
	await page.route(`**/_flare/fn/${VOTE}`, async (route) => {
		votes.push(route.request().url());
		await held.promise;
		await route.continue();
	});
	const look = (): Promise<string[]> =>
		page.evaluate(() =>
			["vote-up", "vote-down"].map((id) => {
				const button = document.getElementById(id);
				return button === null ? "gone" : getComputedStyle(button).opacity;
			}),
		);
	await page.locator("#vote-up").click();
	await expect.poll(() => votes.length).toBe(1);
	expect(await look()).toEqual(["1", "1"]);
	// The busy button is `aria-disabled`, which Playwright will not click unless forced: the point is that it sends nothing.
	await page.locator("#vote-down").click({ force: true });
	held.resolve();
	await expect(up).toHaveText(String(before + 1));
	expect(votes).toHaveLength(1);
	expect(await look()).toEqual(["1", "1"]);
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

// The lines render as they stream, with no clock deciding it (BUGS.md 100). The run is gated before the click: the
// server sends line 1, then each later line only when the test releases it, so each line must be on screen while the
// server still holds the next. A stream buffered anywhere, by the server or by Flare's client, shows nothing until
// its end, so the case stops at line 1.
test("stream", async ({ page, request, docs }) => {
	const run = `gate-${Math.random().toString(16).slice(2, 10)}`;
	const call = async (id: string): Promise<unknown> =>
		(await request.post(`${docs.origin}/_flare/fn/${id}`, { headers: { origin: docs.origin }, data: { run } })).json();
	// The boot sets FLARE_E2E, without which the gate refuses to hold.
	expect(await call(HOLD_BUILD)).toMatchObject({ data: { held: true } });
	await open(page, docs.origin, `/playground?run=${run}`);
	await page.locator("#stream-start").click();
	const lines = page.locator("#stream-log li");
	for (let count = 1; count <= STEPS.length; count += 1) {
		await expect(lines).toHaveCount(count);
		if (count < STEPS.length) expect(await call(RELEASE_BUILD)).toMatchObject({ data: { released: true } });
	}
	await expect(lines).toHaveText(STEPS.map((step, index) => `${index + 1}. ${step}`));
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
	// The card sets the status after its read loop ends, so no line can follow it: the held run sent two.
	expect(await log.count()).toBe(2);
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
