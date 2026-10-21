import { expect, it } from "vitest"
import { duplicates, heapGrowth, prodDocumentProblems, slowdown } from "./rules.ts"

// A URL twice inside the window is a duplicate; the same repeat after it, an invalidate's refetch say, is not.
it("duplicates", () => {
	const entries = [
		{ url: "/a.js", startTime: 10 },
		{ url: "/b.js", startTime: 20 },
		{ url: "/a.js", startTime: 30 },
		{ url: "/?_flare=data", startTime: 900 },
		{ url: "/?_flare=data", startTime: 1500 },
	]
	expect(duplicates(entries, 1000)).toEqual(["/a.js"])
	expect(duplicates(entries.slice(1), 1000)).toEqual([])
	expect(duplicates(entries, 2000)).toEqual(["/a.js", "/?_flare=data"])
})

const PROD =
	'<!doctype html><html><head><style id="flare-critical">p{}</style>' +
	'<link id="flare-stylesheet" rel="preload" as="style" href="/assets/app.css"><noscript><link rel="stylesheet" href="/assets/app.css"></noscript>' +
	'</head><body><script type="module" src="/assets/entry.js"></script></body></html>'

// A clean production document has no problem; each planted fault is named.
it("prod document", () => {
	expect(prodDocumentProblems(PROD, { "content-type": "text/html" })).toEqual([])
	expect(
		prodDocumentProblems(PROD.replace("</head>", '<script type="module" src="/@vite/client"></script></head>'), {}),
	).toEqual(["holds @vite/client"])
	expect(prodDocumentProblems(PROD.replace("/assets/entry.js", "/@fs/x/src/entry.js"), {})).toEqual([
		"holds /@fs/",
		"holds /src/",
	])
	expect(prodDocumentProblems(PROD.replace("/assets/entry.js", "/@id/x"), {})).toEqual(["holds /@id/"])
	expect(prodDocumentProblems(PROD, { "Server-Timing": "render;dur=3" })).toEqual(["sends Server-Timing"])
	expect(prodDocumentProblems(PROD.replace(' type="module"', ""), {})).toEqual([
		"an entry script that is not a module",
		"no module entry",
	])
	expect(prodDocumentProblems(PROD.replace(/<script[^>]*><\/script>/, ""), {})).toEqual(["no module entry"])
	// v1's entry is an inline module that imports the client: no `src`, still a module entry.
	const inline = PROD.replace(/<script[^>]*><\/script>/, '<script type="module">import "/assets/entry.js"</script>')
	expect(prodDocumentProblems(inline, {})).toEqual([])
	expect(prodDocumentProblems(inline.replace("</body>", '<script src="/legacy.js"></script></body>'), {})).toEqual([
		"an entry script that is not a module",
	])
	expect(prodDocumentProblems(PROD.replace("</head>", '<link rel="stylesheet" href="/x.css"></head>'), {})).toEqual([
		"a render-blocking stylesheet",
	])
	expect(prodDocumentProblems("<p>no head</p>", {})).toEqual(["no module entry"])
})

// Steady rounds stay near one; a climbing run shows; a fast first round is floored.
it("slowdown", () => {
	expect(slowdown([100, 100, 100, 100, 100, 100])).toBe(1)
	expect(slowdown([100, 110, 120, 300, 320, 340])).toBeCloseTo(320 / 110)
	expect(slowdown([10, 10, 10, 60, 60, 60])).toBeCloseTo(60 / 50)
	expect(slowdown([100, 120, 130, 140])).toBeCloseTo(130 / 120)
})

it("heap growth", () => {
	expect(heapGrowth(1_000_000, 3_000_000, 11)).toBe(200_000)
	expect(heapGrowth(1_000_000, 900_000, 11)).toBe(-10_000)
	expect(heapGrowth(1_000_000, 2_000_000, 1)).toBe(0)
})
