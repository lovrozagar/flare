// The performance baseline's measure (plan 21 15.6, tests/perf/BASELINE.md): one side, v0.9.23's benchmark app or its
// v1 port (tests/perf/apps/wire), served prod at `--origin`, measured on the post page with its 500 ms deferred
// comments. A driver runs the two sides alternately and keeps each run's JSON.
//
//   bun tests/perf/measure.ts network --side v1 --origin http://127.0.0.1:4001 [--runs 20]
//   bun tests/perf/measure.ts cpu --side v1 --server <built server module> [--requests 3000]
//
// `network` reads the document and its navigation data over HTTP, then loads the page in Chromium for its JavaScript,
// paint, and layout shift. `cpu` imports the built server and times `fetch` in process, so no socket or browser is in
// the number.
import { gzipSync } from "node:zlib"
import { chromium, type Browser, type Page } from "@playwright/test"
import { browserEndpoint } from "../../../../scripts/browser-server.ts"

export type Side = "v0" | "v1"

export const POST = "/posts/building-web-frameworks"

// Where each side lists the posts: v0.9.23 served its `_root_/index` page at /index, v1 the home page at /.
export const HOME: Record<Side, string> = { v0: "/index", v1: "/" }

// Each side's navigation data request for a path: v1 asks with `_flare=data` (B6), v0.9.23 with its headers.
export function dataRequest(side: Side, origin: string, path: string): Request {
	if (side === "v1") return new Request(`${origin}${path}?_flare=data`)
	return new Request(`${origin}${path}`, { headers: { accept: "application/x-ndjson", "flare-data": "1" } })
}

// The document's state script, its whole tag: v1's `<script id="flare-state">`, v0.9.23's `self.flare=`.
export function stateTag(html: string): string {
	return (
		/<script id="flare-state"[^>]*>[\s\S]*?<\/script>|<script[^>]*>self\.flare\s*=[\s\S]*?<\/script>/.exec(html)?.[0] ??
		""
	)
}

export function median(values: readonly number[]): number {
	const sorted = [...values].sort((left, right) => left - right)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

// Milliseconds to the first body chunk and to the whole body, one request.
async function timed(request: Request): Promise<{ first: number; total: number; body: string }> {
	const start = performance.now()
	const response = await fetch(request)
	const reader = response.body?.getReader()
	let first = -1
	let text = ""
	const decoder = new TextDecoder()
	for (;;) {
		const chunk = await reader?.read()
		if (chunk === undefined || chunk.done) break
		if (first < 0) first = performance.now() - start
		text += decoder.decode(chunk.value, { stream: true })
	}
	return { first, total: performance.now() - start, body: text + decoder.decode() }
}

type Vitals = { fcp: number; lcp: number; cls: number }

// Paint and layout shift of one fresh load, read once the deferred comments landed and the page settled.
async function vitals(page: Page, url: string): Promise<Vitals> {
	await page.addInitScript(() => {
		const seen = { fcp: 0, lcp: 0, cls: 0 }
		Object.assign(window, { __vitals: seen })
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) if (entry.name === "first-contentful-paint") seen.fcp = entry.startTime
		}).observe({ type: "paint", buffered: true })
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) seen.lcp = entry.startTime
		}).observe({ type: "largest-contentful-paint", buffered: true })
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
				if (!shift.hadRecentInput) seen.cls += shift.value
			}
		}).observe({ type: "layout-shift", buffered: true })
	})
	await page.goto(url, { waitUntil: "load" })
	await page.waitForSelector("li strong", { timeout: 10_000 })
	await page.waitForTimeout(500)
	return page.evaluate(() => Reflect.get(window, "__vitals") as Vitals)
}

// The JavaScript a page fetched, gzipped as served, by URL.
async function gzippedScripts(
	page: Page,
	skip: ReadonlySet<string> = new Set(),
): Promise<{ urls: string[]; gz: number }> {
	const urls = await page.evaluate(() =>
		performance
			.getEntriesByType("resource")
			.map((entry) => entry.name)
			.filter((name) => name.endsWith(".js") || name.includes(".js?")),
	)
	const fresh = [...new Set(urls)].filter((url) => !skip.has(url))
	let gz = 0
	for (const url of fresh) gz += gzipSync(new Uint8Array(await (await fetch(url)).arrayBuffer())).length
	return { urls: fresh, gz }
}

// Chromium from browser-server.ts's own run-server, through the loopback proxy its headers name (BUGS.md 484), or the
// installed engine.
async function browser(): Promise<Browser> {
	const endpoints = await browserEndpoint()
	if (endpoints === undefined) return chromium.launch()
	return chromium.connect(endpoints.chromium.endpoint, { headers: endpoints.chromium.headers })
}

export async function network(side: Side, origin: string, runs: number): Promise<Record<string, number>> {
	const url = `${origin}${POST}`
	const ttfb: number[] = []
	const total: number[] = []
	let html = ""
	for (let run = 0; run <= runs; run += 1) {
		const sample = await timed(new Request(url))
		html = sample.body
		// The first request warms the server; it is not counted.
		if (run === 0) continue
		ttfb.push(sample.first)
		total.push(sample.total)
	}
	const data = (await timed(dataRequest(side, origin, POST))).body
	const result: Record<string, number> = {
		"ttfb first byte ms": median(ttfb),
		"ttfb total ms": median(total),
		"html raw": html.length,
		"html gz": gzipSync(html).length,
		"state raw": stateTag(html).length,
		"html without state": html.length - stateTag(html).length,
		"data raw": data.length,
		"data gz": gzipSync(data).length,
	}
	const engine = await browser()
	try {
		const samples: Vitals[] = []
		for (let run = 0; run < runs; run += 1) {
			const context = await engine.newContext()
			samples.push(await vitals(await context.newPage(), url))
			await context.close()
		}
		result["fcp ms"] = median(samples.map((sample) => sample.fcp))
		result["lcp ms"] = median(samples.map((sample) => sample.lcp))
		result["cls median"] = median(samples.map((sample) => sample.cls))
		result["cls max"] = Math.max(...samples.map((sample) => sample.cls))
		const context = await engine.newContext()
		const page = await context.newPage()
		// The first load's JavaScript is what the load event saw; what loads after it, a prefetch the link started
		// included, is the navigation's cost, as the 2026-10-16 comparison counted it.
		await page.goto(`${origin}${HOME[side]}`, { waitUntil: "load" })
		const first = await gzippedScripts(page)
		result["initial js gz"] = first.gz
		await page.locator(`a[href="${POST}"]`).first().click()
		await page.waitForSelector("li strong", { timeout: 10_000 })
		result["navigation js gz"] = (await gzippedScripts(page, new Set(first.urls))).gz
		await context.close()
	} finally {
		await engine.close()
	}
	return result
}

type AppServer = { fetch: (request: Request) => Promise<Response> | Response }

// A built server module's server: its `server` export, or the default export, whichever has `fetch`.
async function serverOf(path: string): Promise<AppServer> {
	const loaded: Record<string, unknown> = await import(path)
	for (const value of [loaded["server"], loaded["default"]]) {
		if (typeof value === "object" && value !== null && typeof Reflect.get(value, "fetch") === "function") {
			return value as AppServer
		}
	}
	throw new Error(`${path} exports no server with fetch`)
}

// Microseconds of CPU per request, sequential, the median of three repeats: the post list's document, /about, and the
// list's navigation data, as the 2026-10-16 comparison measured. Not the post: v0.9.23 holds its document until the
// 500 ms comments settle, which is wall time, not CPU, and would make a run hours long. The body is read to its end.
export async function cpu(side: Side, path: string, requests: number): Promise<Record<string, number>> {
	const server = await serverOf(path)
	const origin = "http://bench.test"
	const cases: Record<string, () => Request> = {
		"cpu home us": () => new Request(`${origin}${HOME[side]}`),
		"cpu about us": () => new Request(`${origin}/about`),
		"cpu data us": () => dataRequest(side, origin, HOME[side]),
	}
	const result: Record<string, number> = {}
	for (const [name, make] of Object.entries(cases)) {
		const repeats: number[] = []
		for (let repeat = 0; repeat < 3; repeat += 1) {
			const before = process.cpuUsage()
			for (let index = 0; index < requests; index += 1) await (await server.fetch(make())).text()
			const used = process.cpuUsage(before)
			repeats.push((used.user + used.system) / requests)
		}
		result[name] = median(repeats)
	}
	return result
}

function option(args: readonly string[], name: string, fallback?: string): string {
	const at = args.indexOf(`--${name}`)
	const value = at === -1 ? fallback : args[at + 1]
	if (value === undefined) throw new Error(`measure: --${name} is required`)
	return value
}

if (import.meta.main) {
	const [mode, ...args] = process.argv.slice(2)
	const side = option(args, "side") as Side
	const result =
		mode === "cpu"
			? await cpu(side, option(args, "server"), Number(option(args, "requests", "3000")))
			: await network(side, option(args, "origin"), Number(option(args, "runs", "20")))
	console.log(JSON.stringify({ side, mode, at: new Date().toISOString(), result }, null, "\t"))
	process.exit(0)
}
