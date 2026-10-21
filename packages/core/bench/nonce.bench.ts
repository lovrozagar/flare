// v0's prerender.bench.ts bench, ported (plan 21 15.6): a stored page's nonce, written as the sentinel and back. Nightly only: a bench's number is compared to the previous
// night's on the same runner class, not budgeted (tests/perf/BASELINE.md).
import { bench, describe } from "vitest"
import { fromSentinel, newSentinel, toSentinel } from "../src/server/cache/nonce.ts"

const nonce = "0123456789abcdef0123456789abcdef"
const sentinel = newSentinel()
const body =
	`<!doctype html><html><head><script nonce="${nonce}">a()</script><style nonce="${nonce}">p{}</style></head>` +
	`<body>${"<p>text</p>".repeat(2000)}<script nonce="${nonce}">b()</script>` +
	`<script id="flare-state" nonce="${nonce}">self.flare={"nonce":"${nonce}","matches":[]}</script></body></html>`
const stored = toSentinel(body, nonce, sentinel)

describe("nonce", () => {
	bench("write: request nonce to the sentinel, 22 KB page", () => void toSentinel(body, nonce, sentinel))
	bench("hit: sentinel to the request nonce", () => void fromSentinel(stored, sentinel, nonce))
	bench("hit with no nonce", () => void fromSentinel(stored, sentinel, ""))
})
