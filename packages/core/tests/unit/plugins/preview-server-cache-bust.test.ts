import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("preview server import cache-bust", () => {
	it("preview server import() uses cache-bust query param like prerender does", () => {
		/*
		 * Bug 77: `import(serverPath)` is cached by ESM runtime.
		 * Rebuilding without restarting `vite preview` serves stale handler.
		 * Prerender already fixed with `?t=${Date.now()}`.
		 * Preview server (createPreviewServerPlugin) must do the same.
		 *
		 * Find the import call inside createPreviewServerPlugin's getHandler,
		 * verify it includes a cache-bust query param.
		 */
		const devServerPath = join(__dirname, "../../../src/plugins/dev-server.ts")
		const source = readFileSync(devServerPath, "utf-8")
		const previewSection = source.slice(source.indexOf("function createPreviewServerPlugin"))

		/* The import call in getHandler must include a cache-bust param */
		const importMatch = previewSection.match(/import\((.+?)\)\.then/)
		expect(importMatch).not.toBeNull()

		const importArg = importMatch?.[1] ?? ""

		/* Must be a template literal with Date.now() or similar cache-bust */
		expect(importArg).toMatch(/Date\.now\(\)/)
	})

	it("prerender import already has cache-bust (regression guard)", () => {
		/* Ensure the prerender import still has its cache-bust */
		const prerenderPath = join(__dirname, "../../../src/plugins/prerender-plugin.ts")
		const source = readFileSync(prerenderPath, "utf-8")
		const prerenderImportMatch = source.match(/import\(`\$\{serverPath\}\?t=\$\{Date\.now\(\)\}`\)/)
		expect(prerenderImportMatch).not.toBeNull()
	})
})
