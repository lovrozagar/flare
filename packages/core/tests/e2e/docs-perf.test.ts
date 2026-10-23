import { gzipSync } from "node:zlib"
import type { Page, TestInfo } from "@playwright/test"
import { duplicates, heapGrowth, prodDocumentProblems, slowdown } from "../perf/rules.ts"
import { expect, idle, open, serverOf, test, watch } from "./docs.fixture.ts"

// What the docs app ships, in bytes, from the production build: each page's document and its gzip, its state script,
// its navigation's NDJSON, and the JavaScript the first load, its idle prefetch, and one client navigation fetch,
// gzipped as served (plan 21 15.6). A build is deterministic, so each budget is the size measured on 2026-10-17 with
// about 3% room, and growth past one is a decision, as the bundle budgets are (bits/01). The documents were measured
// again on 2026-10-18, after BUGS.md 352's entry handler grew each page's client script from 71 to 985 bytes. The
// JavaScript is the docs app's whole client: v0.9.23's measure on the same page was 70 KB of initial JS and 2.86 KB of
// navigation JS, against v1's 54 KB and 1.5 KB for the same route alone. The first load's JavaScript was raised to its
// measured size on 2026-10-21, 2026-10-22, and 2026-10-23, with no room, each raise's breakdown in its commit
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
	"initial js gz": 123_127,
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
	const gzipped = async (urls: readonly string[]) => {
		let total = 0
		for (const url of urls) total += gzipSync(await (await http.get(url)).body()).length
		return total
	}
	await open(page, docs.origin, "/")
	// The app prefetches every route module once idle (`prefetch: { modules: "all" }`). The first load's JavaScript is
	// what it fetched but those, the prefetch is its own number, read once every `rel=prefetch` module has landed, and
	// a navigation then fetches none (BUGS.md 295).
	await idle(page)
	const prefetched = await page.waitForFunction(() => {
		const loaded = new Set(performance.getEntriesByType("resource").map((entry) => entry.name))
		const hrefs = [...document.querySelectorAll<HTMLLinkElement>("link[rel=prefetch]")].map((link) => link.href)
		return hrefs.length > 0 && hrefs.every((href) => loaded.has(href)) ? hrefs : undefined
	})
	// A module the page imported is the first load's, even when the idle prefetch also listed it, as it does for a route
	// a viewport prefetch was still importing when the list was made (CI 39093904905: 5298 bytes on the wrong side).
	const imported = [...new Set(await scripts(page, true))]
	const prefetch = ((await prefetched.jsonValue()) as string[]).filter((url) => !imported.includes(url))
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
