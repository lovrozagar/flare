import { describe, expect, it } from "vitest"
import {
	createRegistry,
	dk,
	getRegisteredRegistries,
	registerRegistry,
	scanStringsForPreload,
	withRegistryTracking,
} from "../../../src/registry/index.ts"

function mockLazy(name: string) {
	let preloaded = false
	return {
		isPreloaded() {
			return preloaded
		},
		name,
		preload() {
			preloaded = true
			return Promise.resolve()
		},
	}
}

describe("createRegistry", () => {
	it("get(existing key) → returns lazy component", () => {
		const hero = mockLazy("hero")
		const reg = createRegistry({ hero })
		expect(reg.get("hero")).toBe(hero)
	})

	it("get(missing key) → returns undefined", () => {
		const reg = createRegistry({ hero: mockLazy("hero") })
		expect(reg.get("missing")).toBeUndefined()
	})

	it("keys() → returns all registered keys", () => {
		const reg = createRegistry({
			a: mockLazy("a"),
			b: mockLazy("b"),
			c: mockLazy("c"),
		})
		expect(reg.keys().sort()).toEqual(["a", "b", "c"])
	})
})

describe("withRegistryTracking", () => {
	it("wraps function execution in tracking context", () => {
		const reg = createRegistry({ hero: mockLazy("hero") })
		const { result } = withRegistryTracking(() => {
			reg.get("hero")
			return "done"
		})
		expect(result).toBe("done")
	})

	it("dk() after execution → returns accessed keys", () => {
		const reg = createRegistry({
			a: mockLazy("a"),
			b: mockLazy("b"),
		})
		const { dk: getDk } = withRegistryTracking(() => {
			reg.get("a")
			reg.get("b")
		})
		expect(getDk().sort()).toEqual(["a", "b"])
	})

	it("no registry access → dk() returns []", () => {
		const { dk: getDk } = withRegistryTracking(() => {})
		expect(getDk()).toEqual([])
	})

	it("duplicate gets → deduplicated in dk()", () => {
		const reg = createRegistry({ a: mockLazy("a") })
		const { dk: getDk } = withRegistryTracking(() => {
			reg.get("a")
			reg.get("a")
			reg.get("a")
		})
		expect(getDk()).toEqual(["a"])
	})
})

describe("dk", () => {
	it("inside tracking context → returns tracked keys", () => {
		const reg = createRegistry({ x: mockLazy("x") })
		withRegistryTracking(() => {
			reg.get("x")
			expect(dk()).toEqual(["x"])
		})
	})

	it("outside tracking context → returns []", () => {
		expect(dk()).toEqual([])
	})
})

describe("registerRegistry + getRegisteredRegistries", () => {
	it("adds registry to global list", () => {
		const reg = createRegistry({ a: mockLazy("a") })
		const before = getRegisteredRegistries().length
		registerRegistry(reg)
		expect(getRegisteredRegistries().length).toBe(before + 1)
	})

	it("multiple registries registered → all in list", () => {
		const r1 = createRegistry({ a: mockLazy("a") })
		const r2 = createRegistry({ b: mockLazy("b") })
		registerRegistry(r1)
		registerRegistry(r2)
		const all = getRegisteredRegistries()
		expect(all).toContain(r1)
		expect(all).toContain(r2)
	})
})

describe("scanStringsForPreload", () => {
	it("string matching registry key → preload pushed", () => {
		const hero = mockLazy("hero")
		const reg = createRegistry({ hero })
		const preloads: Promise<unknown>[] = []
		scanStringsForPreload("hero", [reg], preloads)
		expect(preloads).toHaveLength(1)
		expect(hero.isPreloaded()).toBe(true)
	})

	it("string not matching → ignored", () => {
		const reg = createRegistry({ hero: mockLazy("hero") })
		const preloads: Promise<unknown>[] = []
		scanStringsForPreload("unknown", [reg], preloads)
		expect(preloads).toHaveLength(0)
	})

	it("nested object with key strings → all found", () => {
		const hero = mockLazy("hero")
		const card = mockLazy("card")
		const reg = createRegistry({ card, hero })
		const preloads: Promise<unknown>[] = []
		scanStringsForPreload({ a: { b: "hero" }, c: "card" }, [reg], preloads)
		expect(preloads).toHaveLength(2)
	})

	it("array with key strings → all found", () => {
		const a = mockLazy("a")
		const b = mockLazy("b")
		const reg = createRegistry({ a, b })
		const preloads: Promise<unknown>[] = []
		scanStringsForPreload(["a", "b"], [reg], preloads)
		expect(preloads).toHaveLength(2)
	})

	it("non-string values → skipped", () => {
		const reg = createRegistry({ a: mockLazy("a") })
		const preloads: Promise<unknown>[] = []
		scanStringsForPreload({ bool: true, n: 42, nil: null }, [reg], preloads)
		expect(preloads).toHaveLength(0)
	})

	it("empty data → no preloads", () => {
		const reg = createRegistry({ a: mockLazy("a") })
		const preloads: Promise<unknown>[] = []
		scanStringsForPreload(null, [reg], preloads)
		expect(preloads).toHaveLength(0)
		scanStringsForPreload(undefined, [reg], preloads)
		expect(preloads).toHaveLength(0)
	})

	it("multiple registries → all scanned", () => {
		const a = mockLazy("a")
		const b = mockLazy("b")
		const r1 = createRegistry({ a })
		const r2 = createRegistry({ b })
		const preloads: Promise<unknown>[] = []
		scanStringsForPreload(["a", "b"], [r1, r2], preloads)
		expect(preloads).toHaveLength(2)
		expect(a.isPreloaded()).toBe(true)
		expect(b.isPreloaded()).toBe(true)
	})
})
