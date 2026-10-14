import { writeFileSync } from "node:fs";
import type { Browser, Page, TestInfo } from "@playwright/test";
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
// uploads. The pause needs the hydrated page, comes in production only, and starts 200 to 400 ms after `stream`'s
// click, so the click's path is cut apart on the hydrated playground.
//
// `stream`, five times each, gaps from the moment the stream starts: the streamed server function's POST read by plain
// `fetch` with a reader that drops the bytes (`raw`), no Flare client and no DOM; the same POST read the way Flare's
// client reads it (the fetch carrying an AbortSignal, `for await` over the body, `TextDecoder` with `stream: true`,
// whole lines, `JSON.parse` each), rendering nothing (`client read`, a replica: the client's own module is not reachable
// from the page); and `stream`'s real click (`click`). Each run also records the response's headers.
test("main thread stream", async ({ browser, docs }, info) => {
	test.setTimeout(240_000);
	const read =
		(mode: "raw" | "client read") =>
		async (page: Page): Promise<Sample> => {
			await instrumentStream(page);
			await open(page, docs.origin, "/playground");
			await page.evaluate(
				({ url, origin, how }) => {
					Reflect.set(window, "streamClick", performance.now());
					const signal = how === "raw" ? {} : { signal: new AbortController().signal };
					const done = (async () => {
						const response = await fetch(url, {
							method: "POST",
							headers: { origin, "content-type": "application/json" },
							body: JSON.stringify({ run: `probe-${how}` }),
							...signal,
						});
						const headers = [...response.headers].map(([name, value]) => `${name}: ${value}`);
						const body = response.body;
						if (body === null) return headers;
						if (how === "raw") {
							const reader = body.getReader();
							for (let next = await reader.read(); !next.done; next = await reader.read()) void next.value;
							return headers;
						}
						const decoder = new TextDecoder();
						let buffer = "";
						for await (const chunk of body) {
							buffer += decoder.decode(chunk, { stream: true });
							for (let end = buffer.indexOf("\n"); end !== -1; end = buffer.indexOf("\n")) {
								void JSON.parse(buffer.slice(0, end));
								buffer = buffer.slice(end + 1);
							}
						}
						return headers;
					})();
					Reflect.set(window, "probeStream", done);
				},
				{ url: `${docs.origin}/_flare/fn/${BUILD_LOG}`, origin: docs.origin, how: mode },
			);
			const result = await sample(page, "click");
			return { ...result, headers: await page.evaluate(() => Reflect.get(window, "probeStream") as Promise<string[]>) };
		};
	await probe(
		{ browser, info, group: "stream" },
		{
			raw: read("raw"),
			"client read": read("client read"),
			click: async (page) => {
				await instrumentStream(page);
				await open(page, docs.origin, "/playground");
				await startStream(page);
				return sample(page, "click");
			},
		},
		5,
	);
});

// Gaps as `<start>+<length>`, and font loads as `<at>:<event>:<faces>`, each from the moment; each face's status when
// sampling starts and every change after it, polled each frame since WebKit fires no font events, as
// `<at>:<family> <weight>:<status>`.
// `gc` is each frame where a WeakRef made in an earlier frame first derefs to undefined: a collection ran before it.
// `finalized` is each FinalizationRegistry callback, which the engine runs at its own discretion, so it only supports.
// `again` is a second sample on the same page.
// `headers` is the stream response's headers where a run reads one itself.
type Sample = {
	gaps: string[];
	loads: string[];
	faces: string[];
	gc: string[];
	finalized: string[];
	again?: Sample;
	headers?: string[];
};

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
