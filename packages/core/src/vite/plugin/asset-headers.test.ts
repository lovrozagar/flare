import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { assetHeaders, assetHeadersPlugin } from "./asset-headers.ts"

const BLOCK = "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n"

const dirs: string[] = []
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// The rule Flare adds, alone or after the app's own rules; an app rule for the same path wins (B130).
it("asset headers", () => {
	expect(assetHeaders(undefined, "assets")).toEqual({ text: BLOCK, conflict: false })
	const own = "/docs/*\n  X-Robots-Tag: noindex\n"
	expect(assetHeaders(own, "assets")).toEqual({ text: `${own}\n${BLOCK}`, conflict: false })
	expect(assetHeaders("/*\n  X-Frame-Options: DENY", "static")).toEqual({
		text: "/*\n  X-Frame-Options: DENY\n\n/static/*\n  Cache-Control: public, max-age=31536000, immutable\n",
		conflict: false,
	})
	const mine = "/assets/*\n  Cache-Control: no-cache\n"
	expect(assetHeaders(mine, "assets")).toEqual({ text: mine, conflict: true })
})

// The Workers client build writes it beside the assets, merged with a `_headers` the app's public dir put there, and
// warns once when the app has its own rule for the assets; any other build, and a Node or Bun app, writes nothing.
it("asset headers written", () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-headers-"))
	dirs.push(dir)
	const warn = vi.fn<(message: string) => void>()
	// One plugin per setup, as a build makes it once.
	const plugins = { true: assetHeadersPlugin(() => true), false: assetHeadersPlugin(() => false) }
	const run = (cloudflare: boolean, name = "client") => {
		const hook = plugins[String(cloudflare) as "true" | "false"].writeBundle
		if (typeof hook !== "function") throw new Error("writeBundle")
		const context = { environment: { name, config: { root: dir, build: { outDir: ".", assetsDir: "assets" } } }, warn }
		Reflect.apply(hook, context, [{}, {}])
	}
	run(false)
	run(true, "ssr")
	expect(existsSync(join(dir, "_headers"))).toBe(false)
	run(true)
	expect(readFileSync(join(dir, "_headers"), "utf8")).toBe(BLOCK)
	writeFileSync(join(dir, "_headers"), "/docs/*\n  X-Robots-Tag: noindex\n")
	run(true)
	expect(readFileSync(join(dir, "_headers"), "utf8")).toBe(`/docs/*\n  X-Robots-Tag: noindex\n\n${BLOCK}`)
	writeFileSync(join(dir, "_headers"), "/assets/*\n  Cache-Control: no-cache\n")
	run(true)
	run(true)
	expect(readFileSync(join(dir, "_headers"), "utf8")).toBe("/assets/*\n  Cache-Control: no-cache\n")
	expect(warn).toHaveBeenCalledOnce()
	expect(warn.mock.calls[0]?.[0]).toContain("/assets/*")
})
