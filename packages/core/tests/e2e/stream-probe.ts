import type { Page } from "@playwright/test";
import { fnId } from "./docs.fixture.ts";

// The BUGS.md 100 instrumentation `stream` (docs-data) and the probes (docs-probe) share.

export const BUILD_LOG = fnId("src/fns/build-log.ts", "buildLog");

// `stream`'s instrumentation, which the `main thread` probe installs too: each line's arrival, each body chunk the
// client decodes once timing starts, and every frame (BUGS.md 100).
export async function instrumentStream(page: Page): Promise<void> {
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
}

// `stream`'s click: timing starts, then the button runs the streamed server function.
export async function startStream(page: Page): Promise<void> {
	await page.evaluate(() => {
		Reflect.set(window, "streamTimed", true);
		Reflect.set(window, "streamClick", performance.now());
	});
	await page.locator("#stream-start").click();
}

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
export type MainThread = {
	gaps: string[];
	load: number;
	click: number;
	hydrated: number;
	fonts: number;
	resources: string[];
	marks: string[];
	paints: string[];
};

export function mainThread(page: Page, origin: number): Promise<MainThread> {
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
export function pageChunks(page: Page, request: { url: string; init: RequestInit; read: string }): Promise<string[]> {
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
export async function nodeChunks(origin: string): Promise<string[]> {
	return timedChunks(`${origin}/_flare/fn/${BUILD_LOG}`, {
		method: "POST",
		headers: { origin, "content-type": "application/json" },
		body: JSON.stringify({ run: "node-probe" }),
	});
}

// A response's chunks as Node's fetch reads them, each timed from the first.
export async function timedChunks(url: string, init: RequestInit): Promise<string[]> {
	const response = await fetch(url, init);
	const reader = response.body?.getReader();
	const chunks: { at: number; bytes: number }[] = [];
	for (let next = await reader?.read(); next !== undefined && !next.done; next = await reader?.read()) {
		chunks.push({ at: performance.now(), bytes: next.value.byteLength });
	}
	return chunks.map((chunk) => `${Math.round(chunk.at - (chunks[0]?.at ?? 0))}ms:${chunk.bytes}B`);
}
