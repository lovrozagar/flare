// v0's url.bench.ts bench, ported (plan 21 15.6): a route id and its values to the URL. Nightly only: a bench's number is compared to the previous
// night's on the same runner class, not budgeted (tests/perf/BASELINE.md).
import { bench, describe } from "vitest"
import { buildUrl, encodeParam } from "../src/shared/url/href.ts"

describe("buildUrl", () => {
	bench("static path", () => void buildUrl({ to: "_root_/about" }))
	bench("one param", () => void buildUrl({ to: "_root_/posts/[slug]", params: { slug: "building-web-frameworks" } }))
	bench("catch-all", () =>
		void buildUrl({ to: "_root_/docs/[...path]", params: { path: ["server", "create-server"] } }))
	bench("optional absent", () => void buildUrl({ to: "_root_/files/[[...rest]]", params: {} }))
	bench("path and search", () =>
		void buildUrl({ to: "_root_/posts/[slug]", params: { slug: "a" }, search: { page: 2, tags: ["x", "y"] } }))
	bench("path, search, and hash", () => void buildUrl({ to: "_root_/about", search: { q: "a b" }, hash: "team" }))
})

describe("encodeParam", () => {
	bench("plain", () => void encodeParam("building-web-frameworks", "slug"))
	bench("needs escaping", () => void encodeParam("a b/c?d#e", "slug"))
})
