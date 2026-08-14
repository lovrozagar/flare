import { describe, expect, it } from "vitest"
import {
	findEntryKey,
	mergePreloads,
	resolveModulePreloads,
	resolveRoutePreloads,
	type ViteManifest,
} from "../../../src/module-graph/index.ts"

/**
 * Minimal manifest shape matching real flare-e2e prod build.
 * Entry has no static imports — only dynamicImports (route chunks).
 * Shared chunks reference the entry via imports.
 */
const MANIFEST: ViteManifest = {
	"_shared-chunk-a.js": {
		file: "assets/shared-a.js",
		imports: ["src/client.tsx"],
		name: "shared-a",
	},
	"_shared-chunk-b.js": {
		file: "assets/shared-b.js",
		imports: ["src/client.tsx"],
		name: "shared-b",
	},
	"src/client.tsx": {
		dynamicImports: ["src/routes/_root_.tsx", "src/routes/index.tsx", "src/routes/about.tsx"],
		file: "assets/client-abc.js",
		isEntry: true,
		name: "client",
		src: "src/client.tsx",
	},
	"src/routes/_root_.tsx": {
		file: "assets/root.js",
		imports: ["src/client.tsx"],
		isDynamicEntry: true,
		name: "_root_",
		src: "src/routes/_root_.tsx",
	},
	"src/routes/about.tsx": {
		css: ["assets/about.css"],
		file: "assets/about.js",
		imports: ["src/client.tsx", "_shared-chunk-b.js"],
		isDynamicEntry: true,
		name: "about",
		src: "src/routes/about.tsx",
	},
	"src/routes/index.tsx": {
		file: "assets/index.js",
		imports: ["src/client.tsx", "_shared-chunk-a.js", "_shared-chunk-b.js"],
		isDynamicEntry: true,
		name: "index",
		src: "src/routes/index.tsx",
	},
}

describe("resolveModulePreloads", () => {
	it("collects entry chunk with no static imports", () => {
		const result = resolveModulePreloads(MANIFEST, "src/client.tsx")
		expect(result.js).toEqual(["/assets/client-abc.js"])
		expect(result.css).toEqual([])
	})

	it("follows static imports transitively", () => {
		const manifest: ViteManifest = {
			"_chunk-a.js": {
				file: "assets/chunk-a.js",
				imports: ["_chunk-b.js"],
			},
			"_chunk-b.js": {
				css: ["assets/base.css"],
				file: "assets/chunk-b.js",
			},
			"src/entry.tsx": {
				file: "assets/entry.js",
				imports: ["_chunk-a.js"],
				isEntry: true,
			},
		}

		const result = resolveModulePreloads(manifest, "src/entry.tsx")
		expect(result.js).toEqual(["/assets/entry.js", "/assets/chunk-a.js", "/assets/chunk-b.js"])
		expect(result.css).toEqual(["/assets/base.css"])
	})

	it("handles circular imports without infinite loop", () => {
		const manifest: ViteManifest = {
			"_chunk-a.js": {
				file: "assets/chunk-a.js",
				imports: ["_chunk-b.js"],
			},
			"_chunk-b.js": {
				file: "assets/chunk-b.js",
				imports: ["_chunk-a.js"],
			},
			"src/entry.tsx": {
				file: "assets/entry.js",
				imports: ["_chunk-a.js"],
				isEntry: true,
			},
		}

		const result = resolveModulePreloads(manifest, "src/entry.tsx")
		expect(result.js).toEqual(["/assets/entry.js", "/assets/chunk-a.js", "/assets/chunk-b.js"])
	})

	it("does not follow dynamicImports", () => {
		const result = resolveModulePreloads(MANIFEST, "src/client.tsx")
		expect(result.js).not.toContain("/assets/root.js")
		expect(result.js).not.toContain("/assets/index.js")
		expect(result.js).not.toContain("/assets/about.js")
	})

	it("follows the hydrate dynamic import from the client entry", () => {
		const manifest = {
			"src/client.tsx": {
				dynamicImports: [
					"../../packages/core/src/hydrate/index.tsx",
					"src/routes/about.tsx",
				],
				file: "assets/client.js",
			},
			"../../packages/core/src/hydrate/index.tsx": {
				file: "assets/hydrate.js",
				imports: ["_shared.js"],
			},
			"_shared.js": { file: "assets/shared.js" },
			"src/routes/about.tsx": { file: "assets/about.js" },
		}
		const result = resolveModulePreloads(manifest, "src/client.tsx")
		expect(result.js).toContain("/assets/client.js")
		expect(result.js).toContain("/assets/hydrate.js")
		expect(result.js).toContain("/assets/shared.js")
		expect(result.js).not.toContain("/assets/about.js")
	})

	it("returns empty for unknown key", () => {
		const result = resolveModulePreloads(MANIFEST, "nonexistent")
		expect(result.js).toEqual([])
		expect(result.css).toEqual([])
	})
})

describe("resolveRoutePreloads", () => {
	const entryPreloads = resolveModulePreloads(MANIFEST, "src/client.tsx")

	it("collects route chunk + its non-entry imports", () => {
		const result = resolveRoutePreloads(MANIFEST, ["src/routes/index.tsx"], entryPreloads)
		expect(result.js).toEqual(["/assets/index.js", "/assets/shared-a.js", "/assets/shared-b.js"])
		expect(result.css).toEqual([])
	})

	it("excludes entry chunk from route preloads", () => {
		const result = resolveRoutePreloads(MANIFEST, ["src/routes/index.tsx"], entryPreloads)
		expect(result.js).not.toContain("/assets/client-abc.js")
	})

	it("includes CSS from route dependencies", () => {
		const result = resolveRoutePreloads(MANIFEST, ["src/routes/about.tsx"], entryPreloads)
		expect(result.css).toEqual(["/assets/about.css"])
		expect(result.js).toEqual(["/assets/about.js", "/assets/shared-b.js"])
	})

	it("deduplicates across multiple routes", () => {
		const result = resolveRoutePreloads(
			MANIFEST,
			["src/routes/_root_.tsx", "src/routes/index.tsx"],
			entryPreloads,
		)
		/* root.js, index.js, shared-a.js, shared-b.js — all unique */
		expect(result.js).toEqual([
			"/assets/root.js",
			"/assets/index.js",
			"/assets/shared-a.js",
			"/assets/shared-b.js",
		])
	})

	it("works without entryPreloads (includes entry chunk)", () => {
		const result = resolveRoutePreloads(MANIFEST, ["src/routes/_root_.tsx"])
		expect(result.js).toContain("/assets/root.js")
		expect(result.js).toContain("/assets/client-abc.js")
	})
})

describe("findEntryKey", () => {
	it("finds the entry with isEntry: true", () => {
		expect(findEntryKey(MANIFEST)).toBe("src/client.tsx")
	})

	it("returns undefined when no entry exists", () => {
		expect(findEntryKey({})).toBeUndefined()
	})
})

describe("mergePreloads", () => {
	it("merges two preload sets with dedup", () => {
		const a = { css: ["/a.css"], js: ["/a.js", "/b.js"] }
		const b = { css: ["/a.css", "/c.css"], js: ["/b.js", "/d.js"] }
		const result = mergePreloads(a, b)
		expect(result.js).toEqual(["/a.js", "/b.js", "/d.js"])
		expect(result.css).toEqual(["/a.css", "/c.css"])
	})
})
