import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import type { Page, TestInfo } from "@playwright/test"
import { duplicates, heapGrowth, prodDocumentProblems, slowdown } from "../perf/rules.ts"
import type { Boot } from "./boot.ts"
import { expect, idle, open, serverOf, test, watch } from "./docs.fixture.ts"

// What the docs app ships, in bytes, from the production build: each page's document and its gzip, its state script,
// its navigation's NDJSON, and the JavaScript the first load, its idle prefetch, and one client navigation fetch,
// gzipped as served (plan 21 15.6). A build is deterministic, so each budget is the size measured on 2026-10-17 with
// about 3% room, and growth past one is a decision, as the bundle budgets are (bits/01). The documents were measured
// again on 2026-10-18, after BUGS.md 352's entry handler grew each page's client script from 71 to 985 bytes. The
// JavaScript is the docs app's whole client: v0.9.23's measure on the same page was 70 KB of initial JS and 2.86 KB of
// navigation JS, against v1's 54 KB and 1.5 KB for the same route alone. The first load's JavaScript was raised to its
// measured size on 2026-10-21, 2026-10-22, 2026-10-23, and 2026-10-24 (BUGS.md 520), with no room, each raise's breakdown in its commit
// message, and with the prefetch's for Solid 2.0.0-rc.17's own code (BUGS.md 426). The heavy pages' entries, /perf/200
// and /perf/1000, are their sizes measured on 2026-10-21 with the same 3% room.
const BUDGET: Record<string, number> = {
	"html /perf/200": 87_800,
	"ndjson /perf/200": 25_800,
	"html /perf/1000": 284_200,
	"ndjson /perf/1000": 131_400,
	"html /": 53_200,
	"html gz /": 11_800,
	"state /": 3_450,
	"ndjson /": 2_260,
	"html /docs/routing": 62_700,
	"html gz /docs/routing": 13_700,
	"state /docs/routing": 6_450,
	"ndjson /docs/routing": 4_970,
	"initial js gz": 123_845,
	"prefetch js gz": 12_606,
	"navigation js gz": 0,
}

// The longest main-thread task a first load and one navigation may take: ten times the 50 ms a long task starts at,
// since a slower machine stretches every task (plan 21 15.6).
const LONGEST_TASK_MS = 500

// Heap and live-node growth per round trip of the heavy pages, after forced collection: ten times the growth measured
// on 2026-10-21 (107 to 111 KB and 0 nodes per trip, MacBook Air M3, three runs), the nodes floored at 100. A page
// subtree kept alive, round 3's <Image> leak, holds thousands of nodes.
const HEAP_GROWTH = 1_200_000
const NODES_GROWTH = 100

// When `data-flare-hydrated` lands, in ms from navigation start: ten times the slowest of three runs measured on
// 2026-10-21 (MacBook Air M3: 126 to 162 ms on home, 76 to 99 ms on the data-heavy page).
const HYDRATED: Readonly<Record<string, number>> = { "/": 1_600, "/perf/200": 1_000 }

// The data-heavy page and the stress page (apps/docs perf/[rows]).
const HEAVY = ["/perf/200", "/perf/1000"]

// The long form, for the nightly: absolute numbers and more rounds (.github/workflows/nightly.yml).
const LONG = process.env["FLARE_PERF_LONG"] === "1"

// One build, one count: every check here measures the node-prod build in Chromium, the engine with the APIs they read.
function prodChromium(info: TestInfo): void {
	test.skip(serverOf(info) !== "node-prod" || info.project.name.split("-")[2] !== "chromium", "one build, one count")
}

// A measured value, printed so a run records it beside the budget it is held to.
function report(name: string, value: number): void {
	console.log(`PERF ${name} ${value}`)
}

// A client navigation to `path` as a click on a link would make one, then its page's marker.
async function navigate(page: Page, path: string, marker: string): Promise<void> {
	await page.evaluate((href) => {
		const link = document.createElement("a")
		link.href = href
		link.textContent = href
		document.body.append(link)
		link.click()
		link.remove()
	}, path)
	await page.waitForFunction((at) => location.pathname === at, path)
	await page.locator(marker).first().waitFor()
}

// The pages the navigation and heap checks go round, each with the element that shows it rendered.
const ROUND: ReadonlyArray<readonly [string, string]> = [
	["/docs/routing", "#doc-title"],
	["/perf/200", "#row-199"],
	["/perf/1000", "#row-999"],
	["/", "#message"],
]

// The JavaScript resources the page has fetched so far; with `imported`, only those a script fetched, not those a
// `<link rel=prefetch>` alone did.
function scripts(page: Page, imported = false): Promise<string[]> {
	return page.evaluate(
		(only) =>
			(performance.getEntriesByType("resource") as PerformanceResourceTiming[])
				.filter((entry) => entry.name.endsWith(".js") && !(only && entry.initiatorType === "link"))
				.map((entry) => entry.name),
		imported,
	)
}

test("bytes and long tasks", async ({ page, http, docs }, info) => {
	prodChromium(info)
	const sizes: Record<string, number> = {}
	for (const path of ["/", "/docs/routing"]) {
		const html = await (await http.get(`${docs.origin}${path}`)).text()
		sizes[`html ${path}`] = html.length
		sizes[`html gz ${path}`] = gzipSync(html).length
		sizes[`state ${path}`] = /<script id="flare-state"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1]?.length ?? 0
		sizes[`ndjson ${path}`] = (await (await http.get(`${docs.origin}${path}?_flare=data`)).text()).length
	}
	// The heavy pages: every row in the document, and the navigation's data smaller than the document on every page.
	for (const path of HEAVY) {
		const html = await (await http.get(`${docs.origin}${path}`)).text()
		sizes[`html ${path}`] = html.length
		sizes[`ndjson ${path}`] = (await (await http.get(`${docs.origin}${path}?_flare=data`)).text()).length
	}
	expect(await (await http.get(`${docs.origin}/perf/1000`)).text()).toContain('id="row-999"')
	for (const path of ["/", "/docs/routing", ...HEAVY]) {
		expect([path, sizes[`ndjson ${path}`]! < sizes[`html ${path}`]!]).toEqual([path, true])
	}
	await page.addInitScript(() => {
		const longest = { ms: 0 }
		Object.assign(window, { __longest: longest })
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) longest.ms = Math.max(longest.ms, entry.duration)
		}).observe({ type: "longtask", buffered: true })
	})
	await page.addInitScript(trackPrefetchLinks)
	const flying = inFlight(page)
	const gzipped = async (urls: readonly string[]) => {
		let total = 0
		for (const url of urls) total += gzipSync(await (await http.get(url)).body()).length
		return total
	}
	await open(page, docs.origin, "/")
	// The app prefetches every route module once idle (`prefetch: { modules: "all" }`). The first load's JavaScript is
	// what it fetched but those, the prefetch is its own number, read once the warm-up has drained, and a navigation
	// then fetches none (BUGS.md 295, 521).
	await idle(page)
	const prefetched = await drained(page, warmable(docs), flying)
	// A module the page imported is the first load's, even when the idle prefetch also listed it, as it does for a route
	// a viewport prefetch was still importing when the list was made (CI 39093904905: 5298 bytes on the wrong side).
	const imported = [...new Set(await scripts(page, true))]
	const prefetch = prefetched.filter((url) => !imported.includes(url))
	const loaded = await scripts(page)
	sizes["initial js gz"] = await gzipped(imported)
	sizes["prefetch js gz"] = await gzipped(prefetch)
	await page.locator('#nav a[href="/docs/routing"]').first().click()
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	sizes["navigation js gz"] = await gzipped((await scripts(page)).filter((url) => !loaded.includes(url)))
	const over = Object.entries(sizes).filter(([name, size]) => size > (BUDGET[name] ?? 0))
	expect(over, JSON.stringify(sizes)).toEqual([])
	const longest = await page.evaluate(() => Number(Reflect.get(Object(Reflect.get(window, "__longest")), "ms")))
	expect(longest).toBeLessThanOrEqual(LONGEST_TASK_MS)
})

// Every file the idle warm-up can fetch, as a path: each route module's chunk in the client build and the chunks it
// imports, less the entry's own closure, which loads at boot. It is the closure fill's rule (vite/codegen/closures.ts,
// BUGS.md 80, 124.6), read from the app's route map (src/_gen/routes.gen.ts) and the client build's manifest.
function warmable(docs: Boot): Set<string> {
	type Chunk = { file: string; isEntry?: boolean; imports?: string[] }
	const manifest = JSON.parse(readFileSync(join(docs.outDir ?? "", "client/.vite/manifest.json"), "utf8")) as Record<
		string,
		Chunk
	>
	const closure = (keys: readonly string[]): Set<string> => {
		const seen = new Set<string>()
		const queue = [...keys]
		for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
			const chunk = manifest[key]
			if (chunk === undefined || seen.has(key)) continue
			seen.add(key)
			queue.push(...(chunk.imports ?? []))
		}
		return seen
	}
	const map = /^export const chunks = \{.*\};$/m.exec(readFileSync(join(docs.appDir, "src/_gen/routes.gen.ts"), "utf8"))
	const routes = [...(map?.[0] ?? "").matchAll(/"\/(src\/[^"]+)"/g)].map(([, source]) => String(source))
	const boot = closure(Object.keys(manifest).filter((key) => manifest[key]?.isEntry === true))
	const files = [...closure(routes)].filter((key) => !boot.has(key))
	return new Set(files.map((key) => `/${manifest[key]?.file}`))
}

// In the page: each `rel=prefetch` link the client appends, and how many of them have loaded or failed.
function trackPrefetchLinks(): void {
	const links = { hrefs: [] as string[], settled: 0 }
	Object.assign(window, { __prefetchLinks: links })
	const settle = (): void => void (links.settled += 1)
	new MutationObserver((records) => {
		for (const node of records.flatMap((record) => [...record.addedNodes])) {
			if (!(node instanceof HTMLLinkElement) || node.rel !== "prefetch") continue
			links.hrefs.push(node.href)
			node.addEventListener("load", settle, { once: true })
			node.addEventListener("error", settle, { once: true })
		}
	}).observe(document, { childList: true, subtree: true })
}

// The page's requests that have not finished or failed.
function inFlight(page: Page): () => number {
	const open = new Set<unknown>()
	page.on("request", (request) => open.add(request))
	page.on("requestfinished", (request) => open.delete(request))
	page.on("requestfailed", (request) => open.delete(request))
	return () => open.size
}

// In the page: every appended prefetch link has loaded or failed, and every one of `paths` has been fetched.
function settled(paths: readonly string[]): boolean {
	const links = Reflect.get(window, "__prefetchLinks") as { hrefs: string[]; settled: number }
	const fetched = new Set(performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname))
	return links.settled === links.hrefs.length && paths.every((path) => fetched.has(path))
}

// Waits until the idle warm-up has drained and returns the links it appended: every file it can fetch has been fetched,
// by a prefetch link or an import, every link it appended has loaded or failed, and no request of the page is in flight.
// "Every link present has loaded" also holds while the warm-up waits for the user's own requests, with files still
// queued (BUGS.md 520, 521). The next link goes in within the task of the last one's load, so a check never lands
// between them.
async function drained(page: Page, files: ReadonlySet<string>, flying: () => number): Promise<string[]> {
	await expect
		.poll(async () => flying() === 0 && (await page.evaluate(settled, [...files])), { timeout: 30_000 })
		.toBe(true)
	const hrefs = await page.evaluate(() => (Reflect.get(window, "__prefetchLinks") as { hrefs: string[] }).hrefs)
	expect(hrefs.map((href) => new URL(href).pathname).filter((path) => !files.has(path))).toEqual([])
	return hrefs
}

// Holds every `_flare=prefetch` request 1 s: the user's own work, which the warm-up waits for (BUGS.md 520).
async function holdPrefetches(page: Page): Promise<void> {
	await page.route(
		(url) => url.searchParams.get("_flare") === "prefetch",
		async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 1000))
			await route.continue()
		},
	)
}

// In the page: as the warm-up appends its first link, the user asks for something, by focusing a link that prefetches
// on intent or by scrolling the viewport prefetch's links into view, so the warm-up pauses partway.
function pauseAtFirstLink(by: string): void {
	const observer = new MutationObserver((records) => {
		const added = records.flatMap((record) => [...record.addedNodes])
		if (!added.some((node) => node instanceof HTMLLinkElement && node.rel === "prefetch")) return
		observer.disconnect()
		if (by === "intent") document.querySelector<HTMLElement>('aside a[data-active="false"]')?.focus()
		else window.scrollTo(0, document.body.scrollHeight)
	})
	observer.observe(document, { childList: true, subtree: true })
}

// A navigation after the idle warm-up fetches no script, also when the user's own request pauses the warm-up partway:
// a focused sidebar link's intent prefetch, or a viewport prefetch a scroll fires, its data request held 1 s. The
// warm-up appends a link after that request ends, so the pause came partway.
const PAUSES = [
	{ by: "intent", from: "/docs/routing", to: "/", marker: "#message" },
	{ by: "viewport", from: "/", to: "/docs/routing", marker: "#doc-title" },
] as const
for (const pause of PAUSES) {
	test(`warm-up paused by ${pause.by}`, async ({ page, docs }, info) => {
		prodChromium(info)
		const files = warmable(docs)
		const flying = inFlight(page)
		await page.addInitScript(trackPrefetchLinks)
		await page.addInitScript(pauseAtFirstLink, pause.by)
		await holdPrefetches(page)
		await open(page, docs.origin, pause.from)
		await idle(page)
		await drained(page, files, flying)
		const loaded = await scripts(page)
		await navigate(page, pause.to, pause.marker)
		await drained(page, files, flying)
		expect((await scripts(page)).filter((url) => !loaded.includes(url))).toEqual([])
		const resumed = await page.evaluate(() => {
			const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[]
			const held = entries.filter((entry) => entry.name.includes("_flare=prefetch"))
			const links = entries.filter((entry) => entry.initiatorType === "link" && entry.name.endsWith(".js"))
			return links.some((link) => held.some((entry) => link.startTime >= entry.responseEnd))
		})
		expect(resumed).toBe(true)
	})
}

// The heavy pages' first loads stay without a long main-thread task (plan 21 15.6, v0's long-task checks).
test("heavy pages long tasks", async ({ page, docs }, info) => {
	prodChromium(info)
	await page.addInitScript(() => {
		const longest = { ms: 0 }
		Object.assign(window, { __longest: longest })
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) longest.ms = Math.max(longest.ms, entry.duration)
		}).observe({ type: "longtask", buffered: true })
	})
	for (const path of HEAVY) {
		await open(page, docs.origin, path)
		const longest = await page.evaluate(() => Number(Reflect.get(Object(Reflect.get(window, "__longest")), "ms")))
		report(`longest task ${path}`, longest)
		expect(longest, path).toBeLessThanOrEqual(LONGEST_TASK_MS)
	}
})

// The shell streams before a deferred value settles: the first body bytes of a page whose value waits 500 ms arrive
// in under 250 ms, and the body ends after the value (B92).
test("streaming shell", async ({ docs }, info) => {
	prodChromium(info)
	const start = performance.now()
	const response = await fetch(`${docs.origin}/perf/200`)
	const reader = response.body!.getReader()
	await reader.read()
	const first = performance.now() - start
	let text = ""
	for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
		text += new TextDecoder().decode(chunk.value)
	const total = performance.now() - start
	report("shell first byte ms", first)
	expect(text).toContain("200 rows counted")
	expect(first).toBeLessThan(250)
	expect(total).toBeGreaterThanOrEqual(500)
})

// No page shifts its layout as it loads, hydrates, and fills its deferred values: CLS under 0.01, v0's budget.
test("layout shift", async ({ page, docs }, info) => {
	prodChromium(info)
	await page.addInitScript(() => {
		const shift = { total: 0 }
		Object.assign(window, { __shift: shift })
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const layout = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
				if (!layout.hadRecentInput) shift.total += layout.value
			}
		}).observe({ type: "layout-shift", buffered: true })
	})
	const pages: ReadonlyArray<readonly [string, string]> = [
		["/", "#message"],
		["/perf/200", "#perf-late"],
		["/perf/1000", "#perf-late"],
		["/changelog", "#releases"],
	]
	for (const [path, filled] of pages) {
		await open(page, docs.origin, path)
		await page.locator(filled).first().waitFor()
		await page.waitForTimeout(300)
		const cls = await page.evaluate(() => Number(Reflect.get(Object(Reflect.get(window, "__shift")), "total")))
		report(`cls ${path}`, cls)
		expect(cls, path).toBeLessThan(0.01)
	}
})

// A first load stays under 100 requests and fetches no URL twice from navigation start through idle, its prefetch
// included. A repeat the page caused after idle, a navigation back that refetches its data, does not count (rules.ts).
test("requests", async ({ page, docs }, info) => {
	prodChromium(info)
	await open(page, docs.origin, "/")
	await idle(page)
	const windowEnd = await page.evaluate(() => performance.now())
	const entries = () =>
		page.evaluate(() =>
			performance.getEntriesByType("resource").map((entry) => ({ url: entry.name, startTime: entry.startTime })),
		)
	const first = await entries()
	report("requests", first.length + 1)
	expect(first.length + 1).toBeLessThan(100)
	expect(duplicates(first, windowEnd)).toEqual([])
	await navigate(page, "/docs/routing", "#doc-title")
	await navigate(page, "/", "#message")
	expect(duplicates(await entries(), windowEnd)).toEqual([])
})

// Ten rounds of client navigations among four pages: the last rounds take at most three times the first (v0's ratio),
// and nothing logs an error.
test("navigation steady", async ({ page, docs }, info) => {
	prodChromium(info)
	const problems = watch(page)
	await open(page, docs.origin, "/")
	await idle(page)
	const rounds: number[] = []
	for (let round = 0; round < (LONG ? 50 : 10); round += 1) {
		const start = performance.now()
		for (const [path, marker] of ROUND) await navigate(page, path, marker)
		rounds.push(performance.now() - start)
	}
	report("navigation slowdown", slowdown(rounds))
	report("navigation round ms", rounds.toSorted((left, right) => left - right)[Math.floor(rounds.length / 2)]!)
	expect(slowdown(rounds)).toBeLessThanOrEqual(3)
	expect(problems).toEqual([])
})

// The heap after forced collection grows no more than its budget across round trips of the heavy pages: what a leak
// such as round 3's <Image> one keeps grows it (Chromium's heap, read over CDP).
test("heap steady", async ({ page, docs }, info) => {
	prodChromium(info)
	const cdp = await page.context().newCDPSession(page)
	// The JS heap and the DOM's live nodes, each after two forced collections: a detached page held alive is nodes.
	const measure = async (): Promise<{ heap: number; nodes: number }> => {
		await cdp.send("HeapProfiler.collectGarbage")
		await cdp.send("HeapProfiler.collectGarbage")
		const { usedSize } = await cdp.send("Runtime.getHeapUsage")
		const { nodes } = await cdp.send("Memory.getDOMCounters")
		return { heap: usedSize, nodes }
	}
	await open(page, docs.origin, "/")
	await idle(page)
	const trips = LONG ? 31 : 11
	let afterOne = { heap: 0, nodes: 0 }
	for (let trip = 1; trip <= trips; trip += 1) {
		for (const [path, marker] of ROUND) await navigate(page, path, marker)
		if (trip === 1) afterOne = await measure()
	}
	const afterAll = await measure()
	const growth = heapGrowth(afterOne.heap, afterAll.heap, trips)
	const nodes = heapGrowth(afterOne.nodes, afterAll.nodes, trips)
	report("heap growth per trip B", growth)
	report("nodes growth per trip", nodes)
	report("heap after B", afterAll.heap)
	expect(growth).toBeLessThanOrEqual(HEAP_GROWTH)
	expect(nodes).toBeLessThanOrEqual(NODES_GROWTH)
})

// Hydration lands within its budget on the home page and the data-heavy page, with no error logged.
test("hydration", async ({ page, docs }, info) => {
	prodChromium(info)
	const problems = watch(page)
	await page.addInitScript(() => {
		new MutationObserver((_records, observer) => {
			if (!document.documentElement.hasAttribute("data-flare-hydrated")) return
			observer.disconnect()
			Reflect.set(window, "__hydratedAt", performance.now())
		}).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-flare-hydrated"] })
	})
	for (const path of ["/", "/perf/200"]) {
		await open(page, docs.origin, path)
		const at = await page.evaluate(() => Number(Reflect.get(window, "__hydratedAt")))
		report(`hydrated ms ${path}`, at)
		expect(at, path).toBeLessThanOrEqual(HYDRATED[path] ?? 0)
	}
	expect(problems).toEqual([])
})

// A production document holds no dev path or client, sends no Server-Timing, loads its entry as a module, and blocks
// its first paint on no stylesheet (rules.ts).
test("prod document", async ({ http, docs }, info) => {
	prodChromium(info)
	for (const path of ["/", "/perf/200"]) {
		const response = await http.get(`${docs.origin}${path}`)
		expect([path, prodDocumentProblems(await response.text(), response.headers())]).toEqual([path, []])
	}
})
