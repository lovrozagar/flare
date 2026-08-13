/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { createSxAstPlugin } from "../../../../src/plugins/sx-ast/index.ts"
import type { SxAstOptions } from "../../../../src/plugins/sx-ast/index.ts"

function makePlugin(opts?: SxAstOptions) {
	return createSxAstPlugin(opts ?? {})
}

/* Minimal Vite-compatible transform context */
interface TransformCtx {
	environment?: { name?: string }
}

function callTransform(plugin: ReturnType<typeof makePlugin>, code: string, id: string): { code: string; map: null } | null {
	const fn = plugin.transform as (this: TransformCtx, code: string, id: string) => { code: string; map: null } | null
	return fn.call({}, code, id)
}

describe("createSxAstPlugin — transform", () => {
	it("returns null for non-JSX files", () => {
		const plugin = makePlugin()
		const result = callTransform(plugin, `const x = 1`, "/src/foo.ts")
		expect(result).toBeNull()
	})

	it("returns null for JSX files with no sx/css/class patterns", () => {
		const plugin = makePlugin()
		const result = callTransform(plugin, `export default function A() { return <div id="x" /> }`, "/src/foo.tsx")
		expect(result).toBeNull()
	})

	it("transforms TSX with sx= attr", () => {
		const plugin = makePlugin()
		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const result = callTransform(plugin, src, "/src/foo.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("class=")
	})

	it("transforms JSX with sx= attr", () => {
		const plugin = makePlugin()
		const src = `export default function A() { return <div sx={{ color: "blue" }} /> }`
		const result = callTransform(plugin, src, "/src/foo.jsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
	})
})

describe("createSxAstPlugin — layer detection", () => {
	it("node_modules path → layer 'sx' → emits user.lib arg", () => {
		const plugin = makePlugin()
		const src = `export default function A({ s }: { s: object }) { return <div sx={s} /> }`
		const result = callTransform(plugin, src, "/node_modules/my-lib/src/Button.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('"user.lib"')
	})

	it("app path → layer 'app' → emits user.app arg", () => {
		const plugin = makePlugin()
		const src = `export default function A({ s }: { s: object }) { return <div sx={s} /> }`
		const result = callTransform(plugin, src, "/src/components/Button.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('"user.app"')
	})

	it("custom libPaths overrides node_modules default", () => {
		const plugin = makePlugin({ libPaths: ["/packages/design-system/"] })
		const src = `export default function A({ s }: { s: object }) { return <div sx={s} /> }`
		const result = callTransform(plugin, src, "/packages/design-system/src/Button.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('"user.lib"')
	})

	it("layerOverride takes precedence", () => {
		const plugin = makePlugin({ layerOverride: () => "sx" })
		const src = `export default function A({ s }: { s: object }) { return <div sx={s} /> }`
		const result = callTransform(plugin, src, "/src/Button.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('"user.lib"')
	})
})

describe("createSxAstPlugin — generateBundle CSS emission", () => {
	it("emits flare-global.css asset with @layer prelude", async () => {
		const plugin = makePlugin()

		/* Prime the plugin with a transform so the class pool has content */
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/A.tsx")

		const emitted: Array<{ type: string; fileName: string; source: string }> = []
		const ctx = {
			emitFile(file: { type: string; fileName: string; source: string }) {
				emitted.push(file)
			},
			getModuleIds() {
				return ["/src/A.tsx"][Symbol.iterator]()
			},
			getModuleInfo(_id: string) {
				return { isEntry: false }
			},
		}

		const genBundle = plugin.generateBundle as unknown as (
			this: typeof ctx,
			options: object,
			bundle: object,
		) => Promise<void> | void

		await genBundle.call(ctx, {}, {})

		const cssAsset = emitted.find((f) => f.fileName === "flare-global.css")
		expect(cssAsset).toBeDefined()
		if (!cssAsset) return
		expect(cssAsset.source).toContain("@layer")
	})
})

describe("createSxAstPlugin — layerOverride returning null falls back to libPaths", () => {
	it("layerOverride returns null → falls back to libPaths heuristic", () => {
		/* override returns null → resolveLayer falls through to libPaths check */
		const plugin = makePlugin({
			layerOverride: () => null,
			libPaths: ["/my-lib/"],
		})
		const src = `export default function A({ s }: { s: object }) { return <div sx={s} /> }`
		const result = callTransform(plugin, src, "/my-lib/src/Button.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('"user.lib"')
	})

	it("layerOverride returns null + app path → layer 'app'", () => {
		const plugin = makePlugin({ layerOverride: () => null })
		const src = `export default function A({ s }: { s: object }) { return <div sx={s} /> }`
		const result = callTransform(plugin, src, "/src/app/Button.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('"user.app"')
	})
})

describe("createSxAstPlugin — configResolved sets prod mode", () => {
	it("configResolved with command=build → prod class names (a1- prefix)", () => {
		const plugin = makePlugin()
		/* Call configResolved to switch to prod mode */
		const configResolved = plugin.configResolved as (config: { command: string }) => void
		configResolved({ command: "build" })

		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const result = callTransform(plugin, src, "/src/foo.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toMatch(/class="a1-[a-z0-9]{8}"/)
	})

	it("configResolved with command=serve → dev class names (sx- prefix)", () => {
		const plugin = makePlugin()
		const configResolved = plugin.configResolved as (config: { command: string }) => void
		configResolved({ command: "serve" })

		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const result = callTransform(plugin, src, "/src/foo.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toMatch(/class="sx-color-red-\w+"/)
	})
})

describe("createSxAstPlugin — generateBundle CSS composition", () => {
	it("sx-layer modules → rules wrapped in @layer sx", async () => {
		const plugin = makePlugin({ libPaths: ["/lib/"] })

		/* Transform from a lib path → layer "sx" */
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/lib/src/A.tsx")

		const emitted: Array<{ type: string; fileName: string; source: string }> = []
		const ctx = {
			emitFile(file: { type: string; fileName: string; source: string }) {
				emitted.push(file)
			},
			getModuleIds() { return ["/lib/src/A.tsx"][Symbol.iterator]() },
			getModuleInfo(_id: string) { return { isEntry: false } },
		}
		const genBundle = plugin.generateBundle as unknown as (
			this: typeof ctx,
			options: object,
			bundle: object,
		) => void
		genBundle.call(ctx, {}, {})

		const css = emitted.find((f) => f.fileName === "flare-global.css")
		expect(css).toBeDefined()
		expect(css?.source).toContain("@layer sx")
	})

	it("app-layer modules → rules wrapped in @layer app", async () => {
		const plugin = makePlugin()

		callTransform(plugin, `export default function A() { return <div sx={{ margin: "0" }} /> }`, "/src/A.tsx")

		const emitted: Array<{ type: string; fileName: string; source: string }> = []
		const ctx = {
			emitFile(file: { type: string; fileName: string; source: string }) {
				emitted.push(file)
			},
			getModuleIds() { return ["/src/A.tsx"][Symbol.iterator]() },
			getModuleInfo(_id: string) { return { isEntry: false } },
		}
		const genBundle = plugin.generateBundle as unknown as (
			this: typeof ctx,
			options: object,
			bundle: object,
		) => void
		genBundle.call(ctx, {}, {})

		const css = emitted.find((f) => f.fileName === "flare-global.css")
		expect(css).toBeDefined()
		expect(css?.source).toContain("@layer app")
	})

	it("empty class pool → emits just the @layer prelude", async () => {
		const plugin = makePlugin()
		/* No transforms — pool is empty */

		const emitted: Array<{ type: string; fileName: string; source: string }> = []
		const ctx = {
			emitFile(file: { type: string; fileName: string; source: string }) {
				emitted.push(file)
			},
			getModuleIds() { return [][Symbol.iterator]() },
			getModuleInfo(_id: string) { return { isEntry: false } },
		}
		const genBundle = plugin.generateBundle as unknown as (
			this: typeof ctx,
			options: object,
			bundle: object,
		) => void
		genBundle.call(ctx, {}, {})

		const css = emitted.find((f) => f.fileName === "flare-global.css")
		expect(css).toBeDefined()
		expect(css?.source).toContain("@layer reset, sx, app")
		/* No actual layer blocks when pool is empty */
		expect(css?.source).not.toContain("@layer sx {")
		expect(css?.source).not.toContain("@layer app {")
	})
})

describe("createSxAstPlugin — transform returns null when rewriteModule finds no changes (line 142)", () => {
	it("TSX file with 'class=' only in a JS string literal → outer filter passes, rewriteModule returns null", () => {
		/*
		 * code.includes("class=") → true (passes outer quick filter, line 120).
		 * rewriteModule walks AST — no JSX attrs require rewriting → changed=false → returns null.
		 * transform() hits `if (result === null) return null` at line 142.
		 */
		const plugin = makePlugin()
		const src = `const note = "class=foo"; export default function A() { return <div id="x" /> }`
		const result = callTransform(plugin, src, "/src/foo.tsx")
		expect(result).toBeNull()
	})
})

describe("createSxAstPlugin — dev mode CSS injection snippet (line 74 branch)", () => {
	it("dev mode + static sx → emits document.getElementById injection snippet", () => {
		const plugin = makePlugin()
		/* Default mode is dev */
		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const result = callTransform(plugin, src, "/src/A.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		/* Dev-mode CSS injection appended after transformed code */
		expect(result.code).toContain("flare-sx-dev")
		expect(result.code).toContain("document.getElementById")
	})

	it("prod mode → no flare-sx-dev injection snippet", () => {
		const plugin = makePlugin()
		const configResolved = plugin.configResolved as (config: { command: string }) => void
		configResolved({ command: "build" })

		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const result = callTransform(plugin, src, "/src/A.tsx")
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("flare-sx-dev")
	})
})

describe("createSxAstPlugin — manifest option", () => {
	it("manifest: true emits flare-sx-manifest.json", async () => {
		const plugin = makePlugin({ manifest: true })
		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/A.tsx")

		const emitted: Array<{ fileName: string; source: string }> = []
		const ctx = {
			emitFile(file: { fileName: string; source: string }) {
				emitted.push(file)
			},
			getModuleIds() { return ["/src/A.tsx"][Symbol.iterator]() },
			getModuleInfo(_id: string) { return { isEntry: false } },
		}

		const genBundle = plugin.generateBundle as unknown as (
			this: typeof ctx,
			options: object,
			bundle: object,
		) => Promise<void> | void

		await genBundle.call(ctx, {}, {})

		const manifest = emitted.find((f) => f.fileName === "flare-sx-manifest.json")
		expect(manifest).toBeDefined()
		if (!manifest) return
		const parsed = JSON.parse(manifest.source) as {
			version: number
			hashVersion: string
			rules: Record<string, string>
			layerByRule: Record<string, string>
			moduleManifest: Record<string, string[]>
			bundleHref: string
		}
		expect(parsed.version).toBe(1)
		expect(parsed.hashVersion).toBe("a1")
		expect(typeof parsed.rules).toBe("object")
		expect(typeof parsed.layerByRule).toBe("object")
		expect(typeof parsed.moduleManifest).toBe("object")
		expect(typeof parsed.bundleHref).toBe("string")
	})
})
