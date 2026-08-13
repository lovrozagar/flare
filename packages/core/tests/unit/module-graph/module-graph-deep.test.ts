import { describe, expect, it } from "vitest"
import {
	findEntryKey,
	mergePreloads,
	resolveModulePreloads,
	resolveRoutePreloads,
	type ViteManifest,
} from "../../../src/module-graph/index.ts"

/* ── 4.1 Graph traversal edge cases ──────────────────────────────────── */

describe("graph traversal edge cases", () => {
	it("diamond dependency (A→B, A→C, B→D, C→D) → D appears once", () => {
		const manifest: ViteManifest = {
			A: { file: "a.js", imports: ["B", "C"], isEntry: true },
			B: { file: "b.js", imports: ["D"] },
			C: { file: "c.js", imports: ["D"] },
			D: { file: "d.js" },
		}
		const result = resolveModulePreloads(manifest, "A")
		const dCount = result.js.filter((p) => p === "/d.js").length
		expect(dCount).toBe(1)
		expect(result.js).toEqual(["/a.js", "/b.js", "/d.js", "/c.js"])
	})

	it("deep chain (5+ levels) → all collected", () => {
		const manifest: ViteManifest = {
			L0: { file: "l0.js", imports: ["L1"], isEntry: true },
			L1: { file: "l1.js", imports: ["L2"] },
			L2: { file: "l2.js", imports: ["L3"] },
			L3: { file: "l3.js", imports: ["L4"] },
			L4: { file: "l4.js", imports: ["L5"] },
			L5: { file: "l5.js" },
		}
		const result = resolveModulePreloads(manifest, "L0")
		expect(result.js).toHaveLength(6)
		expect(result.js).toEqual(["/l0.js", "/l1.js", "/l2.js", "/l3.js", "/l4.js", "/l5.js"])
	})

	it("route re-imports entry chunk → excluded from route preloads", () => {
		const manifest: ViteManifest = {
			"entry.tsx": {
				file: "entry.js",
				isEntry: true,
			},
			"route.tsx": {
				file: "route.js",
				imports: ["entry.tsx"],
				isDynamicEntry: true,
			},
		}
		const entryPreloads = resolveModulePreloads(manifest, "entry.tsx")
		const routePreloads = resolveRoutePreloads(manifest, ["route.tsx"], entryPreloads)
		expect(routePreloads.js).toEqual(["/route.js"])
		expect(routePreloads.js).not.toContain("/entry.js")
	})

	it("entry preloads contain ALL route chunks → returns empty", () => {
		const manifest: ViteManifest = {
			"_chunk.js": { file: "chunk.js" },
			"entry.tsx": {
				file: "entry.js",
				imports: ["_chunk.js"],
				isEntry: true,
			},
			"route.tsx": {
				file: "chunk.js",
				imports: ["_chunk.js"],
				isDynamicEntry: true,
			},
		}
		const entryPreloads = resolveModulePreloads(manifest, "entry.tsx")
		const routePreloads = resolveRoutePreloads(manifest, ["route.tsx"], entryPreloads)
		/* route.tsx file == chunk.js which is already in entry (as /chunk.js) */
		expect(routePreloads.js).toEqual([])
	})

	it("missing key in manifest → gracefully skipped", () => {
		const manifest: ViteManifest = {
			"entry.tsx": {
				file: "entry.js",
				imports: ["nonexistent"],
				isEntry: true,
			},
		}
		const result = resolveModulePreloads(manifest, "entry.tsx")
		expect(result.js).toEqual(["/entry.js"])
	})

	it("self-referencing import → no infinite loop", () => {
		const manifest: ViteManifest = {
			"self.tsx": {
				file: "self.js",
				imports: ["self.tsx"],
				isEntry: true,
			},
		}
		const result = resolveModulePreloads(manifest, "self.tsx")
		expect(result.js).toEqual(["/self.js"])
	})
})

/* ── 4.2 CSS collection ──────────────────────────────────────────────── */

describe("CSS collection", () => {
	it("entry with multiple CSS files → all collected", () => {
		const manifest: ViteManifest = {
			"entry.tsx": {
				css: ["a.css", "b.css", "c.css"],
				file: "entry.js",
				isEntry: true,
			},
		}
		const result = resolveModulePreloads(manifest, "entry.tsx")
		expect(result.css).toEqual(["/a.css", "/b.css", "/c.css"])
	})

	it("transitive CSS across chain → deduplicated", () => {
		const manifest: ViteManifest = {
			"_shared.js": {
				css: ["shared.css"],
				file: "shared.js",
			},
			"entry.tsx": {
				css: ["entry.css"],
				file: "entry.js",
				imports: ["_shared.js"],
				isEntry: true,
			},
		}
		const result = resolveModulePreloads(manifest, "entry.tsx")
		expect(result.css).toEqual(["/entry.css", "/shared.css"])
	})

	it("CSS-only preloads (no JS imports in route)", () => {
		const manifest: ViteManifest = {
			"entry.tsx": { file: "entry.js", isEntry: true },
			"route.tsx": {
				css: ["route.css"],
				file: "route.js",
				isDynamicEntry: true,
			},
		}
		const entryPreloads = resolveModulePreloads(manifest, "entry.tsx")
		const routePreloads = resolveRoutePreloads(manifest, ["route.tsx"], entryPreloads)
		expect(routePreloads.css).toEqual(["/route.css"])
		expect(routePreloads.js).toEqual(["/route.js"])
	})

	it("duplicate CSS hrefs within same entry → collected as CSS array items", () => {
		const manifest: ViteManifest = {
			"entry.tsx": {
				css: ["dup.css", "dup.css"],
				file: "entry.js",
				isEntry: true,
			},
		}
		const result = resolveModulePreloads(manifest, "entry.tsx")
		/* CSS duplication is pushed as-is since CSS array can have duplicates in manifest */
		expect(result.css.filter((c) => c === "/dup.css").length).toBeGreaterThanOrEqual(1)
	})
})

/* ── 4.3 mergePreloads ───────────────────────────────────────────────── */

describe("mergePreloads", () => {
	it("merge JS-only + CSS-only → combined", () => {
		const a = { css: [], js: ["/a.js", "/b.js"] }
		const b = { css: ["/x.css", "/y.css"], js: [] }
		const result = mergePreloads(a, b)
		expect(result.js).toEqual(["/a.js", "/b.js"])
		expect(result.css).toEqual(["/x.css", "/y.css"])
	})

	it("merge with full overlap → deduplicated", () => {
		const a = { css: ["/a.css"], js: ["/a.js"] }
		const b = { css: ["/a.css"], js: ["/a.js"] }
		const result = mergePreloads(a, b)
		expect(result.js).toEqual(["/a.js"])
		expect(result.css).toEqual(["/a.css"])
	})

	it("merge with empty preloads → other preserved", () => {
		const a = { css: ["/a.css"], js: ["/a.js"] }
		const empty = { css: [], js: [] }
		expect(mergePreloads(a, empty)).toEqual({ css: ["/a.css"], js: ["/a.js"] })
		expect(mergePreloads(empty, a)).toEqual({ css: ["/a.css"], js: ["/a.js"] })
	})

	it("order: first arg items before second arg items", () => {
		const a = { css: ["/first.css"], js: ["/first.js"] }
		const b = { css: ["/second.css"], js: ["/second.js"] }
		const result = mergePreloads(a, b)
		expect(result.js).toEqual(["/first.js", "/second.js"])
		expect(result.css).toEqual(["/first.css", "/second.css"])
	})
})

/* ── 4.4 findEntryKey edge cases ─────────────────────────────────────── */

describe("findEntryKey edge cases", () => {
	it("multiple isEntry: true → returns first found", () => {
		const manifest: ViteManifest = {
			"a.tsx": { file: "a.js", isEntry: true },
			"b.tsx": { file: "b.js", isEntry: true },
		}
		const result = findEntryKey(manifest)
		expect(result).toBeDefined()
		expect(["a.tsx", "b.tsx"]).toContain(result)
	})

	it("no entries at all → undefined", () => {
		const manifest: ViteManifest = {
			"_chunk.js": { file: "chunk.js" },
			"_shared.js": { file: "shared.js" },
		}
		expect(findEntryKey(manifest)).toBeUndefined()
	})

	it("entry with isEntry: true but also isDynamicEntry → still found", () => {
		const manifest: ViteManifest = {
			"entry.tsx": { file: "entry.js", isDynamicEntry: true, isEntry: true },
		}
		expect(findEntryKey(manifest)).toBe("entry.tsx")
	})
})

/* ── 4.5 Large manifest stress ───────────────────────────────────────── */

describe("large manifest stress", () => {
	it("100-entry manifest → correct results", () => {
		const manifest: ViteManifest = {}
		manifest["entry.tsx"] = {
			file: "entry.js",
			imports: ["chunk-0"],
			isEntry: true,
		}
		for (let i = 0; i < 100; i++) {
			const next = i < 99 ? [`chunk-${i + 1}`] : undefined
			manifest[`chunk-${i}`] = {
				css: i % 10 === 0 ? [`style-${i}.css`] : undefined,
				file: `chunk-${i}.js`,
				imports: next,
			}
		}
		const result = resolveModulePreloads(manifest, "entry.tsx")
		/* entry + 100 chunks */
		expect(result.js).toHaveLength(101)
		/* CSS every 10th chunk: 0, 10, 20, ..., 90 = 10 CSS files */
		expect(result.css).toHaveLength(10)
	})

	it("route with 20+ transitive imports → all collected", () => {
		const manifest: ViteManifest = {
			"entry.tsx": { file: "entry.js", isEntry: true },
		}
		manifest["route.tsx"] = {
			file: "route.js",
			imports: ["dep-0"],
			isDynamicEntry: true,
		}
		for (let i = 0; i < 25; i++) {
			const next = i < 24 ? [`dep-${i + 1}`] : undefined
			manifest[`dep-${i}`] = { file: `dep-${i}.js`, imports: next }
		}
		const entryPreloads = resolveModulePreloads(manifest, "entry.tsx")
		const routePreloads = resolveRoutePreloads(manifest, ["route.tsx"], entryPreloads)
		/* route + 25 deps */
		expect(routePreloads.js).toHaveLength(26)
	})

	it("10 route module IDs → each resolved independently", () => {
		const manifest: ViteManifest = {
			"entry.tsx": { file: "entry.js", isEntry: true },
		}
		const routeIds: string[] = []
		for (let i = 0; i < 10; i++) {
			const id = `route-${i}.tsx`
			routeIds.push(id)
			manifest[id] = {
				css: [`route-${i}.css`],
				file: `route-${i}.js`,
				isDynamicEntry: true,
			}
		}
		const entryPreloads = resolveModulePreloads(manifest, "entry.tsx")
		const routePreloads = resolveRoutePreloads(manifest, routeIds, entryPreloads)
		expect(routePreloads.js).toHaveLength(10)
		expect(routePreloads.css).toHaveLength(10)
	})
})
