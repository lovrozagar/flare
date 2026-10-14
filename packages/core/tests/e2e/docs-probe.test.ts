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
// moment, beside the page's font loads, each face's status per frame, and a collection witness. Each run is the first
// page of its own context, as `stream`'s playground is, and each group writes `main-thread-<group>.json`, which e2e-mac
// uploads. The pause needs the hydrated page and comes after a DOM change; `stream`'s click meets it far more often than
// a hand append does, so the hydrated page's pieces are cut away one at a time on the click.
//
// `click`, five times each, gaps from the click: `stream`'s click on the hydrated playground; the same after removing
// `data-flare-hydrated`; after removing the client's `<link rel="modulepreload">`s; with ResizeObserver,
// IntersectionObserver, and MutationObserver all made inert before the page's scripts run (the probe's own observers
// are installed first); and, with no click handler to press, the hand append on the playground whose entry imports
// everything the real entry imports but never calls `createClient` (`evaluated append`, gaps from the append).
test("main thread click", async ({ browser, request, docs }, info) => {
	test.setTimeout(300_000);
	const entry = await stubEntry(docs.origin, request);
	const click =
		(
			before: (page: Page) => Promise<void> = async () => undefined,
			after: (page: Page) => Promise<void> = async () => undefined,
		) =>
		async (page: Page): Promise<Sample> => {
			await instrumentStream(page);
			await before(page);
			await open(page, docs.origin, "/playground");
			await after(page);
			await startStream(page);
			return sample(page, "click");
		};
	await probe(
		{ browser, info, group: "click" },
		{
			click: click(),
			"click no hydrated attr": click(undefined, (page) =>
				page.evaluate(() => document.documentElement.removeAttribute("data-flare-hydrated")),
			),
			"click no modulepreload": click(undefined, (page) =>
				page.evaluate(() => {
					for (const link of document.querySelectorAll('link[rel="modulepreload"]')) link.remove();
				}),
			),
			"click no observers": click(inertObservers),
			"evaluated append": async (page) => {
				await page.route(`${docs.origin}${entry.path}`, (route) =>
					route.fulfill({ body: entry.stub, contentType: "text/javascript" }),
				);
				await page.goto(`${docs.origin}/playground`);
				await page.waitForTimeout(1000);
				expect(await page.locator("html[data-flare-hydrated]").count()).toBe(0);
				return appendLine(page, 1);
			},
		},
		5,
	);
});

// `append`, ten times, as the baseline rate: the hand append on the hydrated playground.
test("main thread append", async ({ browser, docs }, info) => {
	test.setTimeout(180_000);
	await probe(
		{ browser, info, group: "append" },
		{ "live append": async (page) => (await open(page, docs.origin, "/playground"), appendLine(page, 1)) },
		10,
	);
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

// The playground's client entry, and a stand-in for it that imports everything it statically imports and calls nothing,
// so the app's modules evaluate and nothing hydrates.
async function stubEntry(origin: string, request: APIRequestContext): Promise<{ path: string; stub: string }> {
	const live = await (await request.get(`${origin}/playground`)).text();
	const path = /import\("([^"]+)"\)/.exec(live)?.[1] ?? "";
	expect(path).not.toBe("");
	const source = await (await request.get(`${origin}${path}`)).text();
	const specifiers = [...source.matchAll(/\b(?:import|export)\s*(?:[\w${}*,\s]+?\bfrom\s*)?["']([^"']+)["']/g)].map(
		(match) => new URL(match[1] ?? "", `${origin}${path}`).href,
	);
	expect(specifiers.length).toBeGreaterThan(0);
	return { path, stub: specifiers.map((specifier) => `import ${JSON.stringify(specifier)};`).join("\n") };
}

// ResizeObserver, IntersectionObserver, and MutationObserver made inert before any page script runs: each observes
// nothing and never calls back.
async function inertObservers(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const inert = class {
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
			takeRecords(): never[] {
				return [];
			}
		};
		for (const kind of ["ResizeObserver", "IntersectionObserver", "MutationObserver"]) Reflect.set(window, kind, inert);
	});
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
