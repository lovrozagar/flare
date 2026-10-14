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
// the load, each setup the first page of its own context, as `stream`'s playground is. `blank` is about:blank, `static`
// the playground's own HTML from this server with every script removed (its CSS, fonts, and DOM, no page script),
// `live` the playground itself, `live no client` the playground whose client entry is an empty module (the chunks still
// preload; no app code runs, nothing hydrates), `live instrumented` the playground under `stream`'s init scripts, and
// `live instrumented click` that page after `stream`'s click, its gaps from the click. Every run writes
// `main-thread.json`, which e2e-mac uploads.
test("main thread", async ({ browser, request, docs }, info) => {
	const live = await (await request.get(`${docs.origin}/playground`)).text();
	const html = live.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*rel="modulepreload"[^>]*>/g, "");
	const entry = /import\("([^"]+)"\)/.exec(live)?.[1];
	expect(entry).toBeDefined();
	const setups: Record<string, (page: Page) => Promise<string[]>> = {
		blank: async (page) => (await page.goto("about:blank"), gapsFrom(page, "load")),
		static: async (page) => {
			await page.route(`${docs.origin}/__probe`, (route) => route.fulfill({ body: html, contentType: "text/html" }));
			await page.goto(`${docs.origin}/__probe`, { waitUntil: "load" });
			expect(await page.locator("script").count()).toBe(0);
			expect(await page.evaluate(() => document.styleSheets.length)).toBeGreaterThan(0);
			return gapsFrom(page, "load");
		},
		live: async (page) => (await page.goto(`${docs.origin}/playground`), gapsFrom(page, "load")),
		"live no client": async (page) => {
			await page.route(`${docs.origin}${entry}`, (route) =>
				route.fulfill({ body: "export {};", contentType: "text/javascript" }),
			);
			await page.goto(`${docs.origin}/playground`);
			const gaps = await gapsFrom(page, "load");
			expect(await page.locator("html[data-flare-hydrated]").count()).toBe(0);
			return gaps;
		},
		"live instrumented": async (page) => {
			await instrumentStream(page);
			await page.goto(`${docs.origin}/playground`);
			return gapsFrom(page, "load");
		},
		"live instrumented click": async (page) => {
			await instrumentStream(page);
			await open(page, docs.origin, "/playground");
			await startStream(page);
			return gapsFrom(page, "click");
		},
	};
	const report: Record<string, string[]> = {};
	for (const [setup, run] of Object.entries(setups)) {
		const context = await browser.newContext();
		report[setup] = await run(await context.newPage());
		await context.close();
	}
	const path = info.outputPath("main-thread.json");
	writeFileSync(path, `${JSON.stringify(report)}\n`);
	await info.attach("main thread", { path, contentType: "application/json" });
	expect(Object.keys(report)).toHaveLength(6);
});

// Frame gaps over 50 ms until 2 s after the load or after `stream`'s click, as `<start>+<length>` from that moment.
function gapsFrom(page: Page, zero: "load" | "click"): Promise<string[]> {
	return page.evaluate(
		(from) =>
			new Promise<string[]>((resolve) => {
				const [navigation] = performance.getEntriesByType("navigation");
				const loaded = navigation instanceof PerformanceNavigationTiming ? navigation.loadEventEnd : 0;
				const origin = from === "click" ? Number(Reflect.get(window, "streamClick")) : loaded;
				const gaps: string[] = [];
				let last = performance.now();
				const tick = (): void => {
					const now = performance.now();
					if (now - last > 50) gaps.push(`${Math.round(last - origin)}+${Math.round(now - last)}`);
					last = now;
					if (now - origin < 2000) requestAnimationFrame(tick);
					else resolve(gaps);
				};
				requestAnimationFrame(tick);
			}),
		zero,
	);
}
