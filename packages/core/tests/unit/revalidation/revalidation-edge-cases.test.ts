import { describe, expect, it, vi } from "vitest"
import type { CdnPurgeAdapter } from "../../../src/revalidation/index.ts"
import { createRevalidateFn } from "../../../src/revalidation/index.ts"

function makeStore(overrides?: Record<string, unknown>) {
	return {
		delete: vi.fn(async () => {}),
		deleteByTags: vi.fn(async () => {}),
		get: vi.fn(async () => null),
		set: vi.fn(async () => {}),
		...overrides,
	}
}

function makeCdn(overrides?: Partial<CdnPurgeAdapter>): CdnPurgeAdapter {
	return {
		purgeByTags: vi.fn(async () => {}),
		...overrides,
	}
}

/* ── missing adapter errors ────────────────────────────────────────── */

describe("revalidation missing adapter errors", () => {
	it("ssr tier without store → throws", async () => {
		const fn = createRevalidateFn({})
		await expect(fn({ tags: ["a"], tiers: ["ssr"] })).rejects.toThrow(/ssr.*not configured/i)
	})

	it("cdn tier without cdnPurgeAdapter → throws", async () => {
		const fn = createRevalidateFn({})
		await expect(fn({ tags: ["a"], tiers: ["cdn"] })).rejects.toThrow(
			"Revalidation tier 'cdn' not configured",
		)
	})
})

/* ── no-op scenarios ───────────────────────────────────────────────── */

describe("revalidation no-op scenarios", () => {
	it("empty tiers → no calls", async () => {
		const store = makeStore()
		const fn = createRevalidateFn({ store })
		await fn({ tiers: [] })
		expect(store.deleteByTags).not.toHaveBeenCalled()
		expect(store.delete).not.toHaveBeenCalled()
	})

	it("no tags and no keys → no calls (ssr tier)", async () => {
		const store = makeStore()
		const fn = createRevalidateFn({ store })
		await fn({ tiers: ["ssr"] })
		expect(store.deleteByTags).not.toHaveBeenCalled()
		expect(store.delete).not.toHaveBeenCalled()
	})

	it("empty tags array → no call", async () => {
		const store = makeStore()
		const fn = createRevalidateFn({ store })
		await fn({ tags: [], tiers: ["ssr"] })
		expect(store.deleteByTags).not.toHaveBeenCalled()
	})

	it("empty keys array → no call", async () => {
		const store = makeStore()
		const fn = createRevalidateFn({ store })
		await fn({ keys: [], tiers: ["ssr"] })
		expect(store.delete).not.toHaveBeenCalled()
	})
})

/* ── ssr tier ──────────────────────────────────────────────────────── */

describe("revalidation ssr tier", () => {
	it("tags → calls deleteByTags", async () => {
		const store = makeStore()
		const fn = createRevalidateFn({ store })
		await fn({ tags: ["user", "post"], tiers: ["ssr"] })
		expect(store.deleteByTags).toHaveBeenCalledWith(["user", "post"], undefined)
	})

	it("keys with deleteByKeys → calls deleteByKeys", async () => {
		const deleteByKeys = vi.fn(async () => {})
		const store = makeStore({ deleteByKeys })
		const fn = createRevalidateFn({ store })
		await fn({ keys: ["k1", "k2"], tiers: ["ssr"] })
		expect(deleteByKeys).toHaveBeenCalledWith(["k1", "k2"], undefined)
	})

	it("keys without deleteByKeys → falls back to individual delete()", async () => {
		const store = makeStore()
		const fn = createRevalidateFn({ store })
		await fn({ keys: ["k1", "k2", "k3"], tiers: ["ssr"] })
		expect(store.delete).toHaveBeenCalledTimes(3)
		expect(store.delete).toHaveBeenCalledWith("k1")
		expect(store.delete).toHaveBeenCalledWith("k2")
		expect(store.delete).toHaveBeenCalledWith("k3")
	})

	it("both tags and keys → both called", async () => {
		const store = makeStore()
		const fn = createRevalidateFn({ store })
		await fn({ keys: ["k1"], tags: ["t1"], tiers: ["ssr"] })
		expect(store.deleteByTags).toHaveBeenCalled()
		expect(store.delete).toHaveBeenCalled()
	})
})

/* ── cdn tier ──────────────────────────────────────────────────────── */

describe("revalidation cdn tier", () => {
	it("tags → calls purgeByTags", async () => {
		const cdn = makeCdn()
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn })
		await fn({ tags: ["page"], tiers: ["cdn"] })
		expect(cdn.purgeByTags).toHaveBeenCalledWith(["page"], undefined)
	})

	it("keys with purgeByKeys → calls purgeByKeys", async () => {
		const purgeByKeys = vi.fn(async () => {})
		const cdn = makeCdn({ purgeByKeys })
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn })
		await fn({ keys: ["k1"], tiers: ["cdn"] })
		expect(purgeByKeys).toHaveBeenCalledWith(["k1"], undefined)
	})

	it("keys without purgeByKeys → silently ignored", async () => {
		const cdn = makeCdn()
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn })
		/* should not throw */
		await fn({ keys: ["k1"], tiers: ["cdn"] })
	})
})

/* ── callerData propagation ────────────────────────────────────────── */

describe("revalidation callerData propagation", () => {
	it("callerData passed to store.deleteByTags", async () => {
		const store = makeStore()
		const fn = createRevalidateFn({ store })
		await fn({ callerData: { userId: "42" }, tags: ["user"], tiers: ["ssr"] })
		expect(store.deleteByTags).toHaveBeenCalledWith(["user"], { userId: "42" })
	})

	it("callerData passed to store.deleteByKeys", async () => {
		const deleteByKeys = vi.fn(async () => {})
		const store = makeStore({ deleteByKeys })
		const fn = createRevalidateFn({ store })
		await fn({ callerData: { req: "ctx" }, keys: ["k1"], tiers: ["ssr"] })
		expect(deleteByKeys).toHaveBeenCalledWith(["k1"], { req: "ctx" })
	})

	it("callerData passed to cdn.purgeByTags", async () => {
		const cdn = makeCdn()
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn })
		await fn({ callerData: "meta", tags: ["x"], tiers: ["cdn"] })
		expect(cdn.purgeByTags).toHaveBeenCalledWith(["x"], "meta")
	})
})

/* ── multi-tier parallel execution ─────────────────────────────────── */

describe("revalidation multi-tier parallel", () => {
	it("both tiers called in parallel", async () => {
		const store = makeStore()
		const cdn = makeCdn()
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn, store })

		await fn({ tags: ["x"], tiers: ["ssr", "cdn"] })
		expect(store.deleteByTags).toHaveBeenCalled()
		expect(cdn.purgeByTags).toHaveBeenCalled()
	})

	it("duplicate tiers → duplicate calls", async () => {
		const store = makeStore()
		const fn = createRevalidateFn({ store })
		await fn({ tags: ["x"], tiers: ["ssr", "ssr"] })
		expect(store.deleteByTags).toHaveBeenCalledTimes(2)
	})
})

/* ── adapter error propagation ─────────────────────────────────────── */

describe("revalidation adapter error propagation", () => {
	it("store adapter error propagates", async () => {
		const store = makeStore({
			deleteByTags: vi.fn(async () => {
				throw new Error("store fail")
			}),
		})
		const fn = createRevalidateFn({ store })
		await expect(fn({ tags: ["x"], tiers: ["ssr"] })).rejects.toThrow("store fail")
	})

	it("cdn adapter error propagates", async () => {
		const cdn = makeCdn({
			purgeByTags: vi.fn(async () => {
				throw new Error("cdn fail")
			}),
		})
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn })
		await expect(fn({ tags: ["x"], tiers: ["cdn"] })).rejects.toThrow("cdn fail")
	})
})
