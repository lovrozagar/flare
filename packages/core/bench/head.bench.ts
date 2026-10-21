// v0's head.bench.ts bench, ported (plan 21 15.6): a route's head config to its tags. Nightly only: a bench's number is compared to the previous
// night's on the same runner class, not budgeted (tests/perf/BASELINE.md).
import { bench, describe } from "vitest"
import { headTags } from "../src/shared/head/tags.ts"

const full = {
	title: "Building Web Frameworks from Scratch",
	description: "Building a web framework from scratch teaches you more about the web platform than years of tools.",
	canonical: "https://flare.test/posts/building-web-frameworks",
	openGraph: { type: "article" as const, title: "Building Web Frameworks", description: "A post" },
	meta: { charset: "utf-8", viewport: "width=device-width, initial-scale=1" },
	custom: { links: [{ rel: "preconnect", href: "https://cdn.flare.test" }], meta: [{ name: "x", content: "y" }] },
}

describe("headTags", () => {
	bench("title only", () => void headTags({ title: "About" }))
	bench("title, description, canonical, open graph, meta, custom", () => void headTags(full))
})
