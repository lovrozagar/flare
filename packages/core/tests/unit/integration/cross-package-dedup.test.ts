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
	return fn.call({}, code, id)?.code ?? null
}

function emitAll(plugin: SxPlugin): {
	css: string
	manifest: SxCssManifest | undefined
} {
	const emitted: Array<{ fileName: string; source: string }> = []
	const ctx = {
		emitFile(f: { type: string; fileName: string; source: string }) {
			emitted.push(f)
		},
	}
	const gb = plugin.generateBundle as unknown as (this: typeof ctx) => void
	gb.call(ctx)

	const css = emitted.find((f) => f.fileName.endsWith("flare-global.css"))?.source ?? ""
	const manifestRaw = emitted.find((f) => f.fileName === "flare-sx-manifest.json")?.source
	const manifest = manifestRaw ? (JSON.parse(manifestRaw) as SxCssManifest) : undefined
	return { css, manifest }
}

/* Simulate a lib build: transform N components, emit manifest + CSS. */
function buildLib(
	components: Array<{ id: string; src: string }>,
): { css: string; manifest: SxCssManifest } {
	const plugin = createSxAstPlugin({ manifest: true })
	const configResolved = plugin.configResolved as (cfg: { command: string }) => void
	configResolved({ command: "build" })

	for (const { id, src } of components) {
		callTransform(plugin, src, id)
	}

	const { css, manifest } = emitAll(plugin)
	if (!manifest) throw new Error("Expected manifest from lib build")
	return { css, manifest }
}

/* Simulate a consumer build: transform N components, emit CSS only. */
function buildConsumer(components: Array<{ id: string; src: string }>): string {
	const plugin = createSxAstPlugin({})
	const configResolved = plugin.configResolved as (cfg: { command: string }) => void
	configResolved({ command: "build" })

	for (const { id, src } of components) {
		callTransform(plugin, src, id)
	}

	const { css } = emitAll(plugin)
	return css
}

/* ── Manifest schema validation ────────────────────────────────────── */

describe.concurrent("cross-package — manifest schema", () => {
	it("lib manifest has all required schema fields", () => {
		const { manifest } = buildLib([{
			id: "/node_modules/lib/button.tsx",
			src: `export default function Btn() { return <div sx={{ color: "red" }} /> }`,
		}])

		expect(manifest.version).toBe(1)
		expect(typeof manifest.hashVersion).toBe("string")
		expect(typeof manifest.bundleHref).toBe("string")
		expect(manifest.rules).toBeDefined()
		expect(manifest.layerByRule).toBeDefined()
		expect(manifest.moduleManifest).toBeDefined()
	})

	it("manifest.rules keys match manifest.layerByRule keys", () => {
		const { manifest } = buildLib([{
			id: "/node_modules/lib/card.tsx",
			src: `export default function Card() { return <div sx={{ padding: "8px" }} /> }`,
		}])

		const ruleKeys = new Set(Object.keys(manifest.rules))
		const layerKeys = new Set(Object.keys(manifest.layerByRule))
		/* Every class in rules has a layer entry */
		for (const k of ruleKeys) {
			expect(layerKeys.has(k)).toBe(true)
		}
	})

	it("manifest.moduleManifest class names all present in manifest.rules", () => {
		const { manifest } = buildLib([
			{
				id: "/node_modules/lib/a.tsx",
				src: `export default function A() { return <div sx={{ color: "red" }} /> }`,
			},
			{
				id: "/node_modules/lib/b.tsx",
				src: `export default function B() { return <div sx={{ padding: "4px" }} /> }`,
			},
		])

		for (const classes of Object.values(manifest.moduleManifest)) {
			for (const cls of classes) {
				expect(manifest.rules[cls]).toBeDefined()
			}
		}
	})

	it("prod-mode manifest class names use a1- prefix", () => {
		const { manifest } = buildLib([{
			id: "/node_modules/lib/x.tsx",
			src: `export default function X() { return <div sx={{ color: "red" }} /> }`,
		}])

		for (const cls of Object.keys(manifest.rules)) {
			expect(cls).toMatch(/^a1-[a-z0-9]{8}$/)
		}
	})
})

/* ── Cross-package zero-dup assertion ─────────────────────────────── */

describe.concurrent("cross-package — zero duplicate emission", () => {
	it("class present in lib manifest also appears in consumer CSS (overlap exists without pruning)", () => {
		const libComponents = [{
			id: "/node_modules/lib/button.tsx",
			src: `export default function Btn() { return <div sx={{ color: "red" }} /> }`,
		}]
		const { manifest: libManifest } = buildLib(libComponents)
		const libClasses = Object.keys(libManifest.rules)

		/* Consumer uses same sx value — no pruning yet → class appears in both */
		const consumerCss = buildConsumer([{
			id: "/src/page.tsx",
			src: `export default function Page() { return <div sx={{ color: "red" }} /> }`,
		}])

		const consumerHasLibClass = libClasses.some((cls) => consumerCss.includes(cls))
		expect(consumerHasLibClass).toBe(true)
		/* This is the overlap that cross-package dedup must eliminate — confirmed real target */
	})

	it("classes unique to consumer not present in lib manifest", () => {
		const { manifest: libManifest } = buildLib([{
			id: "/node_modules/lib/btn.tsx",
			src: `export default function Btn() { return <div sx={{ color: "red" }} /> }`,
		}])
		const libClasses = new Set(Object.keys(libManifest.rules))

		const consumerCss = buildConsumer([{
			id: "/src/page.tsx",
			src: `export default function Page() { return <div sx={{ margin: "16px" }} /> }`,
		}])

		/* Consumer's unique class must be present */
		expect(consumerCss).toContain("margin")
		/* And it must not be in the lib manifest */
		const consumerPlugin = createSxAstPlugin({ manifest: true })
		const configResolved = consumerPlugin.configResolved as (cfg: { command: string }) => void
		configResolved({ command: "build" })
		callTransform(
			consumerPlugin,
			`export default function Page() { return <div sx={{ margin: "16px" }} /> }`,
			"/src/page.tsx",
		)
		const { manifest: consumerManifest } = emitAll(consumerPlugin)
		const consumerClasses = Object.keys(consumerManifest?.rules ?? {})
		for (const cls of consumerClasses) {
			expect(libClasses.has(cls)).toBe(false)
		}
	})

	it("two separate libs with different sx values have no shared classes", () => {
		const { manifest: lib1 } = buildLib([{
			id: "/node_modules/lib1/a.tsx",
			src: `export default function A() { return <div sx={{ color: "red", padding: "4px" }} /> }`,
		}])

		const { manifest: lib2 } = buildLib([{
			id: "/node_modules/lib2/b.tsx",
			src: `export default function B() { return <div sx={{ color: "blue", margin: "8px" }} /> }`,
		}])

		const lib1Classes = new Set(Object.keys(lib1.rules))
		const lib2Classes = Object.keys(lib2.rules)

		for (const cls of lib2Classes) {
			expect(lib1Classes.has(cls)).toBe(false)
		}
	})

	it("same sx value in lib and consumer → identical a1- hash (stable across builds)", () => {
		const { manifest: libManifest } = buildLib([{
			id: "/node_modules/lib/x.tsx",
			src: `export default function X() { return <div sx={{ color: "red" }} /> }`,
		}])

		/* Consumer build with same sx value */
		const consumerPlugin = createSxAstPlugin({ manifest: true })
		const configResolved = consumerPlugin.configResolved as (cfg: { command: string }) => void
		configResolved({ command: "build" })
		callTransform(
			consumerPlugin,
			`export default function Y() { return <div sx={{ color: "red" }} /> }`,
			"/src/y.tsx",
		)
		const { manifest: consumerManifest } = emitAll(consumerPlugin)

		const libCls = Object.keys(libManifest.rules)[0]
		const consumerCls = Object.keys(consumerManifest?.rules ?? {})[0]
		expect(libCls).toBe(consumerCls)
	})
})

/* ── Multi-property dedup ─────────────────────────────────────────── */

describe.concurrent("cross-package — multi-property sx objects", () => {
	it("each distinct property → distinct a1- class in manifest", () => {
		const { manifest } = buildLib([{
			id: "/node_modules/lib/multi.tsx",
			src: `export default function M() {
  return <div sx={{ color: "red", padding: "8px", margin: "4px" }} />
}`,
		}])

		expect(Object.keys(manifest.rules).length).toBeGreaterThanOrEqual(3)
	})

	it("nested selector produces its own class entry in manifest", () => {
		const { manifest } = buildLib([{
			id: "/node_modules/lib/hover.tsx",
			src: `export default function H() {
  return <div sx={{ "&:hover": { color: "blue" } }} />
}`,
		}])

		const hoverRule = Object.values(manifest.rules).find((r) => r.includes(":hover"))
		expect(hoverRule).toBeDefined()
	})

	it("@media at-rule produces its own class entry in manifest", () => {
		const { manifest } = buildLib([{
			id: "/node_modules/lib/responsive.tsx",
			src: `export default function R() {
  return <div sx={{ "@media (min-width: 768px)": { padding: "2rem" } }} />
}`,
		}])

		const mediaRule = Object.values(manifest.rules).find((r) => r.includes("@media"))
		expect(mediaRule).toBeDefined()
		expect(mediaRule).toContain("768px")
	})

	it("same multi-prop sx across lib and consumer → all classes overlap (dedup target)", () => {
		const sx = `sx={{ color: "red", padding: "4px" }}`
		const { manifest: libManifest } = buildLib([{
			id: "/node_modules/lib/multi.tsx",
			src: `export default function M() { return <div ${sx} /> }`,
		}])

		const consumerPlugin = createSxAstPlugin({ manifest: true })
		const cr = consumerPlugin.configResolved as (cfg: { command: string }) => void
		cr({ command: "build" })
		callTransform(
			consumerPlugin,
			`export default function N() { return <div ${sx} /> }`,
			"/src/n.tsx",
		)
		const { manifest: consumerManifest } = emitAll(consumerPlugin)

		const libClasses = new Set(Object.keys(libManifest.rules))
		const consumerClasses = Object.keys(consumerManifest?.rules ?? {})

		/* All consumer classes overlap with lib — full dedup candidate set */
		for (const cls of consumerClasses) {
			expect(libClasses.has(cls)).toBe(true)
		}
	})
})
