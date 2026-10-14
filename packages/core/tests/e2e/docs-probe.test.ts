import { writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
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

// The main-thread probe for BUGS.md 100, a measurement with no pass bar: every frame gap over 50 ms in the 2 s after
// a moment, each setup the first page of its own context, as `stream`'s playground is, beside every web font the page
// started loading and each face's status at the end. `blank` is about:blank, `static` the playground's own HTML from
// this server with every script removed (its CSS, fonts, and DOM, no page script), `live` the playground itself,
// `live no client` the playground whose client entry is an empty module (the chunks still preload; nothing hydrates),
// `live instrumented` the playground under `stream`'s init scripts, `live instrumented click` that page after
// `stream`'s click, its gaps from the click, `live mono` the playground after one hidden `font-mono` span is added
// with no click, from that insert, `static append` and `live append` the DOM change of `stream`'s first line made by
// hand on each, from that append, and `live warm click` `stream`'s click after Docs Mono has rendered once. Every run
// writes `main-thread.json`, which e2e-mac uploads.
test("main thread", async ({ browser, request, docs }, info) => {
	const live = await (await request.get(`${docs.origin}/playground`)).text();
	const setups = { ...loadSetups(docs.origin, live), ...momentSetups(docs.origin) };
	const report: Record<string, Sample> = {};
	for (const [setup, run] of Object.entries(setups)) {
		const context = await browser.newContext();
		const page = await context.newPage();
		await recordFonts(page);
		report[setup] = await run(page);
		await context.close();
	}
	const path = info.outputPath("main-thread.json");
	writeFileSync(path, `${JSON.stringify(report)}\n`);
	await info.attach("main thread", { path, contentType: "application/json" });
	expect(Object.keys(report)).toHaveLength(10);
});

type Setups = Record<string, (page: Page) => Promise<Sample>>;

// The setups sampled from the load: the page's own document, without scripts, without its client, and instrumented.
function loadSetups(origin: string, live: string): Setups {
	const html = live.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*rel="modulepreload"[^>]*>/g, "");
	const entry = /import\("([^"]+)"\)/.exec(live)?.[1];
	expect(entry).toBeDefined();
	const playground = `${origin}/playground`;
	const docs = { origin };
	return {
		blank: async (page) => (await page.goto("about:blank"), sample(page, "load")),
		static: async (page) => {
			await page.route(`${docs.origin}/__probe`, (route) => route.fulfill({ body: html, contentType: "text/html" }));
			await page.goto(`${docs.origin}/__probe`, { waitUntil: "load" });
			expect(await page.locator("script").count()).toBe(0);
			expect(await page.evaluate(() => document.styleSheets.length)).toBeGreaterThan(0);
			return sample(page, "load");
		},
		"static append": async (page) => {
			await page.route(`${docs.origin}/__probe`, (route) => route.fulfill({ body: html, contentType: "text/html" }));
			await page.goto(`${docs.origin}/__probe`, { waitUntil: "load" });
			await appendLine(page);
			return sample(page, "mark");
		},
		live: async (page) => (await page.goto(playground), sample(page, "load")),
		"live no client": async (page) => {
			await page.route(`${docs.origin}${entry}`, (route) =>
				route.fulfill({ body: "export {};", contentType: "text/javascript" }),
			);
			await page.goto(playground);
			const result = await sample(page, "load");
			expect(await page.locator("html[data-flare-hydrated]").count()).toBe(0);
			return result;
		},
		"live instrumented": async (page) => {
			await instrumentStream(page);
			await page.goto(playground);
			return sample(page, "load");
		},
	};
}

// The setups sampled from a moment after hydrate: `stream`'s click, cold and with Docs Mono warm, and a mono insert.
function momentSetups(origin: string): Setups {
	const docs = { origin };
	return {
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
		"live append": async (page) => {
			await open(page, docs.origin, "/playground");
			await appendLine(page);
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
	};
}

// The DOM change `stream`'s first line makes, with no server function and no Solid: one `<li>` in `#stream-log`.
async function appendLine(page: Page): Promise<void> {
	await page.evaluate(() => {
		const line = document.createElement("li");
		line.textContent = "1. resolve routes";
		Reflect.set(window, "probeMark", performance.now());
		document.getElementById("stream-log")?.append(line);
	});
	expect(await page.locator("#stream-log li").count()).toBe(1);
}

// Gaps as `<start>+<length>`, and font loads as `<at>:<event>:<faces>`, each from the moment; each face's status when
// sampling starts and every change after it, polled each frame since WebKit fires no font events, as
// `<at>:<family> <weight>:<status>`.
type Sample = { gaps: string[]; loads: string[]; faces: string[] };

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
				let last = performance.now();
				poll(last);
				const tick = (): void => {
					const now = performance.now();
					if (now - last > 50) gaps.push(`${Math.round(last - origin)}+${Math.round(now - last)}`);
					last = now;
					poll(now);
					if (now - origin < 2000) return void requestAnimationFrame(tick);
					const loads = (Reflect.get(window, "probeFontLoads") ?? []) as { at: number; text: string }[];
					resolve({
						gaps,
						loads: loads.map((load) => `${Math.round(load.at - origin)}:${load.text}`),
						faces,
					});
				};
				requestAnimationFrame(tick);
			}),
		zero,
	);
}
