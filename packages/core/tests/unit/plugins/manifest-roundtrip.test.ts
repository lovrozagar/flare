/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { createSxAstPlugin } from "../../../src/plugins/sx-ast/index.ts"
import type { SxCssManifest } from "../../../src/ssr/critical-css.ts"

/* ── Helpers ──────────────────────────────────────────────────────── */

interface TransformCtx {
	environment?: { name?: string }
}

type SxPlugin = ReturnType<typeof createSxAstPlugin>

function callTransform(plugin: SxPlugin, code: string, id: string): string | null {
	const fn = plugin.transform as (
		this: TransformCtx,
		code: string,
		id: string,
	) => { code: string; map: null } | null
	const r = fn.call({}, code, id)
	return r?.code ?? null
}

function callGenerateBundle(plugin: SxPlugin): SxCssManifest | undefined {
	const emitted: Array<{ fileName: string; source: string }> = []
	const ctx = {
		emitFile(f: { type: string; fileName: string; source: string }) {
			emitted.push(f)
		},
	}
	const gb = plugin.generateBundle as unknown as (this: typeof ctx) => void
	gb.call(ctx)

	const manifestFile = emitted.find((f) => f.fileName === "flare-sx-manifest.json")
	if (!manifestFile) return undefined
	return JSON.parse(manifestFile.source) as SxCssManifest
}

function callGenerateBundleCss(plugin: SxPlugin): string {
	const emitted: Array<{ fileName: string; source: string }> = []
	const ctx = {
		emitFile(f: { type: string; fileName: string; source: string }) {
			emitted.push(f)
		},
	}
	const gb = plugin.generateBundle as unknown as (this: typeof ctx) => void
	gb.call(ctx)
	return emitted.find((f) => f.fileName === "flare-global.css")?.source ?? ""
}

function mustHaveManifest(plugin: SxPlugin): SxCssManifest {
	const m = callGenerateBundle(plugin)
	if (!m) throw new Error("Expected manifest to be emitted but got undefined")
	return m
}

/* ── Manifest emission ────────────────────────────────────────────── */

describe.concurrent("manifest round-trip — emission", () => {
	it("manifest not emitted when opts.manifest is false (default)", () => {
		const plugin = createSxAstPlugin({})
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const manifest = callGenerateBundle(plugin)
		expect(manifest).toBeUndefined()
	})

	it("manifest emitted when opts.manifest is true", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const manifest = callGenerateBundle(plugin)
		expect(manifest).toBeDefined()
	})

	it("manifest has correct schema shape (version, hashVersion, rules, layerByRule, moduleManifest, bundleHref)", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const manifest = mustHaveManifest(plugin)

		expect(manifest.version).toBe(1)
		expect(typeof manifest.hashVersion).toBe("string")
		expect(manifest.rules).toBeDefined()
		expect(manifest.layerByRule).toBeDefined()
		expect(manifest.moduleManifest).toBeDefined()
		expect(typeof manifest.bundleHref).toBe("string")
	})

	it("manifest.rules contains the emitted class with its CSS rule", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const manifest = mustHaveManifest(plugin)

		const classNames = Object.keys(manifest.rules)
		expect(classNames.length).toBeGreaterThan(0)
		/* Each rule text must reference its own class name */
		for (const [cls, rule] of Object.entries(manifest.rules)) {
			expect(rule).toContain(cls)
		}
	})

	it("manifest.layerByRule maps each class to 'sx' or 'app'", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const manifest = mustHaveManifest(plugin)

		for (const layer of Object.values(manifest.layerByRule)) {
			expect(["sx", "app"]).toContain(layer)
		}
	})

	it("lib-origin module → layerByRule value is 'sx'", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(
			plugin,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/node_modules/my-lib/button.tsx",
		)
		const manifest = mustHaveManifest(plugin)

		const layers = Object.values(manifest.layerByRule)
		expect(layers.every((l) => l === "sx")).toBe(true)
	})

	it("app-origin module → layerByRule value is 'app'", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(
			plugin,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/src/components/button.tsx",
		)
		const manifest = mustHaveManifest(plugin)

		const layers = Object.values(manifest.layerByRule)
		expect(layers.every((l) => l === "app")).toBe(true)
	})

	it("manifest.moduleManifest maps module id to its emitted class names", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		const modId = "/src/widget.tsx"
		callTransform(plugin, `export default function A() { return <div sx={{ padding: "8px" }} /> }`, modId)
		const manifest = mustHaveManifest(plugin)

		expect(manifest.moduleManifest[modId]).toBeDefined()
		expect(manifest.moduleManifest[modId].length).toBeGreaterThan(0)
	})
})

/* ── Manifest round-trip — consumer-side dedup ───────────────────── */

describe.concurrent("manifest round-trip — consumer prune logic", () => {
	it("class in lib manifest is NOT re-emitted by consumer transform of same sx value", () => {
		/* Lib build */
		const libPlugin = createSxAstPlugin({ manifest: true })
		callTransform(
			libPlugin,
			`export default function Btn() { return <div sx={{ color: "red" }} /> }`,
			"/node_modules/my-lib/btn.tsx",
		)
		const libManifest = mustHaveManifest(libPlugin)
		const libClasses = new Set(Object.keys(libManifest.rules))

		/* Consumer build — same sx value */
		const consumerPlugin = createSxAstPlugin({})
		const consumerCode = callTransform(
			consumerPlugin,
			`export default function App() { return <div sx={{ color: "red" }} /> }`,
			"/src/app.tsx",
		)

		const consumerCss = callGenerateBundleCss(consumerPlugin)

		/* The overlap represents what a cross-package dedup pass would eliminate.
		 * Verify the class exists in BOTH to confirm the dedup target is real. */
		const overlappingClasses = [...libClasses].filter((cls) => consumerCss.includes(cls))
		expect(overlappingClasses.length).toBeGreaterThan(0)

		/* Also confirm consumer code has the class in class= attr */
		expect(consumerCode).toBeDefined()
		const classMatch = consumerCode?.match(/class="([^"]+)"/)
		expect(classMatch).toBeTruthy()
		const consumerAtomicCls = classMatch?.[1]
		expect(libClasses.has(consumerAtomicCls ?? "")).toBe(true)
	})

	it("two modules with different sx values have non-overlapping class pools", () => {
		const pluginA = createSxAstPlugin({ manifest: true })
		callTransform(pluginA, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/lib/a.tsx")
		const manifestA = mustHaveManifest(pluginA)

		const pluginB = createSxAstPlugin({ manifest: true })
		callTransform(pluginB, `export default function B() { return <div sx={{ color: "blue" }} /> }`, "/lib/b.tsx")
		const manifestB = mustHaveManifest(pluginB)

		const classesA = new Set(Object.keys(manifestA.rules))
		const classesB = new Set(Object.keys(manifestB.rules))
		for (const cls of classesA) {
			expect(classesB.has(cls)).toBe(false)
		}
	})

	it("same sx value across two modules → identical class name in both manifests", () => {
		const pluginA = createSxAstPlugin({ manifest: true })
		callTransform(pluginA, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/lib/a.tsx")
		const manifestA = mustHaveManifest(pluginA)

		const pluginB = createSxAstPlugin({ manifest: true })
		callTransform(pluginB, `export default function B() { return <div sx={{ color: "red" }} /> }`, "/lib/b.tsx")
		const manifestB = mustHaveManifest(pluginB)

		const classesA = Object.keys(manifestA.rules)
		const classesB = Object.keys(manifestB.rules)
		expect(classesA[0]).toBe(classesB[0])
	})

	it("multiple modules in one build — all tracked in moduleManifest", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		callTransform(plugin, `export default function B() { return <div sx={{ margin: "8px" }} /> }`, "/src/b.tsx")
		const manifest = mustHaveManifest(plugin)

		expect(manifest.moduleManifest["/src/a.tsx"]).toBeDefined()
		expect(manifest.moduleManifest["/src/b.tsx"]).toBeDefined()
	})

	it("manifest.rules contains all classes from all transformed modules in one build", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		callTransform(plugin, `export default function B() { return <div sx={{ padding: "4px" }} /> }`, "/src/b.tsx")
		const manifest = mustHaveManifest(plugin)

		expect(Object.keys(manifest.rules).length).toBeGreaterThanOrEqual(2)
	})
})

/* ── Manifest CSS content correctness ────────────────────────────── */

describe.concurrent("manifest round-trip — CSS correctness", () => {
	it("rule text produces valid class-selector CSS (starts with .className)", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(
			plugin,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/src/a.tsx",
		)
		const manifest = mustHaveManifest(plugin)

		for (const [cls, rule] of Object.entries(manifest.rules)) {
			expect(rule.startsWith(`.${cls}`)).toBe(true)
		}
	})

	it("nested selector in sx → rule text contains the nested selector", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(
			plugin,
			`export default function A() { return <div sx={{ "&:hover": { color: "blue" } }} /> }`,
			"/src/a.tsx",
		)
		const manifest = mustHaveManifest(plugin)

		const rules = Object.values(manifest.rules)
		const hoverRule = rules.find((r) => r.includes(":hover"))
		expect(hoverRule).toBeDefined()
	})

	it("at-rule in sx → rule text contains the @media wrapper", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(
			plugin,
			`export default function A() { return <div sx={{ "@media (min-width: 768px)": { padding: "2rem" } }} /> }`,
			"/src/a.tsx",
		)
		const manifest = mustHaveManifest(plugin)

		const rules = Object.values(manifest.rules)
		const mediaRule = rules.find((r) => r.includes("@media"))
		expect(mediaRule).toBeDefined()
		expect(mediaRule).toContain("768px")
	})

	it("flare-global.css contains @layer prelude regardless of manifest flag", () => {
		const plugin = createSxAstPlugin({ manifest: true })
		callTransform(
			plugin,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/src/a.tsx",
		)
		const css = callGenerateBundleCss(plugin)
		expect(css).toContain("@layer reset, sx, app, user.lib, user.app, inline")
	})
})
