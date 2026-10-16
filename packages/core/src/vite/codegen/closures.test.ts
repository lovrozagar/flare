import { expect, it } from "vitest"
import { closureMarker, fillClosures, type BundleChunk } from "./closures.ts"

// The map's chunk holds one marker per route, in each quote style a minifier may leave.
const map = (fileName: string): BundleChunk => ({
	fileName,
	isEntry: true,
	imports: ["assets/vendor.js"],
	code: `export const chunks = { "a": [A, ${closureMarker("ra")}], "b": [B, '__flare_closure_rb__'], "c": [C, \`__flare_closure_rc__\`] };`,
})

const BUNDLE: BundleChunk[] = [
	map("assets/client.js"),
	{ fileName: "assets/vendor.js", isEntry: false, imports: [], code: "" },
	// Route chunks are emitted, so the bundle calls them entries too.
	{
		fileName: "assets/a.js",
		isEntry: true,
		imports: ["assets/shared.js", "assets/vendor.js", "https://cdn.test/x.js"],
		code: "",
	},
	{ fileName: "assets/b.js", isEntry: true, imports: ["assets/shared.js", "assets/b-only.js"], code: "" },
	{ fileName: "assets/c.js", isEntry: true, imports: [], code: "" },
	{ fileName: "assets/shared.js", isEntry: false, imports: ["assets/deep.js"], code: "" },
	{ fileName: "assets/b-only.js", isEntry: false, imports: ["assets/shared.js"], code: "" },
	{ fileName: "assets/deep.js", isEntry: false, imports: [], code: "" },
]

const FILES: Record<string, string> = { ra: "assets/a.js", rb: "assets/b.js", rc: "assets/c.js" }

const url = (path: string): string => `new URL(${JSON.stringify(path)}, import.meta.url).href`

// Each route's marker becomes the files its chunk imports, directly or through others, each once and in import order,
// without what the app's entry loads at boot or an import outside the bundle; a route that imports nothing keeps its
// chunk alone (BUGS.md 124.6).
it("closures", () => {
	const filled = fillClosures(BUNDLE, (ref) => FILES[ref] ?? "")
	expect([...filled.keys()]).toEqual(["assets/client.js"])
	expect(filled.get("assets/client.js")).toBe(
		`export const chunks = { "a": [A, ${url("shared.js")}, ${url("deep.js")}], "b": [B, ${url("shared.js")}, ${url("b-only.js")}, ${url("deep.js")}], "c": [C, ] };`,
	)
})

// The URLs are relative to the chunk that holds the map.
it("closure paths", () => {
	const filled = fillClosures([map("assets/entry/client.js"), ...BUNDLE.slice(1)], (ref) => FILES[ref] ?? "")
	expect(filled.get("assets/entry/client.js")).toContain(`"a": [A, ${url("../shared.js")}, ${url("../deep.js")}]`)
})
