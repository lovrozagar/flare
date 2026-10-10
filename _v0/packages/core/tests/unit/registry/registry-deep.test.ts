import { describe, expect, it } from "vitest";
import {
	createRegistry,
	dk,
	getRegisteredRegistries,
	registerRegistry,
	scanStringsForPreload,
	withRegistryTracking,
} from "../../../src/registry/index.ts";

function mockLazy(name: string) {
	let preloaded = false;
	return {
		isPreloaded() {
			return preloaded;
		},
		name,
		preload() {
			preloaded = true;
			return Promise.resolve();
		},
	};
}

/* ── Proxy edge cases ── */

describe("Proxy edge cases", () => {
	it("get(keys) NOT tracked — explicit exclusion", () => {
		const reg = createRegistry({ hero: mockLazy("hero") });
		const { dk: getDk } = withRegistryTracking(() => {
			reg.keys();
			/* "keys" should not appear in tracking */
		});
		expect(getDk()).toEqual([]);
	});

	it("symbol property access not tracked (only string props)", () => {
		const hero = mockLazy("hero");
		const components = { hero };
		const reg = createRegistry(components);
		const sym = Symbol("test");
		const { dk: getDk } = withRegistryTracking(() => {
			/* Access underlying object via registry get — symbols won't be tracked */
			const _val = Reflect.get(reg, sym);
		});
		expect(getDk()).toEqual([]);
	});

	it("get outside tracking context → no error, returns component", () => {
		const hero = mockLazy("hero");
		const reg = createRegistry({ hero });
		/* Outside withRegistryTracking — should not throw */
		const result = reg.get("hero");
		expect(result).toBe(hero);
	});

	it("keys() reads from original object, not affected by Proxy tracking", () => {
		const reg = createRegistry({
			a: mockLazy("a"),
			b: mockLazy("b"),
		});
		const { dk: getDk } = withRegistryTracking(() => {
			const keys = reg.keys();
			expect(keys.sort()).toEqual(["a", "b"]);
		});
		/* keys() call should not track anything */
		expect(getDk()).toEqual([]);
	});
});

/* ── scanStringsForPreload deep ── */

describe("scanStringsForPreload deep", () => {
	it("deeply nested (5 levels) → all strings found", () => {
		const hero = mockLazy("hero");
		const reg = createRegistry({ hero });
		const preloads: Promise<unknown>[] = [];
		scanStringsForPreload({ a: { b: { c: { d: { e: "hero" } } } } }, [reg], preloads);
		expect(preloads).toHaveLength(1);
		expect(hero.isPreloaded()).toBe(true);
	});

	it("mixed arrays + objects → all traversed", () => {
		const a = mockLazy("a");
		const b = mockLazy("b");
		const c = mockLazy("c");
		const reg = createRegistry({ a, b, c });
		const preloads: Promise<unknown>[] = [];
		scanStringsForPreload({ items: ["a", { nested: ["b"] }], top: "c" }, [reg], preloads);
		expect(preloads).toHaveLength(3);
	});

	it("same key appears multiple times → preload called per occurrence", () => {
		const hero = mockLazy("hero");
		const reg = createRegistry({ hero });
		const preloads: Promise<unknown>[] = [];
		scanStringsForPreload(["hero", "hero", "hero"], [reg], preloads);
		/* Each occurrence triggers a preload push */
		expect(preloads).toHaveLength(3);
	});

	it("same key in multiple registries → preload called once per registry", () => {
		const hero1 = mockLazy("hero");
		const hero2 = mockLazy("hero");
		const r1 = createRegistry({ hero: hero1 });
		const r2 = createRegistry({ hero: hero2 });
		const preloads: Promise<unknown>[] = [];
		scanStringsForPreload("hero", [r1, r2], preloads);
		expect(preloads).toHaveLength(2);
		expect(hero1.isPreloaded()).toBe(true);
		expect(hero2.isPreloaded()).toBe(true);
	});

	it("empty string → checked against registry (no special case)", () => {
		const empty = mockLazy("");
		const reg = createRegistry({ "": empty });
		const preloads: Promise<unknown>[] = [];
		scanStringsForPreload("", [reg], preloads);
		expect(preloads).toHaveLength(1);
	});

	it("number values in object → skipped without error", () => {
		const reg = createRegistry({ a: mockLazy("a") });
		const preloads: Promise<unknown>[] = [];
		scanStringsForPreload({ nested: { deep: 0 }, num: 42 }, [reg], preloads);
		expect(preloads).toHaveLength(0);
	});

	it("boolean values in object → skipped without error", () => {
		const reg = createRegistry({ a: mockLazy("a") });
		const preloads: Promise<unknown>[] = [];
		scanStringsForPreload({ flag: true, other: false }, [reg], preloads);
		expect(preloads).toHaveLength(0);
	});
});

/* ── withRegistryTracking edge cases ── */

describe("withRegistryTracking edge cases", () => {
	it("nested withRegistryTracking → inner gets own tracking set", () => {
		const reg = createRegistry({
			a: mockLazy("a"),
			b: mockLazy("b"),
		});
		const { dk: outerDk } = withRegistryTracking(() => {
			reg.get("a");
			const { dk: innerDk } = withRegistryTracking(() => {
				reg.get("b");
			});
			/* Inner should only see "b" */
			expect(innerDk()).toEqual(["b"]);
		});
		/* Outer should only see "a" since inner has its own context */
		expect(outerDk()).toEqual(["a"]);
	});

	it("tracking context with async function → ALS maintains context", async () => {
		const reg = createRegistry({ hero: mockLazy("hero") });
		const { dk: getDk, result } = withRegistryTracking(() => {
			reg.get("hero");
			return "sync-result";
		});
		expect(result).toBe("sync-result");
		expect(getDk()).toEqual(["hero"]);
	});

	it("fn throws → tracking still captured before throw", () => {
		const reg = createRegistry({ a: mockLazy("a") });
		expect(() =>
			withRegistryTracking(() => {
				reg.get("a");
				throw new Error("test error");
			}),
		).toThrow("test error");
	});
});

/* ── Module-level state ── */

describe("module-level state", () => {
	it("registries array accumulates across calls", () => {
		const before = getRegisteredRegistries().length;
		const r1 = createRegistry({ x: mockLazy("x") });
		registerRegistry(r1);
		expect(getRegisteredRegistries().length).toBe(before + 1);

		const r2 = createRegistry({ y: mockLazy("y") });
		registerRegistry(r2);
		expect(getRegisteredRegistries().length).toBe(before + 2);
	});

	it("dk() called multiple times in same context → same result", () => {
		const reg = createRegistry({ a: mockLazy("a") });
		withRegistryTracking(() => {
			reg.get("a");
			const first = dk();
			const second = dk();
			expect(first).toEqual(second);
			expect(first).toEqual(["a"]);
		});
	});

	it("withRegistryTracking result dk() returns snapshot (immutable via Set→Array)", () => {
		const reg = createRegistry({
			a: mockLazy("a"),
			b: mockLazy("b"),
		});
		const { dk: getDk } = withRegistryTracking(() => {
			reg.get("a");
			reg.get("b");
		});
		const snapshot1 = getDk();
		const snapshot2 = getDk();
		/* Each call returns a new array (from Set→Array) */
		expect(snapshot1).not.toBe(snapshot2);
		expect(snapshot1.sort()).toEqual(snapshot2.sort());
	});
});
