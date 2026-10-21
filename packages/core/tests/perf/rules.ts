// The rules docs-perf's gate checks apply to what a browser recorded (plan 21 15.6), kept pure so each is tested on its
// own: the requests a first load made, a production document, a run of navigations, and the heap across round trips.

export type Fetched = { url: string; startTime: number }

// The URLs a first load fetched more than once, from navigation start through `windowEnd` (the page's idle), idle
// prefetch included. A repeat needs a cause the page took, an `invalidate()`, a cookie-setting server function, or a
// reload, and those come after the window, so an entry that starts after it never counts.
export function duplicates(entries: readonly Fetched[], windowEnd: number): string[] {
	const seen = new Set<string>()
	const twice = new Set<string>()
	for (const entry of entries) {
		if (entry.startTime > windowEnd) continue
		if (seen.has(entry.url)) twice.add(entry.url)
		seen.add(entry.url)
	}
	return [...twice]
}

// What a production document must not hold, and must: no dev path or dev client, no Server-Timing, a module entry (an
// inline module that imports the client, as v1 writes it, or a module `src`), every script `src` a module, and no
// stylesheet that blocks the first paint (B15: the critical style is inline, the sheet a preload). Each problem is one
// line.
export function prodDocumentProblems(html: string, headers: Readonly<Record<string, string>>): string[] {
	const problems: string[] = []
	for (const devPath of ["@vite/client", "/@fs/", "/@id/", "/src/"]) {
		if (html.includes(devPath)) problems.push(`holds ${devPath}`)
	}
	if (Object.keys(headers).some((name) => name.toLowerCase() === "server-timing")) problems.push("sends Server-Timing")
	const sources = [...html.matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/g)].map((found) => found[0])
	if (sources.some((tag) => !/\btype="module"/.test(tag))) problems.push("an entry script that is not a module")
	if (!/<script\b[^>]*\btype="module"/.test(html)) problems.push("no module entry")
	const head = html.slice(0, html.indexOf("</head>") === -1 ? html.length : html.indexOf("</head>"))
	if (/<link\b[^>]*\brel="stylesheet"/.test(head.replaceAll(/<noscript>[\s\S]*?<\/noscript>/g, ""))) {
		problems.push("a render-blocking stylesheet")
	}
	return problems
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((left, right) => left - right)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

// The last rounds' median over the first rounds', each round's time its navigations' sum: steady navigation stays near
// one, a per-navigation leak climbs. The first rounds' median is floored at `floor` ms, so a fast first round does
// not turn noise into a ratio (v0's rule).
export function slowdown(rounds: readonly number[], take = 3, floor = 50): number {
	const first = median(rounds.slice(0, take))
	const last = median(rounds.slice(-take))
	return last / Math.max(first, floor)
}

// Heap growth per round trip, in bytes, from the heap after one round trip to the heap after the rest.
export function heapGrowth(afterOne: number, afterAll: number, trips: number): number {
	return trips <= 1 ? 0 : (afterAll - afterOne) / (trips - 1)
}
