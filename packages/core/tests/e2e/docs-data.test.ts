import { writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { dataRequests, deepOnly, expect, fnId, isProd, open, serverOf, test } from "./docs.fixture.ts";

// Deferred data, TanStack Query, server functions, server context, and the env helpers (bits/15 docs-data).
deepOnly();

const SEARCH = fnId("src/fns/search.ts", "searchDocs");
const FEEDBACK_COUNT = fnId("src/fns/feedback.ts", "feedbackCount");
const HOLD_STATS = fnId("src/fns/stats-gate.ts", "holdStats");
const RELEASE_STATS = fnId("src/fns/stats-gate.ts", "releaseStats");
const BUILD_LOG = fnId("src/fns/build-log.ts", "buildLog");

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

// The lines render as they stream. An observer installed before the page loads records the time each line count first
// shows, so the case reads the arrivals afterwards instead of racing a transient count: the six lines come one at a
// time, spread over most of the server's 750 ms of waits. A buffered stream lands them together. A slow runner only
// widens the spread (BUGS.md 95). Every body chunk the page reads after the click is timed too, so a failure names its
// layer: chunks that came in a burst are the network's delivery, chunks spaced out with lines in a burst the page's
// rendering (BUGS.md 100).
test("stream", async ({ page, docs }, info) => {
	await page.addInitScript(() => {
		const arrivals: { count: number; at: number }[] = [];
		const reads: { bytes: number; at: number }[] = [];
		Reflect.set(window, "streamArrivals", arrivals);
		Reflect.set(window, "streamReads", reads);
		new MutationObserver(() => {
			const count = document.querySelectorAll("#stream-log li").length;
			if (count > (arrivals.at(-1)?.count ?? 0)) arrivals.push({ count, at: performance.now() });
		}).observe(document, { childList: true, subtree: true });
		// The client decodes each body chunk as it reads it, `{ stream: true }`, so a decode is a chunk's arrival.
		const decode = TextDecoder.prototype.decode;
		TextDecoder.prototype.decode = function (
			this: TextDecoder,
			input?: AllowSharedBufferSource,
			options?: TextDecodeOptions,
		) {
			if (Reflect.get(window, "streamTimed") === true && options?.stream === true && input !== undefined) {
				reads.push({ bytes: input.byteLength, at: performance.now() });
			}
			return decode.call(this, input, options);
		};
	});
	await watchFrames(page);
	await open(page, docs.origin, "/playground");
	await page.evaluate(() => {
		Reflect.set(window, "streamTimed", true);
		Reflect.set(window, "streamClick", performance.now());
	});
	await page.locator("#stream-start").click();
	await expect(page.locator("#stream-log li")).toHaveCount(6);
	await expect(page.locator("#stream-status")).toHaveText("done");
	const timed: { arrivals: { count: number; at: number }[]; reads: { bytes: number; at: number }[] } =
		await page.evaluate(() => ({
			arrivals: Reflect.get(window, "streamArrivals"),
			reads: Reflect.get(window, "streamReads"),
		}));
	const { arrivals } = timed;
	const evidence = JSON.stringify({
		lines: arrivals.map((arrival) => Math.round(arrival.at - (arrivals[0]?.at ?? 0))),
		chunks: timed.reads.map((chunk) => `${Math.round(chunk.at - (arrivals[0]?.at ?? 0))}ms:${chunk.bytes}B`),
		node: await nodeChunks(docs.origin),
		main: await mainThread(page, arrivals[0]?.at ?? 0),
	});
	// Every run keeps its timing, a pass too, so macOS runs show how close a pass comes (BUGS.md 100).
	const timing = info.outputPath("stream-timing.json");
	writeFileSync(timing, `${evidence}\n`);
	await info.attach("stream timing", { path: timing, contentType: "application/json" });
	expect(
		arrivals.map((arrival) => arrival.count),
		evidence,
	).toEqual([1, 2, 3, 4, 5, 6]);
	expect((arrivals.at(-1)?.at ?? 0) - (arrivals[0]?.at ?? 0), evidence).toBeGreaterThanOrEqual(600);
});

// Every frame's time from the document's start: a gap far past a frame is the main thread held, which delivers queued
// chunks together. A stall that starts before the click and runs into the stream still has the frame before it
// (BUGS.md 100).
async function watchFrames(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const frames: number[] = [];
		Reflect.set(window, "streamFrames", frames);
		const tick = (): void => {
			frames.push(performance.now());
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		// When the client marks the document hydrated, and when the page's fonts are ready.
		new MutationObserver(() => {
			if (
				Reflect.get(window, "streamHydrated") === undefined &&
				document.documentElement.hasAttribute("data-flare-hydrated")
			) {
				Reflect.set(window, "streamHydrated", performance.now());
			}
		}).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-flare-hydrated"] });
		void document.fonts.ready.then(() => Reflect.set(window, "streamFonts", performance.now()));
	});
}

// What held the page's main thread, each time from the first line's arrival (BUGS.md 100): every frame gap over 50 ms
// that ends after the load as `<start>+<length>`; the load, the click, the moment `data-flare-hydrated` appeared, and
// the moment `document.fonts.ready` resolved; every resource fetched from the load on as `<start>-<end>:<type>:<file>`,
// any type; every mark and measure the page set as `<name>@<start>+<length>`; the paint entries; and the largest
// contentful paints where the engine reports them. A coalesced sample's long gap lined up against these names its
// cause.
type MainThread = {
	gaps: string[];
	load: number;
	click: number;
	hydrated: number;
	fonts: number;
	resources: string[];
	marks: string[];
	paints: string[];
};

function mainThread(page: Page, origin: number): Promise<MainThread> {
	return page.evaluate(async (zero) => {
		const at = (time: number): number => Math.round(time - zero);
		const frames: number[] = Reflect.get(window, "streamFrames");
		const [navigation] = performance.getEntriesByType("navigation");
		const loaded = navigation instanceof PerformanceNavigationTiming ? navigation.loadEventEnd : 0;
		// A gap is reported when it ends after the load, so one that began before it still counts.
		const gaps = frames.flatMap((time, index) => {
			const gap = time - (frames[index - 1] ?? time);
			return gap > 50 && time > loaded ? [`${at(time - gap)}+${Math.round(gap)}`] : [];
		});
		const resources = performance
			.getEntriesByType("resource")
			.filter((entry) => entry instanceof PerformanceResourceTiming && entry.startTime >= loaded)
			.map((entry) => {
				const timing = entry as PerformanceResourceTiming;
				return `${at(timing.startTime)}-${at(timing.responseEnd)}:${timing.initiatorType}:${timing.name.split("/").at(-1)}`;
			});
		const marks = [...performance.getEntriesByType("mark"), ...performance.getEntriesByType("measure")].map(
			(entry) => `${entry.name}@${at(entry.startTime)}+${Math.round(entry.duration)}`,
		);
		const contentful = await new Promise<PerformanceEntry[]>((resolve) => {
			if (!PerformanceObserver.supportedEntryTypes.includes("largest-contentful-paint")) return resolve([]);
			const observer = new PerformanceObserver((list) => {
				observer.disconnect();
				resolve(list.getEntries());
			});
			observer.observe({ type: "largest-contentful-paint", buffered: true });
			setTimeout(() => resolve([]), 100);
		});
		const paints = [...performance.getEntriesByType("paint"), ...contentful].map(
			(entry) => `${entry.name || entry.entryType}@${at(entry.startTime)}`,
		);
		return {
			gaps,
			load: at(loaded),
			click: at(Number(Reflect.get(window, "streamClick"))),
			hydrated: at(Number(Reflect.get(window, "streamHydrated") ?? Number.NaN)),
			fonts: at(Number(Reflect.get(window, "streamFonts") ?? Number.NaN)),
			resources,
			marks,
			paints,
		};
	}, origin);
}

// A response's chunks as the page reads them, each timed from the first: with a reader, or with `for await` and the
// fetch carrying an AbortSignal, as the flare client reads (BUGS.md 100).
function pageChunks(page: Page, request: { url: string; init: RequestInit; read: string }): Promise<string[]> {
	return page.evaluate(async ({ url, init, read }) => {
		const signal = read.startsWith("signal") ? { signal: new AbortController().signal } : {};
		const response = await fetch(url, { ...init, ...signal });
		const chunks: { at: number; bytes: number }[] = [];
		const body = response.body;
		if (body !== null && read.endsWith("for-await")) {
			for await (const chunk of body) chunks.push({ at: performance.now(), bytes: chunk.byteLength });
		} else {
			const reader = body?.getReader();
			for (let next = await reader?.read(); next !== undefined && !next.done; next = await reader?.read()) {
				chunks.push({ at: performance.now(), bytes: next.value.byteLength });
			}
		}
		return chunks.map((chunk) => `${Math.round(chunk.at - (chunks[0]?.at ?? 0))}ms:${chunk.bytes}B`);
	}, request);
}

// The same stream read by the test process with Node's fetch, in the browser's chunk format, so a burst the browser
// saw is set beside what reached a client that is not the browser: the server stack, or the engine's network layer
// (BUGS.md 100).
async function nodeChunks(origin: string): Promise<string[]> {
	return timedChunks(`${origin}/_flare/fn/${BUILD_LOG}`, {
		method: "POST",
		headers: { origin, "content-type": "application/json" },
		body: JSON.stringify({ run: "node-probe" }),
	});
}

// A response's chunks as Node's fetch reads them, each timed from the first.
async function timedChunks(url: string, init: RequestInit): Promise<string[]> {
	const response = await fetch(url, init);
	const reader = response.body?.getReader();
	const chunks: { at: number; bytes: number }[] = [];
	for (let next = await reader?.read(); next !== undefined && !next.done; next = await reader?.read()) {
		chunks.push({ at: performance.now(), bytes: next.value.byteLength });
	}
	return chunks.map((chunk) => `${Math.round(chunk.at - (chunks[0]?.at ?? 0))}ms:${chunk.bytes}B`);
}

// The transport probe for BUGS.md 100, a measurement with no pass bar: each candidate for macOS WebKit's coalesced
// stream chunks, read by the page with a plain reader and by the test process's own Node fetch, for a streamed server
// function and for a fill's defer frames. Every run writes `stream-variants.json`, which e2e-mac uploads.
test("stream transport", async ({ page, docs }, info) => {
	await open(page, docs.origin, "/playground");
	const targets = [
		...["plain", "sse", "pad", "sse+pad"].map((variant) => ({
			name: `fn ${variant}`,
			url: `/_flare/fn/${BUILD_LOG}`,
			init: {
				method: "POST",
				headers: { origin: docs.origin, "content-type": "application/json", "x-docs-stream-variant": variant },
				body: JSON.stringify({ run: `variant-${variant}` }),
			},
		})),
		// The flare client's own read: the body iterated with `for await`, and the fetch carrying its stop's AbortSignal.
		...(["for-await", "signal", "signal+for-await"] as const).map((variant) => ({
			name: `fn ${variant}`,
			url: `/_flare/fn/${BUILD_LOG}`,
			init: {
				method: "POST",
				headers: { origin: docs.origin, "content-type": "application/json", "x-docs-stream-variant": "plain" },
				body: JSON.stringify({ run: `variant-${variant}` }),
			},
			read: variant,
		})),
		{
			name: "fill for-await",
			url: "/changelog?_flare=fill",
			init: { method: "GET", headers: { "x-docs-stream-variant": "plain" } },
			read: "for-await" as const,
		},
		...["plain", "sse", "pad"].map((variant) => ({
			name: `fill ${variant}`,
			url: "/changelog?_flare=fill",
			init: { method: "GET", headers: { "x-docs-stream-variant": variant } },
		})),
	];
	const report: Record<string, { page: string[]; node: string[] }> = {};
	for (const target of targets) {
		const inPage = await pageChunks(page, {
			url: target.url,
			init: target.init,
			read: "read" in target ? target.read : "reader",
		});
		report[target.name] = { page: inPage, node: await timedChunks(`${docs.origin}${target.url}`, target.init) };
	}
	const path = info.outputPath("stream-variants.json");
	writeFileSync(path, `${JSON.stringify(report, null, 1)}\n`);
	await info.attach("stream variants", { path, contentType: "application/json" });
	expect(Object.values(report).every((entry) => entry.page.length > 0 && entry.node.length > 0)).toBe(true);
});

// The main-thread probe for BUGS.md 100, a measurement with no pass bar: every frame gap over 50 ms in the 2 s after
// the load, with no click, each setup the first page of its own context, as `stream`'s playground is. `blank` is
// about:blank, `static` the playground's own HTML from this server with every script removed, so its CSS, fonts, and
// DOM load and no page script runs, and `live` the playground itself. A stall in `blank` or `static` is the engine on
// the runner, not the page's JS. Every run writes `main-thread.json`, which e2e-mac uploads.
test("main thread", async ({ browser, request, docs }, info) => {
	const html = (await (await request.get(`${docs.origin}/playground`)).text()).replaceAll(
		/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*rel="modulepreload"[^>]*>/g,
		"",
	);
	const report: Record<string, string[]> = {};
	for (const setup of ["blank", "static", "live", "static again"]) {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.route(`${docs.origin}/__probe`, (route) => route.fulfill({ body: html, contentType: "text/html" }));
		const url = { blank: "about:blank", live: `${docs.origin}/playground` }[setup] ?? `${docs.origin}/__probe`;
		await page.goto(url, { waitUntil: "load" });
		report[setup] = await gapsAfterLoad(page);
		// The static page runs no script of its own and still has the page's styles.
		if (setup.startsWith("static")) {
			expect(await page.locator("script").count()).toBe(0);
			expect(await page.evaluate(() => document.styleSheets.length)).toBeGreaterThan(0);
		}
		await context.close();
	}
	const path = info.outputPath("main-thread.json");
	writeFileSync(path, `${JSON.stringify(report)}\n`);
	await info.attach("main thread", { path, contentType: "application/json" });
	expect(Object.keys(report)).toHaveLength(4);
});

// Frame gaps over 50 ms from the load until 2 s after it, as `<start>+<length>` from the load.
function gapsAfterLoad(page: Page): Promise<string[]> {
	return page.evaluate(
		() =>
			new Promise<string[]>((resolve) => {
				const [navigation] = performance.getEntriesByType("navigation");
				const loaded = navigation instanceof PerformanceNavigationTiming ? navigation.loadEventEnd : 0;
				const gaps: string[] = [];
				let last = performance.now();
				const tick = (): void => {
					const now = performance.now();
					if (now - last > 50) gaps.push(`${Math.round(last - loaded)}+${Math.round(now - last)}`);
					last = now;
					if (now - loaded < 2000) requestAnimationFrame(tick);
					else resolve(gaps);
				};
				requestAnimationFrame(tick);
			}),
	);
}

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
