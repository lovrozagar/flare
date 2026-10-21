import { gzipSync } from "node:zlib"
import type { Page } from "@playwright/test"
import { expect, idle, open, serverOf, test } from "./docs.fixture.ts"

// What the docs app ships, in bytes, from the production build: each page's document and its gzip, its state script,
// its navigation's NDJSON, and the JavaScript the first load, its idle prefetch, and one client navigation fetch,
// gzipped as served (plan 21 15.6). A build is deterministic, so each budget is the size measured on 2026-10-17 with
// about 3% room, and growth past one is a decision, as the bundle budgets are (bits/01). The documents were measured
// again on 2026-10-18, after BUGS.md 352's entry handler grew each page's client script from 71 to 985 bytes. The
// JavaScript is the docs app's whole client: v0.9.23's measure on the same page was 70 KB of initial JS and 2.86 KB of
// navigation JS, against v1's 54 KB and 1.5 KB for the same route alone. The first load's JavaScript was raised to its
// measured size on 2026-10-21, each raise's breakdown in its commit message.
const BUDGET: Record<string, number> = {
	"html /": 53_200,
	"html gz /": 11_800,
	"state /": 3_450,
	"ndjson /": 2_260,
	"html /docs/routing": 62_700,
	"html gz /docs/routing": 13_700,
	"state /docs/routing": 6_450,
	"ndjson /docs/routing": 4_970,
	"initial js gz": 121_660,
	"prefetch js gz": 11_800,
	"navigation js gz": 0,
}

// The longest main-thread task a first load and one navigation may take: ten times the 50 ms a long task starts at,
// since a slower machine stretches every task (plan 21 15.6).
const LONGEST_TASK_MS = 500

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
	test.skip(serverOf(info) !== "node-prod" || info.project.name.split("-")[2] !== "chromium", "one build, one count")
	const sizes: Record<string, number> = {}
	for (const path of ["/", "/docs/routing"]) {
		const html = await (await http.get(`${docs.origin}${path}`)).text()
		sizes[`html ${path}`] = html.length
		sizes[`html gz ${path}`] = gzipSync(html).length
		sizes[`state ${path}`] = /<script id="flare-state"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1]?.length ?? 0
		sizes[`ndjson ${path}`] = (await (await http.get(`${docs.origin}${path}?_flare=data`)).text()).length
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
