import { expect, it } from "vitest"
import type { Policy } from "../lifecycle/answers.ts"
import type { SharedRender } from "./scrub.ts"
import { entryInput } from "./shared-page.ts"

// A shared render that finished, with only the fields an entry reads set.
function shared(headers: Record<string, string | string[]>): SharedRender {
	const run = { response: new Response(null, { status: 200 }), headers, security: {} }
	return { run, html: "<p>p</p>", ndjson: "", nonce: "n", settled: true, startedAt: 5 } as unknown as SharedRender
}

// An entry carries the render's status, headers, and security, the mode it was stored under, and the policy's store
// tags (dx/cache.md).
it("entry input", () => {
	const tags = { store: ["user:7", "a"], edge: ["a"] }
	const policy = { decision: { policy: "shared", cdn: { tags: ["a"] } }, tags } as unknown as Policy
	const input = entryInput(shared({ "x-route": "1" }), { mode: "ssr", policy })
	expect(input).toMatchObject({ status: 200, headers: { "x-route": "1" }, render: "ssr", startedAt: 5 })
	expect(input.tags).toEqual(["user:7", "a"])
})
