/** @vitest-environment node */
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
	const r = fn.call({}, code, id)
	return r?.code ?? null
}

/* Source that always triggers the dynamic sx path (layer arg visible in output) */
const DYNAMIC_SRC = `export default function A({ s }: { s: object }) { return <div sx={s} /> }`

/* ── Layer heuristic — libPaths ───────────────────────────────────── */

describe.concurrent("layer selection — libPaths heuristic", () => {
	it("source in /node_modules/ → layer 'sx' → emits user.lib arg", () => {
		const plugin = createSxAstPlugin({})
		const code = callTransform(plugin, DYNAMIC_SRC, "/node_modules/lib-x/button.tsx")
		expect(code).toContain('"user.lib"')
		expect(code).not.toContain('"user.app"')
	})

	it("source in consumer project (no /node_modules/) → layer 'app' → emits user.app arg", () => {
		const plugin = createSxAstPlugin({})
		const code = callTransform(plugin, DYNAMIC_SRC, "/src/components/button.tsx")
		expect(code).toContain('"user.app"')
		expect(code).not.toContain('"user.lib"')
	})

	it("source in /src/ root → layer 'app'", () => {
		const plugin = createSxAstPlugin({})
		const code = callTransform(plugin, DYNAMIC_SRC, "/src/button.tsx")
		expect(code).toContain('"user.app"')
	})

	it("source in /home/user/project/src/ (deep consumer) → layer 'app'", () => {
		const plugin = createSxAstPlugin({})
		const code = callTransform(plugin, DYNAMIC_SRC, "/home/user/project/src/widget.tsx")
		expect(code).toContain('"user.app"')
	})

	it("multiple libPaths entries — all match as 'sx' layer", () => {
		const plugin = createSxAstPlugin({
			libPaths: ["/packages/design-system/", "/packages/icons/"],
		})

		const code1 = callTransform(plugin, DYNAMIC_SRC, "/packages/design-system/src/button.tsx")
		const code2 = callTransform(plugin, DYNAMIC_SRC, "/packages/icons/src/icon.tsx")

		expect(code1).toContain('"user.lib"')
		expect(code2).toContain('"user.lib"')
	})

	it("path with /node_modules/ sub-string in a consumer folder does NOT match as lib", () => {
		/* False-positive: /home/myapp/node_modules_backup/button.tsx
		 * The default libPaths check is `id.includes("/node_modules/")` — this path does NOT
		 * contain the exact token with trailing slash so it should remain 'app'. */
		const plugin = createSxAstPlugin({})
		/* This path has "node_modules" but no trailing slash after it */
		const code = callTransform(
			plugin,
			DYNAMIC_SRC,
			"/home/myapp/node_modules_backup/button.tsx",
		)
		/* No /node_modules/ (with slashes) → layer 'app' */
		expect(code).toContain('"user.app"')
	})

	it("exact /node_modules/ token (with surrounding slashes) matches as lib", () => {
		const plugin = createSxAstPlugin({})
		const code = callTransform(
			plugin,
			DYNAMIC_SRC,
			"/home/project/node_modules/some-lib/button.tsx",
		)
		expect(code).toContain('"user.lib"')
	})
})

/* ── layerOverride callback ───────────────────────────────────────── */

describe.concurrent("layer selection — layerOverride callback", () => {
	it("layerOverride returning 'sx' wins over app heuristic", () => {
		const plugin = createSxAstPlugin({ layerOverride: () => "sx" })
		const code = callTransform(plugin, DYNAMIC_SRC, "/src/any/button.tsx")
		expect(code).toContain('"user.lib"')
	})

	it("layerOverride returning 'app' wins over lib heuristic", () => {
		const plugin = createSxAstPlugin({ layerOverride: () => "app" })
		const code = callTransform(plugin, DYNAMIC_SRC, "/node_modules/lib/button.tsx")
		expect(code).toContain('"user.app"')
		expect(code).not.toContain('"user.lib"')
	})

	it("layerOverride returning null falls back to libPaths heuristic (lib path)", () => {
		const plugin = createSxAstPlugin({ layerOverride: () => null })
		const code = callTransform(plugin, DYNAMIC_SRC, "/node_modules/lib/button.tsx")
		expect(code).toContain('"user.lib"')
	})

	it("layerOverride returning null falls back to libPaths heuristic (app path)", () => {
		const plugin = createSxAstPlugin({ layerOverride: () => null })
		const code = callTransform(plugin, DYNAMIC_SRC, "/src/app/page.tsx")
		expect(code).toContain('"user.app"')
	})

	it("layerOverride receives the full module id", () => {
		const seen: string[] = []
		const plugin = createSxAstPlugin({
			layerOverride: (id) => {
				seen.push(id)
				return null
			},
		})
		callTransform(plugin, DYNAMIC_SRC, "/packages/custom/button.tsx")
		expect(seen).toContain("/packages/custom/button.tsx")
	})

	it("layerOverride per-id routing — different layers for different paths", () => {
		const plugin = createSxAstPlugin({
			layerOverride: (id) => {
				if (id.includes("/packages/ds/")) return "sx"
				if (id.includes("/packages/app/")) return "app"
				return null
			},
		})

		const codeLib = callTransform(plugin, DYNAMIC_SRC, "/packages/ds/button.tsx")
		const codeApp = callTransform(plugin, DYNAMIC_SRC, "/packages/app/page.tsx")

		expect(codeLib).toContain('"user.lib"')
		expect(codeApp).toContain('"user.app"')
	})
})

/* ── Static sx — layer in emitted CSS asset ──────────────────────── */

describe.concurrent("layer selection — CSS layer in generateBundle output", () => {
	function emitCss(plugin: SxPlugin, id: string): string {
		callTransform(
			plugin,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			id,
		)
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

	it("lib-origin module → rule lands in @layer sx block", () => {
		const plugin = createSxAstPlugin({})
		const css = emitCss(plugin, "/node_modules/lib/button.tsx")
		expect(css).toContain("@layer sx")
	})

	it("consumer-origin module → rule lands in @layer app block", () => {
		const plugin = createSxAstPlugin({})
		const css = emitCss(plugin, "/src/page.tsx")
		expect(css).toContain("@layer app")
	})

	it("both origins in one build → both @layer sx and @layer app present", () => {
		const plugin = createSxAstPlugin({})
		callTransform(
			plugin,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/node_modules/lib/button.tsx",
		)
		callTransform(
			plugin,
			`export default function B() { return <div sx={{ margin: "8px" }} /> }`,
			"/src/page.tsx",
		)
		const emitted: Array<{ fileName: string; source: string }> = []
		const ctx = {
			emitFile(f: { type: string; fileName: string; source: string }) {
				emitted.push(f)
			},
		}
		const gb = plugin.generateBundle as unknown as (this: typeof ctx) => void
		gb.call(ctx)
		const css = emitted.find((f) => f.fileName.endsWith("flare-global.css"))?.source ?? ""

		expect(css).toContain("@layer sx")
		expect(css).toContain("@layer app")
	})
})
