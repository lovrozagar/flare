import { describe, expect, it, vi } from "vitest"
import type { ViteManifest } from "../../../src/module-graph/index.ts"
import {
	computeBuildId,
	createServiceWorkerDisabledPlugin,
	createServiceWorkerPlugin,
	extractPrecacheUrls,
	normalizeSwConfig,
	type ServiceWorkerConfig,
} from "../../../src/plugins/service-worker.ts"

describe("SW plugin utilities", () => {
	describe("normalizeSwConfig", () => {
		it("returns undefined for false", () => {
			expect(normalizeSwConfig(false)).toBeUndefined()
		})

		it("returns undefined for undefined", () => {
			expect(normalizeSwConfig(undefined)).toBeUndefined()
		})

		it("returns defaults for true", () => {
			const result = normalizeSwConfig(true)
			expect(result).toBeDefined()
			expect(result?.skipWaiting).toBe(true)
			expect(result?.scope).toBe("/")
			expect(result?.runtimeCacheMax).toBe(32)
			expect(result?.offlineFallback).toBeUndefined()
		})

		it("merges user config with defaults", () => {
			const result = normalizeSwConfig({ offlineFallback: "/offline", skipWaiting: false })
			expect(result?.skipWaiting).toBe(false)
			expect(result?.offlineFallback).toBe("/offline")
			expect(result?.scope).toBe("/")
			expect(result?.runtimeCacheMax).toBe(32)
		})

		it("respects custom runtimeCacheMax", () => {
			const result = normalizeSwConfig({ runtimeCacheMax: 64 })
			expect(result?.runtimeCacheMax).toBe(64)
		})

		it("respects custom scope", () => {
			const result = normalizeSwConfig({ scope: "/app/" })
			expect(result?.scope).toBe("/app/")
		})
	})

	describe("extractPrecacheUrls", () => {
		it("extracts all file values from manifest", () => {
			const manifest: ViteManifest = {
				"src/client.tsx": {
					file: "assets/client-abc.js",
					isEntry: true,
				},
				"src/routes/index.tsx": {
					file: "assets/index-def.js",
					isDynamicEntry: true,
				},
			}

			const urls = extractPrecacheUrls(manifest)
			expect(urls).toContain("/assets/client-abc.js")
			expect(urls).toContain("/assets/index-def.js")
		})

		it("includes CSS files from manifest entries", () => {
			const manifest: ViteManifest = {
				"src/routes/about.tsx": {
					css: ["assets/about-xyz.css"],
					file: "assets/about-abc.js",
				},
			}

			const urls = extractPrecacheUrls(manifest)
			expect(urls).toContain("/assets/about-abc.js")
			expect(urls).toContain("/assets/about-xyz.css")
		})

		it("deduplicates URLs", () => {
			const manifest: ViteManifest = {
				"_shared.js": {
					css: ["assets/shared.css"],
					file: "assets/shared.js",
				},
				"src/page.tsx": {
					css: ["assets/shared.css"],
					file: "assets/page.js",
				},
			}

			const urls = extractPrecacheUrls(manifest)
			const cssCount = urls.filter((u) => u === "/assets/shared.css").length
			expect(cssCount).toBe(1)
		})

		it("returns empty array for empty manifest", () => {
			expect(extractPrecacheUrls({})).toEqual([])
		})

		it("prepends / to file paths", () => {
			const manifest: ViteManifest = {
				"entry.js": { file: "assets/entry.js" },
			}

			const urls = extractPrecacheUrls(manifest)
			expect(urls[0]).toBe("/assets/entry.js")
		})
	})

	describe("computeBuildId", () => {
		it("produces consistent hash for same input", () => {
			const urls = ["/assets/a.js", "/assets/b.css"]
			expect(computeBuildId(urls)).toBe(computeBuildId(urls))
		})

		it("produces different hash for different input", () => {
			const a = computeBuildId(["/assets/a.js"])
			const b = computeBuildId(["/assets/b.js"])
			expect(a).not.toBe(b)
		})

		it("sorts URLs before hashing (order-independent)", () => {
			const a = computeBuildId(["/assets/b.js", "/assets/a.js"])
			const b = computeBuildId(["/assets/a.js", "/assets/b.js"])
			expect(a).toBe(b)
		})

		it("returns a hex string", () => {
			const id = computeBuildId(["/assets/x.js"])
			expect(id).toMatch(/^[0-9a-f]+$/)
		})

		it("returns reasonable length hash (8-16 chars)", () => {
			const id = computeBuildId(["/assets/x.js"])
			expect(id.length).toBeGreaterThanOrEqual(8)
			expect(id.length).toBeLessThanOrEqual(16)
		})
	})
})

describe("SW plugin config type", () => {
	it("ServiceWorkerConfig has expected shape", () => {
		const config: ServiceWorkerConfig = {
			offlineFallback: "/offline",
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		}
		expect(config.offlineFallback).toBe("/offline")
		expect(config.runtimeCacheMax).toBe(32)
		expect(config.scope).toBe("/")
		expect(config.skipWaiting).toBe(true)
	})

	it("ServiceWorkerConfig fields are all optional", () => {
		const config: ServiceWorkerConfig = {}
		expect(config.offlineFallback).toBeUndefined()
		expect(config.runtimeCacheMax).toBeUndefined()
		expect(config.scope).toBeUndefined()
		expect(config.skipWaiting).toBeUndefined()
	})
})

describe("createServiceWorkerPlugin", () => {
	it("has correct plugin name", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		})
		expect(plugin.name).toBe("flare:service-worker")
	})

	it("resolves virtual:flare-sw-config", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		})
		expect(plugin.resolveId?.("virtual:flare-sw-config")).toBe("\0virtual:flare-sw-config")
	})

	it("does not resolve unrelated virtual modules", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		})
		expect(plugin.resolveId?.("virtual:flare-config")).toBeNull()
		expect(plugin.resolveId?.("other-module")).toBeNull()
	})

	it("loads virtual:flare-sw-config with enabled: true", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/app/",
			skipWaiting: true,
		})
		const result = plugin.load?.("\0virtual:flare-sw-config")
		expect(result).toBeTruthy()
		if (typeof result !== "object" || result === null || !("code" in result)) return
		expect(result.moduleType).toBe("js")
		expect(result.code).toContain("enabled")
		expect(result.code).toContain("true")
		expect(result.code).toContain("/sw.js")
		expect(result.code).toContain("/app/")
	})

	it("loads null for unrelated virtual module", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		})
		expect(plugin.load?.("\0virtual:flare-config")).toBeNull()
	})

	it("configureServer serves dev SW at /sw.js", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		})

		let handler:
			| ((req: { url?: string }, res: Record<string, unknown>, next: () => void) => void)
			| undefined
		const mockServer = {
			middlewares: {
				use: (fn: typeof handler) => {
					handler = fn
				},
			},
		}

		plugin.configureServer?.(mockServer)
		expect(handler).toBeDefined()

		/* Should serve sw.js */
		const headers: Record<string, string> = {}
		let ended = false
		let body = ""
		const mockRes = {
			end: (data: string) => {
				ended = true
				body = data
			},
			writeHead: (_: number, h: Record<string, string>) => {
				Object.assign(headers, h)
			},
		}

		handler?.({ url: "/sw.js" }, mockRes, () => {})
		expect(ended).toBe(true)
		expect(headers["content-type"]).toBe("application/javascript")
		expect(headers["cache-control"]).toBe("no-cache")
		expect(body).toContain("skipWaiting")
		expect(body).toContain("clients.claim")
	})

	it("configureServer passes through non-sw.js requests", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		})

		let handler:
			| ((req: { url?: string }, res: Record<string, unknown>, next: () => void) => void)
			| undefined
		const mockServer = {
			middlewares: {
				use: (fn: typeof handler) => {
					handler = fn
				},
			},
		}

		plugin.configureServer?.(mockServer)

		let nextCalled = false
		handler?.({ url: "/about" }, {}, () => {
			nextCalled = true
		})
		expect(nextCalled).toBe(true)
	})

	it("closeBundle skips for non-ssr environment", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		})

		/* Should not throw when envName !== "ssr" */
		const closeBundle = plugin.closeBundle as (this: unknown) => void
		expect(() => closeBundle.call({ environment: { name: "client" } })).not.toThrow()
	})

	it("closeBundle skips when no manifest exists", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		})

		const closeBundle = plugin.closeBundle as (this: unknown) => void
		/* root with no dist/client/.vite/manifest.json */
		expect(() =>
			closeBundle.call({
				environment: { config: { root: "/tmp/nonexistent-test-dir" }, name: "ssr" },
			}),
		).not.toThrow()
	})

	it("configurePreviewServer registers middleware", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		})

		let handler: unknown
		const mockServer = {
			config: { root: "/tmp/nonexistent" },
			middlewares: {
				use: (fn: unknown) => {
					handler = fn
				},
			},
		}

		plugin.configurePreviewServer?.(mockServer)
		expect(handler).toBeDefined()
	})

	it("configurePreviewServer passes through when sw.js does not exist", () => {
		const plugin = createServiceWorkerPlugin({
			runtimeCacheMax: 32,
			scope: "/",
			skipWaiting: true,
		})

		let handler:
			| ((req: { url?: string }, res: Record<string, unknown>, next: () => void) => void)
			| undefined
		const mockServer = {
			config: { root: "/tmp/nonexistent-root-xyz" },
			middlewares: {
				use: (fn: typeof handler) => {
					handler = fn
				},
			},
		}

		plugin.configurePreviewServer?.(mockServer)

		let nextCalled = false
		handler?.({ url: "/sw.js" }, {}, () => {
			nextCalled = true
		})
		expect(nextCalled).toBe(true)
	})
})

describe("createServiceWorkerDisabledPlugin", () => {
	it("has correct plugin name", () => {
		const plugin = createServiceWorkerDisabledPlugin()
		expect(plugin.name).toBe("flare:service-worker")
	})

	it("resolves virtual:flare-sw-config", () => {
		const plugin = createServiceWorkerDisabledPlugin()
		expect(plugin.resolveId?.("virtual:flare-sw-config")).toBe("\0virtual:flare-sw-config")
	})

	it("loads virtual:flare-sw-config with enabled: false", () => {
		const plugin = createServiceWorkerDisabledPlugin()
		const result = plugin.load?.("\0virtual:flare-sw-config")
		expect(result).toBeTruthy()
		if (typeof result !== "object" || result === null || !("code" in result)) return
		expect(result.moduleType).toBe("js")
		expect(result.code).toContain("enabled")
		expect(result.code).toContain("false")
	})

	it("does not include path or scope when disabled", () => {
		const plugin = createServiceWorkerDisabledPlugin()
		const result = plugin.load?.("\0virtual:flare-sw-config")
		expect(result).toBeTruthy()
		if (typeof result !== "object" || result === null || !("code" in result)) return
		expect(result.code).not.toContain("/sw.js")
	})

	it("does not resolve unrelated modules", () => {
		const plugin = createServiceWorkerDisabledPlugin()
		expect(plugin.resolveId?.("virtual:flare-config")).toBeNull()
	})

	it("returns null for unrelated load", () => {
		const plugin = createServiceWorkerDisabledPlugin()
		expect(plugin.load?.("\0virtual:flare-config")).toBeNull()
	})

	it("has no configureServer hook", () => {
		const plugin = createServiceWorkerDisabledPlugin()
		expect(plugin.configureServer).toBeUndefined()
	})

	it("has no closeBundle hook", () => {
		const plugin = createServiceWorkerDisabledPlugin()
		expect(plugin.closeBundle).toBeUndefined()
	})
})
