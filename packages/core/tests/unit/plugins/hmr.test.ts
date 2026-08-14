/** @vitest-environment node */
/**
 * HMR behaviour in sx-ast: the plugin has no explicit `handleHotUpdate` hook.
 * In dev mode, each `transform` call re-runs the full extraction and emits an
 * inline style injection snippet that updates `#flare-sx-dev` on module
 * re-execution. This suite verifies:
 *
 * - Transform is stateless per-call (re-transform with new source produces new output).
 * - Class pool accumulates across transforms within the same plugin instance (simulates
 *   initial build pass across multiple files).
 * - A re-transform of the same module with changed source emits the new class, not just
 *   the old one, in its inline inject snippet.
 * - Dev-mode inject snippet targets `#flare-sx-dev` (the mutable dev sheet).
 * - Stale classes from a previous transform of the same module are NOT removed from the
 *   shared pool (no eviction — a full HMR invalidation triggers a re-bundle in Vite).
 *   The class pool grows monotonically within a build instance.
 */
import { describe, expect, it } from "vitest"
import { createSxAstPlugin } from "../../../src/plugins/sx-ast/index.ts"

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

function emitCss(plugin: SxPlugin): string {
	const emitted: Array<{ fileName: string; source: string }> = []
	const ctx = {
		emitFile(f: { type: string; fileName: string; source: string }) {
			emitted.push(f)
		},
	}
	const gb = plugin.generateBundle as unknown as (this: typeof ctx) => void
	gb.call(ctx)
	return emitted.find((f) => f.fileName.endsWith("flare-global.css"))?.source ?? ""
}

/* ── Transform is stateless per-call (HMR re-transform) ─────────── */

describe.concurrent("HMR — re-transform produces updated output", () => {
	it("re-transform with changed sx value produces a different class name", () => {
		const plugin = createSxAstPlugin({})
		const src1 = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const src2 = `export default function A() { return <div sx={{ color: "blue" }} /> }`

		const code1 = callTransform(plugin, src1, "/src/a.tsx")
		const code2 = callTransform(plugin, src2, "/src/a.tsx")

		const cls1 = code1?.match(/class="(sx-[^"]+)"/)?.[1]
		const cls2 = code2?.match(/class="(sx-[^"]+)"/)?.[1]

		expect(cls1).toBeDefined()
		expect(cls2).toBeDefined()
		expect(cls1).not.toBe(cls2)
	})

	it("re-transform with identical source produces identical class name", () => {
		const plugin = createSxAstPlugin({})
		const src = `export default function A() { return <div sx={{ color: "green" }} /> }`

		const code1 = callTransform(plugin, src, "/src/a.tsx")
		const code2 = callTransform(plugin, src, "/src/a.tsx")

		const cls1 = code1?.match(/class="(sx-[^"]+)"/)?.[1]
		const cls2 = code2?.match(/class="(sx-[^"]+)"/)?.[1]

		expect(cls1).toBe(cls2)
	})

	it("re-transform with new property emits the new property's class", () => {
		const plugin = createSxAstPlugin({})
		const src1 = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const src2 = `export default function A() { return <div sx={{ padding: "8px" }} /> }`

		const code1 = callTransform(plugin, src1, "/src/a.tsx")
		const code2 = callTransform(plugin, src2, "/src/a.tsx")

		expect(code1).toMatch(/sx-color-red/)
		expect(code2).toMatch(/sx-padding-8px/)
		/* After the re-transform, the new code no longer references the old class */
		expect(code2).not.toMatch(/sx-color-red/)
	})
})

/* ── Dev-mode inject snippet targets #flare-sx-dev ──────────────── */

describe.concurrent("HMR — dev-mode inject snippet", () => {
	it("dev transform output contains #flare-sx-dev style injection", () => {
		const plugin = createSxAstPlugin({})
		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const code = callTransform(plugin, src, "/src/a.tsx")

		expect(code).toContain("flare-sx-dev")
		expect(code).toContain("document.createElement")
	})

	it("inject snippet appends to existing #flare-sx-dev element", () => {
		const plugin = createSxAstPlugin({})
		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const code = callTransform(plugin, src, "/src/a.tsx")

		/* The snippet must reuse the element (textContent +=) not replace it */
		expect(code).toContain("textContent +=")
	})

	it("inject snippet is inside typeof document check (SSR guard)", () => {
		const plugin = createSxAstPlugin({})
		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const code = callTransform(plugin, src, "/src/a.tsx")

		expect(code).toContain('typeof document !== "undefined"')
	})

	it("inject snippet wraps CSS in @layer block for correct cascade", () => {
		const plugin = createSxAstPlugin({})
		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const code = callTransform(plugin, src, "/src/a.tsx")

		expect(code).toContain("@layer")
	})

	it("prod mode: no inject snippet in output", () => {
		const plugin = createSxAstPlugin({})
		const configResolved = plugin.configResolved as (cfg: { command: string }) => void
		configResolved({ command: "build" })

		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const code = callTransform(plugin, src, "/src/a.tsx")

		expect(code).not.toContain("flare-sx-dev")
		expect(code).not.toContain("document.createElement")
	})
})

/* ── Class pool accumulates (no eviction within build instance) ──── */

describe.concurrent("HMR — class pool accumulation", () => {
	it("re-transform of same module adds new class to pool (old not evicted)", () => {
		const plugin = createSxAstPlugin({})
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		callTransform(plugin, `export default function A() { return <div sx={{ color: "blue" }} /> }`, "/src/a.tsx")

		const css = emitCss(plugin)
		/* Both classes present in the final bundle — no eviction within instance */
		expect(css).toContain("color")
		/* Both red and blue rules accumulated */
		const redMatch = css.match(/sx-color-red/)
		const blueMatch = css.match(/sx-color-blue/)
		expect(redMatch).toBeTruthy()
		expect(blueMatch).toBeTruthy()
	})

	it("class pool grows with each distinct transform", () => {
		const plugin = createSxAstPlugin({})

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const css1 = emitCss(plugin)

		/* New instance to compare fresh state */
		const plugin2 = createSxAstPlugin({})
		callTransform(plugin2, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		callTransform(plugin2, `export default function B() { return <div sx={{ padding: "4px" }} /> }`, "/src/b.tsx")
		const css2 = emitCss(plugin2)

		/* Second build has more content */
		expect(css2.length).toBeGreaterThan(css1.length)
	})

	it("virtual module re-import: class pool state persists across consecutive transforms", () => {
		const plugin = createSxAstPlugin({ manifest: true })

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		callTransform(plugin, `export default function B() { return <div sx={{ margin: "8px" }} /> }`, "/src/b.tsx")

		const emitted: Array<{ fileName: string; source: string }> = []
		const ctx = {
			emitFile(f: { type: string; fileName: string; source: string }) {
				emitted.push(f)
			},
		}
		const gb = plugin.generateBundle as unknown as (this: typeof ctx) => void
		gb.call(ctx)

		/* Manifest has both modules */
		const manifestRaw = emitted.find((f) => f.fileName === "flare-sx-manifest.json")?.source
		const manifest = manifestRaw ? JSON.parse(manifestRaw) : null
		expect(manifest?.moduleManifest["/src/a.tsx"]).toBeDefined()
		expect(manifest?.moduleManifest["/src/b.tsx"]).toBeDefined()
	})
})

/* ── No handleHotUpdate hook (Vite handles re-transform) ─────────── */

describe.concurrent("HMR — plugin API surface", () => {
	it("plugin does not expose a handleHotUpdate hook (Vite handles HMR via transform)", () => {
		const plugin = createSxAstPlugin({})
		/* handleHotUpdate is not in the plugin — Vite's default re-transform on save is used */
		expect((plugin as unknown as Record<string, unknown>)["handleHotUpdate"]).toBeUndefined()
	})

	it("plugin exposes enforce: 'pre' so it runs before solid plugin", () => {
		const plugin = createSxAstPlugin({})
		expect(plugin.enforce).toBe("pre")
	})

	it("plugin name is 'flare:sx-ast'", () => {
		const plugin = createSxAstPlugin({})
		expect(plugin.name).toBe("flare:sx-ast")
	})
})
