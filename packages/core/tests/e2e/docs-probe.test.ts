import { writeFileSync } from "node:fs";
import type { APIRequestContext, Browser, Page, TestInfo } from "@playwright/test";
import { deepOnly, expect, open, test } from "./docs.fixture.ts";
import { BUILD_LOG, instrumentStream, pageChunks, startStream, timedChunks } from "./stream-probe.ts";

// The measurements for BUGS.md 100, with no pass bar: macOS WebKit's stream transport and its main thread.
deepOnly();

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

// The main-thread probe for BUGS.md 100, measurements with no pass bar: every frame gap over 50 ms in the 2 s after a
// moment, beside the page's font loads and each face's status per frame. Each setup is the first page of its own
// context, as `stream`'s playground is, and each group writes `main-thread-<group>.json`, which e2e-mac uploads. A group
// is its own case with room for a slow runner, so one slow setup never drops the others.
//
// `load` samples from the load: about:blank; the playground's HTML with every script removed (`static`: its DOM and
// critical CSS; in dev its inline module styles too); that page with the built stylesheet applied, which production's
// removed swap script would have done (`static full css`); the playground; the playground whose client entry is an
// empty module (nothing hydrates); and the playground under `stream`'s init scripts.
test("main thread load", async ({ browser, request, docs }, info) => {
	test.setTimeout(120_000);
	const pages = await probePages(docs.origin, request);
	await probe(
		{ browser, info, group: "load" },
		{
			blank: async (page) => (await page.goto("about:blank"), sample(page, "load")),
			static: async (page) => (await staticPage(page, docs.origin, pages.bare), sample(page, "load")),
			"static full css": async (page) => {
				await staticPage(page, docs.origin, pages.styled);
				await expectFullCss(page, pages.sheet);
				return sample(page, "load");
			},
			live: async (page) => (await page.goto(pages.playground), sample(page, "load")),
			"live no client": async (page) => {
				await page.route(`${docs.origin}${pages.entry}`, (route) =>
					route.fulfill({ body: "export {};", contentType: "text/javascript" }),
				);
				await page.goto(pages.playground);
				const result = await sample(page, "load");
				expect(await page.locator("html[data-flare-hydrated]").count()).toBe(0);
				return result;
			},
			"live instrumented": async (page) => {
				await instrumentStream(page);
				await page.goto(pages.playground);
				return sample(page, "load");
			},
		},
	);
});

// `append` samples from the DOM change of `stream`'s first line made by hand: on the script-free page with the full
// stylesheet; on that page holding a synthetic retained heap the size of the hydrated playground's (about 3 MB in
// Chromium), so any page that size meets the same collector; on the playground whose client never runs, which keeps its
// inline head scripts (theme, direction, language) and so the same `<html>` attributes; on the hydrated playground ten
// times, for a rate; and on the hydrated playground twice in a row, where a one-time cost (a compile, a lazy init)
// lands on the first append only and a collection on either.
test("main thread append", async ({ browser, request, docs }, info) => {
	test.setTimeout(240_000);
	const pages = await probePages(docs.origin, request);
	const hydrated = async (page: Page): Promise<void> => void (await open(page, docs.origin, "/playground"));
	await probe(
		{ browser, info, group: "append" },
		{
			"static full css append": async (page) => {
				await staticPage(page, docs.origin, pages.styled);
				await expectFullCss(page, pages.sheet);
				return appendLine(page, 1);
			},
			"static synthetic heap append": async (page) => {
				await staticPage(page, docs.origin, pages.styled);
				await page.evaluate(() => {
					const items = Array.from({ length: 24_000 }, (_, index) => ({
						id: index,
						label: `item ${index}`,
						tags: [index, index + 1],
						read: () => index,
					}));
					Reflect.set(window, "probeHeap", items);
				});
				await page.waitForTimeout(1000);
				return appendLine(page, 1);
			},
			"live no client append": async (page) => {
				await page.route(`${docs.origin}${pages.entry}`, (route) =>
					route.fulfill({ body: "export {};", contentType: "text/javascript" }),
				);
				await page.goto(pages.playground);
				return appendLine(page, 1);
			},
			"live append twice": async (page) => {
				await hydrated(page);
				const first = await appendLine(page, 1);
				return { ...first, again: await appendLine(page, 2) };
			},
		},
		5,
	);
	await probe(
		{ browser, info, group: "append live" },
		{ "live append": async (page) => (await hydrated(page), appendLine(page, 1)) },
		10,
	);
});

// `click` samples from `stream`'s click, cold and with Docs Mono warm, and from one hidden `font-mono` span's insert.
test("main thread click", async ({ browser, docs }, info) => {
	test.setTimeout(120_000);
	await probe(
		{ browser, info, group: "click" },
		{
			"live instrumented click": async (page) => {
				await instrumentStream(page);
				await open(page, docs.origin, "/playground");
				await startStream(page);
				return sample(page, "click");
			},
			"live mono": async (page) => {
				await open(page, docs.origin, "/playground");
				await page.evaluate(() => {
					Reflect.set(window, "probeMark", performance.now());
					document.body.append(Reflect.apply(Reflect.get(window, "monoSpan") as () => HTMLElement, window, []));
				});
				return sample(page, "mark");
			},
			"live warm click": async (page) => {
				await instrumentStream(page);
				await open(page, docs.origin, "/playground");
				await page.evaluate(async () => {
					document.body.append(Reflect.apply(Reflect.get(window, "monoSpan") as () => HTMLElement, window, []));
					await document.fonts.load('12px "Docs Mono"');
					await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
				});
				await startStream(page);
				return sample(page, "click");
			},
		},
	);
});

// `heap` reads the retained JS heap after a second of idle and a forced collection, where the engine exposes it
// (Chromium, over the DevTools protocol), on about:blank, the docs home, and the hydrated playground, so the pause's heap
// has a scale (BUGS.md 100). Other engines record null.
test("main thread heap", async ({ browser, browserName, docs }, info) => {
	test.setTimeout(120_000);
	const report: Record<string, { used: number; total: number } | null> = {};
	for (const path of ["about:blank", "/", "/playground"]) {
		const context = await browser.newContext();
		const page = await context.newPage();
		if (path === "about:blank") await page.goto(path);
		else await open(page, docs.origin, path);
		await page.waitForTimeout(1000);
		if (browserName === "chromium") {
			const cdp = await context.newCDPSession(page);
			await cdp.send("HeapProfiler.collectGarbage");
			const { usedSize, totalSize } = await cdp.send("Runtime.getHeapUsage");
			report[path] = { used: usedSize, total: totalSize };
		} else report[path] = null;
		await context.close();
	}
	const path = info.outputPath("main-thread-heap.json");
	writeFileSync(path, `${JSON.stringify(report)}\n`);
	await info.attach("main thread heap", { path, contentType: "application/json" });
	expect(Object.keys(report)).toHaveLength(3);
});

// Gaps as `<start>+<length>`, and font loads as `<at>:<event>:<faces>`, each from the moment; each face's status when
// sampling starts and every change after it, polled each frame since WebKit fires no font events, as
// `<at>:<family> <weight>:<status>`.
// `gc` is each frame where a WeakRef made in an earlier frame first derefs to undefined: a collection ran before it.
// `finalized` is each FinalizationRegistry callback, which the engine runs at its own discretion, so it only supports.
// `again` is a second sample on the same page.
type Sample = { gaps: string[]; loads: string[]; faces: string[]; gc: string[]; finalized: string[]; again?: Sample };

type Setup = (page: Page) => Promise<Sample>;

// Each setup `times` times, each run the first page of its own context, into `main-thread-<group>.json` as
// `{ setup: Sample[] }`.
async function probe(
	at: { browser: Browser; info: TestInfo; group: string },
	setups: Record<string, Setup>,
	times = 1,
): Promise<void> {
	const { browser, info, group } = at;
	const report: Record<string, Sample[]> = {};
	for (const [setup, run] of Object.entries(setups)) {
		for (let round = 0; round < times; round += 1) {
			const context = await browser.newContext();
			const page = await context.newPage();
			await recordFonts(page);
			(report[setup] ??= []).push(await run(page));
			await context.close();
		}
	}
	const path = info.outputPath(`main-thread-${group}.json`);
	writeFileSync(path, `${JSON.stringify(report)}\n`);
	await info.attach(`main thread ${group}`, { path, contentType: "application/json" });
	expect(Object.values(report).every((runs) => runs.length === times)).toBe(true);
}

// The playground's document as the server sends it: its URL, its client entry, its built stylesheet (production only),
// and its HTML with every script removed, bare and with that stylesheet linked.
async function probePages(origin: string, request: APIRequestContext) {
	const playground = `${origin}/playground`;
	const live = await (await request.get(playground)).text();
	const bare = live.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*rel="modulepreload"[^>]*>/g, "");
	const entry = /import\("([^"]+)"\)/.exec(live)?.[1];
	expect(entry).toBeDefined();
	const sheet = /<link\b(?=[^>]*\bas="style")[^>]*\bhref="([^"]+)"/.exec(live)?.[1];
	const styled = sheet === undefined ? bare : bare.replace("</head>", `<link rel="stylesheet" href="${sheet}"></head>`);
	return { playground, entry, sheet, bare, styled };
}

async function staticPage(page: Page, origin: string, html: string): Promise<void> {
	await page.route(`${origin}/__probe`, (route) => route.fulfill({ body: html, contentType: "text/html" }));
	await page.goto(`${origin}/__probe`, { waitUntil: "load" });
	expect(await page.locator("script").count()).toBe(0);
}

// Production's built stylesheet is applied; a dev page carries its module styles inline instead.
async function expectFullCss(page: Page, sheet: string | undefined): Promise<void> {
	if (sheet === undefined) {
		expect(await page.locator("style[data-vite-dev-id]").count()).toBeGreaterThan(0);
		return;
	}
	const hrefs = await page.evaluate(() => [...document.styleSheets].map((each) => each.href ?? ""));
	expect(hrefs.some((href) => href.endsWith(sheet))).toBe(true);
}

// The DOM change `stream`'s first line makes, with no server function and no Solid: one `<li>` in `#stream-log`, then
// the gaps from it.
async function appendLine(page: Page, count: number): Promise<Sample> {
	await page.evaluate(() => {
		const line = document.createElement("li");
		line.textContent = "1. resolve routes";
		Reflect.set(window, "probeMark", performance.now());
		document.getElementById("stream-log")?.append(line);
	});
	expect(await page.locator("#stream-log li").count()).toBe(count);
	return sample(page, "mark");
}
// Every `document.fonts` load the page starts, from the document's start (BUGS.md 100).
async function recordFonts(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const loads: { at: number; text: string }[] = [];
		Reflect.set(window, "probeFontLoads", loads);
		for (const type of ["loading", "loadingdone", "loadingerror"] as const) {
			document.fonts.addEventListener(type, (event) => {
				const faces = event.fontfaces.map((face) => `${face.family} ${face.weight}`).join(",");
				loads.push({ at: performance.now(), text: `${type}:${faces}` });
			});
		}
		// The hidden Docs Mono text `live mono` and `live warm click` add; laid out, so its face is used.
		Reflect.set(window, "monoSpan", () => {
			const span = document.createElement("span");
			span.className = "font-mono";
			span.style.cssText = "position:absolute;opacity:0;pointer-events:none";
			span.textContent = "warm 0123";
			return span;
		});
	});
}

// Frame gaps over 50 ms until 2 s after the load, `stream`'s click, or `probeMark`, with the page's font loads.
function sample(page: Page, zero: "load" | "click" | "mark"): Promise<Sample> {
	return page.evaluate(
		(from) =>
			new Promise<Sample>((resolve) => {
				const [navigation] = performance.getEntriesByType("navigation");
				const loaded = navigation instanceof PerformanceNavigationTiming ? navigation.loadEventEnd : 0;
				const marks = {
					load: loaded,
					click: Reflect.get(window, "streamClick"),
					mark: Reflect.get(window, "probeMark"),
				};
				const origin = Number(marks[from]);
				const gaps: string[] = [];
				const faces: string[] = [];
				const seen = new Map<FontFace, string>();
				const poll = (now: number): void => {
					for (const face of document.fonts) {
						if (seen.get(face) === face.status) continue;
						seen.set(face, face.status);
						faces.push(`${Math.round(now - origin)}:${face.family} ${face.weight}:${face.status}`);
					}
				};
				// One fresh target per frame, held only weakly, so a collection shows as a dead ref in a later frame.
				const gc: string[] = [];
				const finalized: string[] = [];
				const registry = new FinalizationRegistry(() => finalized.push(`${Math.round(performance.now() - origin)}`));
				let refs: WeakRef<object>[] = [];
				const witness = (now: number): void => {
					const alive = refs.filter((ref) => ref.deref() !== undefined);
					if (alive.length < refs.length) gc.push(`${Math.round(now - origin)}`);
					const target = {};
					registry.register(target, 0);
					refs = [...alive, new WeakRef(target)];
				};
				let last = performance.now();
				poll(last);
				witness(last);
				const tick = (): void => {
					const now = performance.now();
					if (now - last > 50) gaps.push(`${Math.round(last - origin)}+${Math.round(now - last)}`);
					last = now;
					poll(now);
					witness(now);
					if (now - origin < 2000) return void requestAnimationFrame(tick);
					const loads = (Reflect.get(window, "probeFontLoads") ?? []) as { at: number; text: string }[];
					resolve({
						gaps,
						loads: loads.map((load) => `${Math.round(load.at - origin)}:${load.text}`),
						faces,
						gc,
						finalized,
					});
				};
				requestAnimationFrame(tick);
			}),
		zero,
	);
}
