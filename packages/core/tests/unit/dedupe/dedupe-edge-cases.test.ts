import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { disableFetchDedupe, enableFetchDedupe, isFetchDedupeEnabled } from "../../../src/dedupe/index.ts"

/* ── fetch dedupe reference counting ───────────────────────────────── */

describe("fetch dedupe reference counting", () => {
	afterEach(() => {
		/* reset to clean state */
		while (isFetchDedupeEnabled()) {
			disableFetchDedupe()
		}
	})

	it("initially disabled", () => {
		expect(isFetchDedupeEnabled()).toBe(false)
	})

	it("enable → enabled", () => {
		enableFetchDedupe()
		expect(isFetchDedupeEnabled()).toBe(true)
		disableFetchDedupe()
	})

	it("enable twice, disable once → still enabled", () => {
		enableFetchDedupe()
		enableFetchDedupe()
		disableFetchDedupe()
		expect(isFetchDedupeEnabled()).toBe(true)
		disableFetchDedupe()
	})

	it("enable twice, disable twice → disabled", () => {
		enableFetchDedupe()
		enableFetchDedupe()
		disableFetchDedupe()
		disableFetchDedupe()
		expect(isFetchDedupeEnabled()).toBe(false)
	})

	it("extra disable calls clamped to 0 (no negative)", () => {
		disableFetchDedupe()
		disableFetchDedupe()
		disableFetchDedupe()
		expect(isFetchDedupeEnabled()).toBe(false)
		/* subsequent enable should work normally */
		enableFetchDedupe()
		expect(isFetchDedupeEnabled()).toBe(true)
		disableFetchDedupe()
	})

	it("enable-disable-enable cycle restores dedupe", () => {
		enableFetchDedupe()
		disableFetchDedupe()
		expect(isFetchDedupeEnabled()).toBe(false)
		enableFetchDedupe()
		expect(isFetchDedupeEnabled()).toBe(true)
		disableFetchDedupe()
	})
})

/* ── getFetchCacheKey testing via dedupe behavior ──────────────────── */

/* Note: getFetchCacheKey is not exported, but we can test its behavior
   indirectly through enableFetchDedupe's patched fetch */

describe("fetch dedupe method filtering (via patched fetch)", () => {
	let originalFetch: typeof globalThis.fetch

	beforeEach(() => {
		originalFetch = globalThis.fetch
	})

	afterEach(() => {
		while (isFetchDedupeEnabled()) {
			disableFetchDedupe()
		}
		globalThis.fetch = originalFetch
	})

	it("enable patches globalThis.fetch", () => {
		const before = globalThis.fetch
		enableFetchDedupe()
		expect(globalThis.fetch).not.toBe(before)
		disableFetchDedupe()
	})

	it("disable restores original fetch", () => {
		const before = globalThis.fetch
		enableFetchDedupe()
		disableFetchDedupe()
		expect(globalThis.fetch).toBe(before)
	})
})
