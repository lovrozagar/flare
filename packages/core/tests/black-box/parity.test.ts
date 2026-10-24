import { expect, it } from "vitest"
import { differences } from "./parity.ts"

// One answer as parity reads it: the status, the headers it compares, and the body.
function answered(cache: string, body: string, type = "application/x-ndjson"): string {
	return ["200", `content-type: ${type}`, `flare-cache: ${cache}`, body].join("\n")
}

const LINES = ["page /changelog", "page /changelog?_flare=data"]

// A document that missed, and its data request sent right after it: the data answer joined the document's flight or
// read the entry its write stored, and either way carries that render's `renderedBy` (dx/cache.md single flight,
// BUGS.md 515). The page prints the stamp; the data answer carries it as a wire string.
function pair(id: string, dataCache: string, dataId = id): string[] {
	return [
		answered("miss", `<code id="changelog-rendered-by">${id}</code>`, "text/html"),
		answered(dataCache, `{"k":["renderedBy"],"v":[{"t":1,"s":"${dataId}"}]}`),
	]
}

// Joined on one runtime and read from the store on another is the same answer: the label is where the data request
// landed against the document's write, not a difference.
it("joined or stored", () => {
	expect(differences(LINES, { node: pair("1a2b3c4d", "miss"), bun: pair("5e6f7a8b", "hit") })).toEqual([])
})

// The same labels over a render of its own: the data request ran the loaders again, which single flight forbids. It
// is named as such, and its label is left as it was, so it also parts from Node's settled answer.
it("rendered again", () => {
	const again = pair("5e6f7a8b", "miss", "99999999")
	const found = differences(LINES, { node: pair("1a2b3c4d", "miss"), bun: again })
	expect(found.map((line) => line.replace(/ part at .*$/, ""))).toEqual([
		"page /changelog?_flare=data: bun rendered again after the document's miss (document 5e6f7a8b)",
		"page /changelog?_flare=data: node and bun",
	])
})

// Any other difference still parts the answers: a status, a header, or the body.
it("other differences", () => {
	const node = pair("1a2b3c4d", "miss")
	const status = [node[0] ?? "", (node[1] ?? "").replace(/^200/, "500")]
	const header = [node[0] ?? "", (node[1] ?? "").replace("application/x-ndjson", "text/plain")]
	const body = [node[0] ?? "", `${node[1] ?? ""}, more`]
	const found = differences(LINES, { node, status, header, body })
	expect(found.map((line) => line.slice(0, line.indexOf(" part at")))).toEqual([
		"page /changelog?_flare=data: node and status",
		"page /changelog?_flare=data: node and header",
		"page /changelog?_flare=data: node and body",
	])
})
