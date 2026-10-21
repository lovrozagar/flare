// v0's caches.bench.ts bench, ported (plan 21 15.6): the codec's loader data paths, which replaced v0's deferred collection and serialization. Nightly only: a bench's number is compared to the previous
// night's on the same runner class, not budgeted (tests/perf/BASELINE.md).
import { bench, describe } from "vitest"
import { fromWire, matchToWire, toWire } from "../src/shared/protocol/value.ts"

const flat = { id: 1, title: "Building Web Frameworks", author: "Sarah Chen", likes: 42 }
const rich = {
	post: { ...flat, body: "x".repeat(1200), published: new Date(0), tags: new Set(["web", "ssr"]) },
	comments: Array.from({ length: 3 }, (_, index) => ({
		author: `a${index}`,
		text: "t".repeat(100),
		date: "2025-03-15",
	})),
	meta: new Map([["views", 10]]),
}
const flatWire = toWire(flat)
const richWire = toWire(rich)

describe("toWire", () => {
	bench("flat object", () => void toWire(flat))
	bench("post, comments, Date, Set, Map", () => void toWire(rich))
	bench("match envelope", () =>
		void matchToWire({ id: "_root_/posts/[slug]", params: { slug: "a" }, search: {}, data: rich }))
})

describe("fromWire", () => {
	bench("flat object", () => void fromWire(flatWire))
	bench("post, comments, Date, Set, Map", () => void fromWire(richWire))
})
