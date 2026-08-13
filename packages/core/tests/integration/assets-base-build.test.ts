/** @vitest-environment node */
import { rm, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect, beforeEach } from "vitest"
import { build } from "vite"

const FIXTURE_DIR = new URL("../fixtures/assets-base", import.meta.url).pathname
const DIST_CLIENT = join(FIXTURE_DIR, "dist/client")

async function cleanDist() {
	await rm(join(FIXTURE_DIR, "dist"), { force: true, recursive: true })
}

async function runBuild(assetsBase?: string) {
	const env = { ...process.env }
	if (assetsBase) {
		process.env.FLARE_ASSETS_BASE_TEST = assetsBase
	} else {
		delete process.env.FLARE_ASSETS_BASE_TEST
	}
	try {
		await build({
			configFile: join(FIXTURE_DIR, "vite.config.ts"),
			logLevel: "silent",
		})
	} finally {
		process.env = env
	}
}

describe.sequential("assets-base integration build", () => {
	beforeEach(cleanDist)

	it("build-default-emits-under-/assets", async () => {
		await runBuild()

		const html = await readFile(join(DIST_CLIENT, "index.html"), "utf-8")

		/* Every script src and link href in built HTML must start with /assets/ */
		const scriptSrcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1])
		const linkHrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
		const assetRefs = [...scriptSrcs, ...linkHrefs].filter((r) => r.startsWith("/"))

		expect(assetRefs.length).toBeGreaterThan(0)
		for (const ref of assetRefs) {
			expect(ref).toMatch(/^\/assets\//)
		}

		/* sw.js must exist and contain the default cache rule */
		const swPath = join(DIST_CLIENT, "sw.js")
		expect(existsSync(swPath)).toBe(true)
		const swSrc = await readFile(swPath, "utf-8")
		expect(swSrc).toContain('startsWith("/assets/")')
	})

	it("build-emits-assets-under-custom-base", async () => {
		await runBuild("/app/assets")

		const html = await readFile(join(DIST_CLIENT, "index.html"), "utf-8")

		const scriptSrcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1])
		const linkHrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
		const assetRefs = [...scriptSrcs, ...linkHrefs].filter((r) => r.startsWith("/"))

		expect(assetRefs.length).toBeGreaterThan(0)
		for (const ref of assetRefs) {
			expect(ref).toMatch(/^\/app\/assets\//)
		}

		/* sw.js must contain the custom cache rule */
		const swPath = join(DIST_CLIENT, "sw.js")
		expect(existsSync(swPath)).toBe(true)
		const swSrc = await readFile(swPath, "utf-8")
		expect(swSrc).toContain('startsWith("/app/assets/")')
		expect(swSrc).not.toContain('startsWith("/assets/")')

		/* at least one image variant URL in bundled JS must use /app/assets/ */
		const jsFiles = (await import("node:fs/promises").then((m) => m.readdir(DIST_CLIENT))).filter(
			(f) => f.endsWith(".js"),
		)
		let foundImageVariant = false
		for (const f of jsFiles) {
			const src = await readFile(join(DIST_CLIENT, f), "utf-8")
			if (src.includes("/app/assets/") && src.includes(".webp")) {
				foundImageVariant = true
				break
			}
		}
		expect(foundImageVariant).toBe(true)
	})
})
