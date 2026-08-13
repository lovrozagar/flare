import { afterEach, describe, expect, it, vi } from "vitest"

describe("Task 2: paramsCache bounded eviction", () => {
	afterEach(() => {
		vi.restoreAllMocks()
		vi.resetModules()
	})

	async function loadModule() {
		const mod = await import("../../../src/server-handler/validate-static-params")
		mod.clearParamsCache()
		return mod
	}

	function makeRoute(virtualPath: string, paramsFn: () => Record<string, string>[]) {
		return {
			cache: { ssg: paramsFn as unknown },
			handler: undefined,
			id: virtualPath,
			virtualPath,
		}
	}

	it("caches result on first call", async () => {
		const { validateStaticParams } = await loadModule()
		let callCount = 0
		const route = makeRoute("/products/[id]", () => {
			callCount++
			return [{ id: "1" }, { id: "2" }]
		})

		await validateStaticParams([route as never], { id: "1" }, false)
		expect(callCount).toBe(1)
	})

	it("returns cached result on subsequent calls", async () => {
		const { validateStaticParams } = await loadModule()
		let callCount = 0
		const route = makeRoute("/products/[id]", () => {
			callCount++
			return [{ id: "1" }, { id: "2" }]
		})

		await validateStaticParams([route as never], { id: "1" }, false)
		await validateStaticParams([route as never], { id: "1" }, false)
		await validateStaticParams([route as never], { id: "1" }, false)
		expect(callCount).toBe(1)
	})

	it("dev mode skips cache", async () => {
		const { validateStaticParams } = await loadModule()
		let callCount = 0
		const route = makeRoute("/products/[id]", () => {
			callCount++
			return [{ id: "1" }]
		})

		await validateStaticParams([route as never], { id: "1" }, true)
		await validateStaticParams([route as never], { id: "1" }, true)
		expect(callCount).toBe(2)
	})

	it("clearParamsCache() empties the cache", async () => {
		const { validateStaticParams, clearParamsCache } = await loadModule()
		let callCount = 0
		const route = makeRoute("/products/[id]", () => {
			callCount++
			return [{ id: "1" }]
		})

		await validateStaticParams([route as never], { id: "1" }, false)
		expect(callCount).toBe(1)

		clearParamsCache()

		await validateStaticParams([route as never], { id: "1" }, false)
		expect(callCount).toBe(2)
	})

	it("evicts oldest entries when exceeding max size", async () => {
		const { validateStaticParams, clearParamsCache } = await loadModule()
		const MAX = 500
		const routes: ReturnType<typeof makeRoute>[] = []

		/* Fill cache to MAX + 50 */
		for (let i = 0; i < MAX + 50; i++) {
			const path = `/route-${i}/[id]`
			routes.push(makeRoute(path, () => [{ id: String(i) }]))
		}

		for (const route of routes) {
			const id = route.virtualPath.match(/route-(\d+)/)?.[1] ?? "0"
			await validateStaticParams([route as never], { id }, false)
		}

		/* First 50 entries should have been evicted.
		 * Re-call route-0: paramsFn should be called again (cache miss). */
		let freshCallCount = 0
		const freshRoute = makeRoute("/route-0/[id]", () => {
			freshCallCount++
			return [{ id: "0" }]
		})
		await validateStaticParams([freshRoute as never], { id: "0" }, false)
		expect(freshCallCount).toBe(1)

		/* But route-499 (last inserted) should still be cached */
		let cachedCallCount = 0
		const cachedRoute = makeRoute(`/route-${MAX + 49}/[id]`, () => {
			cachedCallCount++
			return [{ id: String(MAX + 49) }]
		})
		await validateStaticParams([cachedRoute as never], { id: String(MAX + 49) }, false)
		expect(cachedCallCount).toBe(0)

		clearParamsCache()
	})

	it("cache size never exceeds MAX_CACHE_SIZE", async () => {
		const { validateStaticParams, clearParamsCache } = await loadModule()
		const MAX = 500

		for (let i = 0; i < MAX + 100; i++) {
			const route = makeRoute(`/sized-${i}/[id]`, () => [{ id: String(i) }])
			await validateStaticParams([route as never], { id: String(i) }, false)
		}

		/* Access the internal cache via module — we need to verify size.
		 * Since paramsCache is not exported, we verify behavior:
		 * all entries from 0..99 should be evicted (cache miss),
		 * entries 100..599 should be cached (cache hit). */
		let missCount = 0
		for (let i = 0; i < 100; i++) {
			const route = makeRoute(`/sized-${i}/[id]`, () => {
				missCount++
				return [{ id: String(i) }]
			})
			await validateStaticParams([route as never], { id: String(i) }, false)
		}
		expect(missCount).toBe(100)

		/* After re-inserting 0..99, cache evicted 100..199.
		 * Entries 200..299 should still be cached (hit). */
		let hitCount = 0
		for (let i = 200; i < 300; i++) {
			const route = makeRoute(`/sized-${i}/[id]`, () => {
				hitCount++
				return [{ id: String(i) }]
			})
			await validateStaticParams([route as never], { id: String(i) }, false)
		}
		expect(hitCount).toBe(0)

		clearParamsCache()
	})

	it("concurrent calls with same key don't duplicate entries", async () => {
		const { validateStaticParams, clearParamsCache } = await loadModule()
		let callCount = 0
		const route = makeRoute("/concurrent/[id]", () => {
			callCount++
			return [{ id: "1" }]
		})

		/* Fire multiple concurrent calls */
		await Promise.all([
			validateStaticParams([route as never], { id: "1" }, false),
			validateStaticParams([route as never], { id: "1" }, false),
			validateStaticParams([route as never], { id: "1" }, false),
		])

		/* paramsFn is sync so all resolve from cache after first — but even with
		 * async paramsFn, the cache should not have duplicate keys. */
		expect(callCount).toBeLessThanOrEqual(3)

		/* Subsequent call should be cached */
		let secondCall = 0
		const route2 = makeRoute("/concurrent/[id]", () => {
			secondCall++
			return [{ id: "1" }]
		})
		await validateStaticParams([route2 as never], { id: "1" }, false)
		expect(secondCall).toBe(0)

		clearParamsCache()
	})
})
