import { afterEach, expect, it, vi } from "vitest"
import { QUERY_GETTER, registerQuery, type QueryGetter } from "../../shared/protocol/query.ts"
import { invalidation } from "./invalidate.ts"

afterEach(() => {
	Reflect.deleteProperty(globalThis, QUERY_GETTER)
})

function parts() {
	const order: string[] = []
	const note = (step: string) => () => void order.push(step)
	return {
		order,
		cache: { clear: vi.fn<() => void>(note("cache")) },
		prefetcher: { forget: vi.fn<() => void>(note("prefetch")) },
		revalidate: vi.fn<() => Promise<void>>(async () => void order.push("revalidate")),
	}
}

// `forget` drops the match cache, the held prefetches, and the registered query client's cache; `invalidate` forgets,
// then refetches the page on screen. With no query getter registered, or one without `clear`, the rest still goes
// (B133).
it("forget and invalidate", async () => {
	const bare = parts()
	invalidation(bare).forget()
	expect(bare.order).toEqual(["cache", "prefetch"])
	const getter: QueryGetter = Object.assign(() => undefined, { dehydrate: () => undefined })
	registerQuery(getter)
	invalidation(bare).forget()
	expect(bare.order).toEqual(["cache", "prefetch", "cache", "prefetch"])
	Reflect.deleteProperty(globalThis, QUERY_GETTER)
	const full = parts()
	const clear = (): void => void full.order.push("query")
	registerQuery(Object.assign(() => undefined, { dehydrate: () => undefined, clear }))
	await invalidation(full).invalidate()
	expect(full.order).toEqual(["cache", "prefetch", "query", "revalidate"])
})

// The document's state script and the `self.flare` fields it wrote hold the loader data the page was rendered with,
// the last visitor's included. Forgetting removes both and keeps only the booted transport, `call` (BUGS.md 363).
const call = (): undefined => undefined

it("forget drops the document state", () => {
	document.body.innerHTML =
		'<p>page</p><script id="flare-state">self.flare={"matches":[{"data":"ada@dash.test"}]}</script>'
	Reflect.set(globalThis, "flare", { matches: [{ data: "ada@dash.test" }], queries: [{ key: "me" }], call })
	invalidation(parts()).forget()
	expect(document.body.innerHTML).toBe("<p>page</p>")
	expect(Reflect.get(globalThis, "flare")).toEqual({ call })
	Reflect.deleteProperty(globalThis, "flare")
})
