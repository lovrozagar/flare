import type { Plugin } from "vite"
import { describe, expect, it, vi } from "vitest"
import type { VitePlugin } from "../../../src/plugins/index.ts"

vi.mock("vite-plugin-solid", () => ({
	default: (opts: Record<string, unknown>) => ({ config: () => ({ solid: opts }), name: "solid" }),
}))

import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll } from "vitest"

const _stubs: string[] = []
const _stubDirs: string[] = []
for (const name of ["src/client.tsx", "src/server.ts"]) {
	const p = join(process.cwd(), name)
	if (!existsSync(p)) {
		writeFileSync(p, "/* test stub */")
		_stubs.push(p)
	}
}
const distDir = join(process.cwd(), "dist")
if (!existsSync(distDir)) {
	mkdirSync(distDir, { recursive: true })
	_stubDirs.push(distDir)
}

afterAll(() => {
	for (const p of _stubs)
		try {
			unlinkSync(p)
		} catch {}
	for (const d of _stubDirs)
		try {
			rmdirSync(d)
		} catch {}
})

vi.mock("../../../src/generators", () => ({
	buildRouteTree: vi.fn(() => ({ s: {} })),
	deriveVirtualPath: vi.fn(() => "_root_/test"),
	detectRouteType: vi.fn(() => "page"),
	extractCacheFromChain: vi.fn(() => ({})),
	extractRouteDefinitions: vi.fn(() => []),
	generateLayoutsRecord: vi.fn(),
	generateRouteInserts: vi.fn(),
	generateRoutesFile: vi.fn(),
	generateVirtualModuleTypes: vi.fn(() => ""),
	runGenerate: vi.fn(() => ({ layouts: 0, routes: 0 })),
	scanSourceFiles: vi.fn(() => []),
	scanSourceFilesFsCodegen: vi.fn(() => []),
	serializeTreeNode: vi.fn(() => "{ s: E }"),
	validateRouteDefinitions: vi.fn(() => []),
	writeRouteDeclaration: vi.fn(),
}))

import { flare } from "../../../src/plugins/index.ts"

function isPlugin(p: import("vite").PluginOption): p is VitePlugin {
	return typeof p === "object" && p !== null && "name" in p
}

function findPlugin(plugins: import("vite").PluginOption[], name: string): VitePlugin | undefined {
	return plugins.filter(isPlugin).find((p) => p.name === name)
}

describe("flare() purge integration", () => {
	describe("purge.console via transform", () => {
		it("purge: true → purge plugin present with transform hook", () => {
			const plugins = flare({ purge: true })
			const plugin = findPlugin(plugins, "flare:purge")
			expect(plugin).toBeDefined()
			expect(plugin?.transform).toBeDefined()
		})

		it("purge: { console: true } → strips console.log and console.debug in prod", () => {
			const plugins = flare({ purge: { console: true } })
			const plugin = findPlugin(plugins, "flare:purge")
			expect(plugin).toBeDefined()

			const ctx = { environment: { config: { mode: "production" } } }
			const transform = plugin?.transform as (
				this: typeof ctx,
				code: string,
				id: string,
			) => { code: string; map: null } | null
			const result = transform.call(ctx, 'console.log("a"); console.debug("b");', "file.ts")
			expect(result).not.toBeNull()
			expect(result?.code).toBe("")
		})

		it("purge: { console: ['warn'] } → strips only console.warn", () => {
			const plugins = flare({ purge: { console: ["warn"] } })
			const plugin = findPlugin(plugins, "flare:purge")
			expect(plugin).toBeDefined()

			const ctx = { environment: { config: { mode: "production" } } }
			const transform = plugin?.transform as (
				this: typeof ctx,
				code: string,
				id: string,
			) => { code: string; map: null } | null
			const result = transform.call(ctx, 'console.warn("drop"); console.log("keep");', "file.ts")
			expect(result).not.toBeNull()
			expect(result?.code).toBe('console.log("keep");')
		})

		it("purge omitted → no purge plugin", () => {
			const plugins = flare({})
			const plugin = findPlugin(plugins, "flare:purge")
			expect(plugin).toBeUndefined()
		})

		it("purge: false → no purge plugin", () => {
			const plugins = flare({ purge: false })
			const plugin = findPlugin(plugins, "flare:purge")
			expect(plugin).toBeUndefined()
		})

		it("dev mode → transform returns null (no-op)", () => {
			const plugins = flare({ purge: { console: true } })
			const plugin = findPlugin(plugins, "flare:purge")
			expect(plugin).toBeDefined()

			const ctx = { environment: { config: { mode: "development" } } }
			const transform = plugin?.transform as (
				this: typeof ctx,
				code: string,
				id: string,
			) => { code: string; map: null } | null
			const result = transform.call(ctx, 'console.log("keep");', "file.ts")
			expect(result).toBeNull()
		})
	})

	describe("purge.debugger via transform", () => {
		it("purge: true → strips debugger in prod", () => {
			const plugins = flare({ purge: true })
			const plugin = findPlugin(plugins, "flare:purge")
			expect(plugin).toBeDefined()

			const ctx = { environment: { config: { mode: "production" } } }
			const transform = plugin?.transform as (
				this: typeof ctx,
				code: string,
				id: string,
			) => { code: string; map: null } | null
			const result = transform.call(ctx, "debugger;", "file.ts")
			expect(result).not.toBeNull()
			expect(result?.code).toBe("")
		})

		it("purge: { debugger: true, console: false } → only strips debugger", () => {
			const plugins = flare({ purge: { debugger: true } })
			const plugin = findPlugin(plugins, "flare:purge")
			expect(plugin).toBeDefined()

			const ctx = { environment: { config: { mode: "production" } } }
			const transform = plugin?.transform as (
				this: typeof ctx,
				code: string,
				id: string,
			) => { code: string; map: null } | null
			const result = transform.call(ctx, 'debugger; console.log("keep");', "file.ts")
			expect(result).not.toBeNull()
			expect(result?.code).toBe('console.log("keep");')
		})

		it("purge: { debugger: false } → no purge plugin", () => {
			const plugins = flare({ purge: { debugger: false } })
			const plugin = findPlugin(plugins, "flare:purge")
			expect(plugin).toBeUndefined()
		})
	})

	describe("purge.testIds plugin", () => {
		it("purge: true → purge-test-ids plugin present", () => {
			const plugins = flare({ purge: true })
			const plugin = findPlugin(plugins, "flare:purge-test-ids")
			expect(plugin).toBeDefined()
		})

		it("purge: { testIds: true } → purge-test-ids plugin present", () => {
			const plugins = flare({ purge: { testIds: true } })
			const plugin = findPlugin(plugins, "flare:purge-test-ids")
			expect(plugin).toBeDefined()
		})

		it("purge: { testIds: false } → no purge-test-ids plugin", () => {
			const plugins = flare({ purge: { testIds: false } })
			const plugin = findPlugin(plugins, "flare:purge-test-ids")
			expect(plugin).toBeUndefined()
		})

		it("purge omitted → no purge-test-ids plugin", () => {
			const plugins = flare({})
			const plugin = findPlugin(plugins, "flare:purge-test-ids")
			expect(plugin).toBeUndefined()
		})
	})

	describe("logLevel (flat, replaces console.{dev|prod}.logLevel)", () => {
		it("logLevel omitted → virtual module uses mode-based default", () => {
			const plugins = flare({})
			const virtualPlugin = findPlugin(plugins, "flare:virtual")
			expect(virtualPlugin).toBeDefined()
		})

		it("logLevel: 'verbose' → passed to virtual module", () => {
			const plugins = flare({ logLevel: "verbose" })
			const virtualPlugin = findPlugin(plugins, "flare:virtual")
			expect(virtualPlugin).toBeDefined()
		})
	})

	describe("dev.staticCache controls dev-prerender", () => {
		it("dev omitted → dev-prerender plugin present (default: staticCache on)", () => {
			const plugins = flare({})
			const plugin = findPlugin(plugins, "flare:dev-prerender")
			expect(plugin).toBeDefined()
		})

		it("dev: false → no dev-prerender plugin", () => {
			const plugins = flare({ dev: false })
			const plugin = findPlugin(plugins, "flare:dev-prerender")
			expect(plugin).toBeUndefined()
		})

		it("dev: { staticCache: false } → no dev-prerender plugin", () => {
			const plugins = flare({ dev: { staticCache: false } })
			const plugin = findPlugin(plugins, "flare:dev-prerender")
			expect(plugin).toBeUndefined()
		})

		it("dev: { staticCache: true, cdnCache: false } → dev-prerender present", () => {
			const plugins = flare({ dev: { cdnCache: false, staticCache: true } })
			const plugin = findPlugin(plugins, "flare:dev-prerender")
			expect(plugin).toBeDefined()
		})
	})

	describe("dev.cdnCache controls dev-cdn-cache", () => {
		it("dev omitted → dev-cdn-cache plugin present (default: cdnCache on)", () => {
			const plugins = flare({})
			const plugin = findPlugin(plugins, "flare:dev-cdn-cache")
			expect(plugin).toBeDefined()
		})

		it("dev: false → no dev-cdn-cache plugin", () => {
			const plugins = flare({ dev: false })
			const plugin = findPlugin(plugins, "flare:dev-cdn-cache")
			expect(plugin).toBeUndefined()
		})

		it("dev: { cdnCache: false } → no dev-cdn-cache plugin", () => {
			const plugins = flare({ dev: { cdnCache: false } })
			const plugin = findPlugin(plugins, "flare:dev-cdn-cache")
			expect(plugin).toBeUndefined()
		})

		it("dev: { cdnCache: true, staticCache: false } → cdn-cache present, prerender absent", () => {
			const plugins = flare({ dev: { cdnCache: true, staticCache: false } })
			const cdnPlugin = findPlugin(plugins, "flare:dev-cdn-cache")
			const prerenderPlugin = findPlugin(plugins, "flare:dev-prerender")
			expect(cdnPlugin).toBeDefined()
			expect(prerenderPlugin).toBeUndefined()
		})
	})

	describe("dev.serverTiming", () => {
		it("dev omitted → serverTiming defaults to true", () => {
			const plugins = flare({})
			expect(plugins.length).toBeGreaterThan(0)
		})

		it("dev: { serverTiming: false } → accepted", () => {
			const plugins = flare({ dev: { serverTiming: false } })
			expect(plugins.length).toBeGreaterThan(0)
		})
	})
})
