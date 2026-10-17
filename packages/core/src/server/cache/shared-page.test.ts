import { expect, it } from "vitest"
import type { Loaded, Policy } from "../lifecycle/answers.ts"
import type { SharedRender } from "./scrub.ts"
import { entryInput } from "./shared-page.ts"

// A shared render that finished, with only the fields an entry reads set.
function shared(headers: Record<string, string | string[]>): SharedRender {
	const run = { response: new Response(null, { status: 200 }), headers, security: {} }
	return { run, html: "<p>p</p>", ndjson: "", nonce: "n", settled: true, startedAt: 5 } as unknown as SharedRender
}

function loaded(cache: unknown): Loaded {
	return { id: "_root_/p", params: { id: "7" }, chain: [{ module: { cache } }] } as unknown as Loaded
}

// An entry carries the render's status, headers, and security, the mode it was stored under, and its tags: the
// page's `ssr.tags` and the decision's `cdn.tags`, each read with the raw params, deduped (dx/cache.md).
it("entry input", () => {
	const policy = { decision: { policy: "shared", cdn: { tags: ["a"] } }, params: { id: "7" } } as unknown as Policy
	const cache = { ssr: { ttl: "1h", tags: ({ params }: { params: { id: string } }) => [`user:${params.id}`, "a"] } }
	const input = entryInput(shared({ "x-route": "1" }), loaded(cache), { mode: "ssr", policy })
	expect(input).toMatchObject({ status: 200, headers: { "x-route": "1" }, render: "ssr", startedAt: 5 })
	expect(input.tags).toEqual(["user:7", "a"])
	expect(entryInput(shared({}), loaded(undefined), { mode: "isr", policy }).tags).toEqual(["a"])
})
