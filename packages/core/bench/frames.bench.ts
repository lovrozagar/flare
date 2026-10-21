// v0's ndjson.bench.ts bench, ported (plan 21 15.6): the navigation's NDJSON frames, encoded and decoded. Nightly only: a bench's number is compared to the previous
// night's on the same runner class, not budgeted (tests/perf/BASELINE.md).
import { bench, describe } from "vitest"
import { decodeLine, encodeFrame } from "../src/shared/protocol/frames.ts"
import { toWire } from "../src/shared/protocol/value.ts"

const data = toWire({ post: { title: "Building Web Frameworks", body: "x".repeat(1200) }, likes: 42 })
const loader = { t: "l" as const, m: "_root_/posts/[slug]", d: data }
const chunk = { t: "c" as const, m: "_root_/posts/[slug]", k: "comments", d: toWire([{ author: "a", text: "t" }]) }
const loaderLine = encodeFrame(loader)

describe("encodeFrame", () => {
	bench("loader frame", () => void encodeFrame(loader))
	bench("deferred chunk frame", () => void encodeFrame(chunk))
	bench("ready frame", () => void encodeFrame({ t: "r" }))
	bench("done frame", () => void encodeFrame({ t: "d" }))
})

describe("decodeLine", () => {
	bench("loader frame", () => void decodeLine(loaderLine))
})
