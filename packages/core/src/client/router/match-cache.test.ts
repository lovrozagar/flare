import { expect, it, vi } from "vitest"
import { createPage } from "../../shared/route-builder/page.ts"
import { revive, type Pending } from "../navigation/frames.ts"
import { cachedMatches, cacheFor, createMatchCache, remember, type CachedMatch, type Effects } from "./match-cache.ts"

function clock(): { now: () => number; at: (ms: number) => void } {
	let current = 0
	return { now: () => current, at: (ms) => (current = ms) }
}

const place = { pathname: "/users/7", search: "", hash: "", params: { id: "7" } }

function page(effects?: Effects, extra: Partial<CachedMatch> = {}): CachedMatch {
	return { route: "_root_/users/[id]", id: "id=7&", layout: false, params: { id: "7" }, search: {}, effects, ...extra }
}

const layout: CachedMatch = { route: "_root_", id: "id=7&", layout: true, params: { id: "7" }, search: {} }

function cacheAt(options: { staleTime?: number; gcTime?: number; max?: number } = {}) {
	const time = clock()
	const cache = createMatchCache({ staleTime: 1000, gcTime: 60_000, ...options, now: time.now })
	return { cache, time }
}

type PlanCall = {
	revalidate?: boolean
	trigger?: "initial" | "navigation" | "revalidation"
	pop?: boolean
}

function plan(cache: ReturnType<typeof createMatchCache>, matches: CachedMatch[], call: PlanCall = {}) {
	const trigger = call.trigger ?? "navigation"
	const revalidate = call.revalidate ?? false
	return cache.plan({ matches, trigger, revalidate, current: place, next: place, pop: call.pop ?? false })
}

function byQuery({ search }: { search: Record<string, string | string[]> }): unknown[] {
	return [search.q]
}

it("store success", () => {
	const { cache } = cacheAt()
	cache.store(page(), { data: "user", deferred: false })
	expect(cache.read(page())?.data).toBe("user")
})

it("evict error", () => {
	const { cache } = cacheAt()
	cache.store(page(), { data: "user", deferred: false })
	cache.evict(page())
	expect(cache.read(page())).toBeUndefined()
})

it("stale time", () => {
	const { cache, time } = cacheAt({ staleTime: 1000 })
	cache.store(page(), { data: "user", deferred: false })
	time.at(1000)
	expect(plan(cache, [page()]).stale).toEqual(["id=7&"])
	time.at(1001)
	expect(plan(cache, [page()]).stale).toEqual([])
	expect(cache.read(page())?.data).toBe("user")
	// `0` is never fresh, even read in the millisecond it was stored (B19).
	const zero = cacheAt({ staleTime: 0 })
	zero.cache.store(page(), { data: "user", deferred: false })
	expect(plan(zero.cache, [page()])).toEqual({ fetch: true, stale: [], fresh: false, held: false })
})

// An entry stored on a given clock, the document's render time, ages from then (BUGS.md 139).
it("seed at", () => {
	const { cache, time } = cacheAt({ staleTime: 60_000 })
	time.at(600_000)
	cache.store(page(), { data: "old", deferred: false }, 0)
	expect(plan(cache, [page()]).stale).toEqual([])
	cache.store(page(), { data: "new", deferred: false }, 600_000)
	expect(plan(cache, [page()]).stale).toEqual(["id=7&"])
})

// One plan asks each page once, whatever the trigger.
it("asks once", () => {
	const { cache } = cacheAt()
	cache.store(page(), { data: "user", deferred: false })
	for (const [trigger, answer] of [
		["initial", true],
		["initial", false],
		["navigation", false],
	] as const) {
		const shouldRefetch = vi.fn<NonNullable<Effects["shouldRefetch"]>>(() => answer)
		plan(cache, [page({ shouldRefetch })], { trigger })
		expect(shouldRefetch).toHaveBeenCalledOnce()
	}
})

it("gc", () => {
	const { cache, time } = cacheAt({ gcTime: 1000 })
	cache.store(page(), { data: "user", deferred: false })
	time.at(1001)
	expect(cache.read(page())).toBeUndefined()
	expect(() => createMatchCache({ staleTime: 0, gcTime: -1 })).toThrow(/gcTime/)
	const wall = createMatchCache({ staleTime: 0, gcTime: 60_000 })
	wall.store(page(), { data: "user", deferred: false })
	expect(wall.read(page())?.data).toBe("user")
})

it("loader deps", () => {
	const { cache } = cacheAt()
	const loaderDeps = vi.fn<NonNullable<Effects["loaderDeps"]>>(({ search }) => [search.q])
	const first = page({ loaderDeps }, { search: { q: "a" } })
	cache.store(first, { data: "a", deferred: false, deps: cache.deps(first) })
	expect(plan(cache, [page({ loaderDeps }, { search: { q: "b" } })]).stale).toEqual([])
	expect(loaderDeps).toHaveBeenLastCalledWith({ search: { q: "b" }, params: { id: "7" } })
	expect(() => createPage("_root_/x").effects({})).toThrow(/effects/)
	const record = createPage("_root_/x")
		.effects({ loaderDeps })
		.render(() => "x")
	expect(record.effects).toEqual({ loaderDeps })
})

it("loader deps same", () => {
	const { cache } = cacheAt()
	const loaderDeps: Effects["loaderDeps"] = byQuery
	const first = page({ loaderDeps }, { search: { q: "a" } })
	cache.store(first, { data: "a", deferred: false, deps: cache.deps(first) })
	const again = page({ loaderDeps }, { search: { q: "a" } })
	expect(plan(cache, [again]).stale).toEqual(["id=7&"])
	expect(again.id).toBe(first.id)
	expect(cache.deps(page())).toBeUndefined()
})

// A landing stores the deps the page was cached under, so the same deps are fresh and different ones are not (B19).
it("loader deps held", () => {
	const { cache } = cacheAt()
	const loaderDeps: Effects["loaderDeps"] = byQuery
	const landing = { data: { "_root_/users/[id]": "a" }, heads: {} }
	remember(cache, [page({ loaderDeps }, { search: { q: "a" } })], landing)
	expect(cache.read(page({ loaderDeps }, { search: { q: "a" } }))?.deps).toBe(JSON.stringify(["a"]))
	expect(plan(cache, [page({ loaderDeps }, { search: { q: "a" } })]).stale).toEqual(["id=7&"])
	expect(plan(cache, [page({ loaderDeps }, { search: { q: "b" } })]).stale).toEqual([])
})

it("should refetch", () => {
	const { cache } = cacheAt()
	cache.store(page(), { data: "user", deferred: false })
	const shouldRefetch = vi.fn<NonNullable<Effects["shouldRefetch"]>>(({ trigger }) => trigger === "initial")
	const hydrate = cache.plan({
		matches: [page({ shouldRefetch })],
		trigger: "initial",
		revalidate: false,
		current: place,
		next: place,
	})
	expect(hydrate).toEqual({ fetch: true, stale: [], fresh: false, held: false })
	expect(shouldRefetch).toHaveBeenCalledWith(
		expect.objectContaining({ trigger: "initial", location: { current: place, next: place }, params: { id: "7" } }),
	)
	const quiet = cache.plan({ matches: [page()], trigger: "initial", revalidate: false, current: place, next: place })
	expect(quiet.fetch).toBe(false)
})

function shouldRefetch(): never {
	throw new Error("refetch boom")
}

// A throwing shouldRefetch is the app's bug: it is reported and counts as no answer, so the plan, and the hydrate that
// asks it first, go on. With no reporter it is logged (plan 21 9.3, BUGS.md 203).
it("should refetch throws", () => {
	const reported: unknown[] = []
	const cache = createMatchCache({ staleTime: 1000, gcTime: 60_000, report: (error) => reported.push(error) })
	cache.store(page(), { data: "user", deferred: false })
	const hydrate = cache.plan({
		matches: [page({ shouldRefetch })],
		trigger: "initial",
		revalidate: false,
		current: place,
		next: place,
	})
	expect(hydrate.fetch).toBe(false)
	expect(reported).toEqual([new Error("refetch boom")])
	const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const quiet = createMatchCache({ staleTime: 1000, gcTime: 60_000 })
	quiet.plan({ matches: [page({ shouldRefetch })], trigger: "initial", revalidate: false, current: place, next: place })
	expect(errors).toHaveBeenCalledExactlyOnceWith("[flare] a page's shouldRefetch threw", expect.any(Error))
	errors.mockRestore()
})

it("deferred placeholder", () => {
	const { cache } = cacheAt()
	cache.store(page(), { data: { slow: { __deferred: true, key: "d0" } }, deferred: true })
	expect(plan(cache, [page()]).stale).toEqual([])
	expect(plan(cache, [page(undefined, { client: { cacheDeferred: true } })]).stale).toEqual([])
})

// `cacheDeferred: true` reuses an entry only once its deferred values settle. The entry then counts as filled, on its
// first clock, and the revisit paints the values with no request (dx/cache.md, B19).
it("deferred filled cached", async () => {
	const { cache, time } = cacheAt({ staleTime: 60_000 })
	const slots: Pending = new Map()
	const data = revive({ title: "t", slow: { __deferred: true, key: "d0" } }, "_root_/users/[id]", slots)
	const deferring = page(undefined, { client: { cacheDeferred: true } })
	remember(cache, [deferring], { data: { "_root_/users/[id]": data }, heads: {} })
	expect(plan(cache, [deferring])).toEqual({ fetch: true, stale: [], fresh: false, held: false })
	time.at(500)
	slots.get("_root_/users/[id]\nd0")?.resolve("filled")
	await Promise.resolve()
	await Promise.resolve()
	expect(cache.read(deferring)?.deferred).toBe(false)
	expect(plan(cache, [deferring])).toEqual({ fetch: true, stale: ["id=7&"], fresh: true, held: true })
	time.at(60_001)
	expect(plan(cache, [deferring]).fresh).toBe(false)
	expect(await Reflect.get(Object(Reflect.get(Object(cache.read(deferring)?.data), "slow")), "promise")).toBe("filled")
	const raw = page(undefined, { id: "raw", client: { cacheDeferred: true } })
	remember(cache, [raw], { data: { "_root_/users/[id]": [{ __deferred: true, key: "d1" }] }, heads: {} })
	await Promise.resolve()
	expect(cache.read(raw)?.deferred).toBe(true)
	// An entry evicted before its values settle stays gone.
	const gone = page(undefined, { id: "gone", client: { cacheDeferred: true } })
	const later = revive({ __deferred: true, key: "d2" }, "_root_/users/[id]", slots)
	remember(cache, [gone], { data: { "_root_/users/[id]": later }, heads: {} })
	cache.evict(gone)
	slots.get("_root_/users/[id]\nd2")?.resolve("late")
	await Promise.resolve()
	await Promise.resolve()
	expect(cache.read(gone)).toBeUndefined()
})

it("cap", () => {
	const { cache } = cacheAt()
	for (let index = 0; index <= 100; index += 1) {
		cache.store(page(undefined, { id: `id=${index}&` }), { data: index, deferred: false })
		if (index === 50) cache.read(page(undefined, { id: "id=0&" }))
	}
	expect(cache.read(page(undefined, { id: "id=0&" }))?.data).toBe(0)
	expect(cache.read(page(undefined, { id: "id=1&" }))).toBeUndefined()
	expect(cache.read(page(undefined, { id: "id=100&" }))?.data).toBe(100)
})

it("revalidate", () => {
	const { cache } = cacheAt()
	cache.store(page(), { data: "user", deferred: false })
	expect(plan(cache, [page()], { revalidate: true })).toEqual({ fetch: true, stale: [], fresh: false, held: false })
	const trigger = vi.fn<NonNullable<Effects["shouldRefetch"]>>(() => false)
	plan(cache, [page({ shouldRefetch: trigger })], { trigger: "revalidation" })
	expect(trigger).toHaveBeenCalledWith(expect.objectContaining({ trigger: "revalidation" }))
})

it("stale list", () => {
	const { cache } = cacheAt()
	cache.store(layout, { data: "root", deferred: false })
	cache.store(page(), { data: "user", deferred: false })
	expect(plan(cache, [layout, page()])).toEqual({ fetch: true, stale: ["id=7&"], fresh: true, held: true })
	expect(plan(cache, [layout, page({ shouldRefetch: () => true })]).stale).toEqual([])
	expect(plan(cache, [layout]).stale).toEqual([])
})

it("route clock", () => {
	const { cache, time } = cacheAt({ staleTime: 0, gcTime: 60_000 })
	const landing = { data: { "_root_/users/[id]": "user" }, heads: {} }
	remember(cache, [page(undefined, { client: { staleTime: "1m", gcTime: "2m" } })], landing)
	time.at(59_000)
	expect(plan(cache, [page()]).stale).toEqual(["id=7&"])
	time.at(180_000)
	expect(cache.read(page())).toBeUndefined()
	remember(cache, [page(undefined, { client: false })], landing)
	expect(cache.read(page())).toBeUndefined()
	remember(cache, [page(undefined, { client: {} })], landing)
	expect(cache.read(page())?.data).toBe("user")
})

it("router cache", () => {
	const landing = { data: { "_root_/users/[id]": "user" }, heads: {} }
	const off = cacheFor(false, 100)
	remember(off, [page()], landing)
	expect(off.read(page())).toBeUndefined()
	const on = cacheFor({ staleTime: 60_000, gcTime: "5m" }, 100)
	remember(on, [page()], landing)
	expect(plan(on, [page()]).stale).toEqual(["id=7&"])
})

it("cached client", () => {
	const page = { cache: { client: { cacheDeferred: true } } }
	const match = {
		params: {},
		client: { staleTime: "1m" },
		chain: [
			{ id: "_root_", kind: "layout" as const, module: page },
			{ id: "_root_/", kind: "page" as const, module: {} },
		],
	}
	const cached = cachedMatches(match, { pathname: "/", search: "", hash: "" })
	expect(cached.map((entry) => entry.client)).toEqual([{ cacheDeferred: true }, { staleTime: "1m" }])
})

// `clear` drops every entry: what a cookie written by a server function, or `invalidate()`, asks for (B133).
it("clear", () => {
	const { cache } = cacheAt()
	cache.store(page(), { data: "user", deferred: false })
	cache.store(layout, { data: "shell", deferred: false })
	cache.clear()
	expect([cache.read(page()), cache.read(layout)]).toEqual([undefined, undefined])
	cache.store(page(), { data: "next", deferred: false })
	expect(cache.read(page())?.data).toBe("next")
})

// A Back or Forward step holds every match the cache keeps at any age, so it paints them at once; it is still not
// fresh, so the step then revalidates. A missing match, a page whose shouldRefetch asks, an unfilled deferred entry,
// and `revalidate` hold nothing, and neither does a step that is not a pop (B137).
it("pop held", () => {
	const { cache, time } = cacheAt({ staleTime: 1000 })
	cache.store(layout, { data: "root", deferred: false })
	cache.store(page(), { data: "user", deferred: false })
	time.at(5000)
	expect(plan(cache, [layout, page()], { pop: true })).toEqual({ fetch: true, stale: [], fresh: false, held: true })
	expect(plan(cache, [layout, page()]).held).toBe(false)
	expect(plan(cache, [layout, page()], { pop: true, revalidate: true }).held).toBe(false)
	const asks = page({ shouldRefetch: () => true })
	expect(plan(cache, [layout, asks], { pop: true }).held).toBe(false)
	const other = page(undefined, { id: "id=8&" })
	expect(plan(cache, [layout, other], { pop: true }).held).toBe(false)
	cache.store(page(), { data: "user", deferred: true })
	expect(plan(cache, [layout, page()], { pop: true }).held).toBe(false)
})
