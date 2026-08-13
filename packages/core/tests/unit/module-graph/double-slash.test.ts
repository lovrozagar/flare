import { describe, expect, it } from "vitest"
import { resolveModulePreloads, resolveRoutePreloads } from "../../../src/module-graph/index.ts"
import type { ViteManifest } from "../../../src/module-graph/index.ts"

/**
 * Bug 73: resolveModulePreloads produces protocol-relative URLs
 *
 * When a Vite manifest entry has file: "/assets/main.js" (with leading slash),
 * prepending "/" produces "//assets/main.js" — a protocol-relative URL that
 * points to a different host (https://assets/main.js) in browsers.
 */

describe("Bug 73: module-graph double-slash prevention", () => {
	it("should not produce double-slash URLs from manifest entries with leading slash", () => {
		const manifest: ViteManifest = {
			"src/entry.tsx": {
				file: "/assets/entry-abc123.js",
				isEntry: true,
			},
		}

		const result = resolveModulePreloads(manifest, "src/entry.tsx")
		/* Should be /assets/entry-abc123.js, NOT //assets/entry-abc123.js */
		expect(result.js[0]).toBe("/assets/entry-abc123.js")
		expect(result.js[0]?.startsWith("//")).toBe(false)
	})

	it("should handle normal manifest entries (no leading slash) correctly", () => {
		const manifest: ViteManifest = {
			"src/entry.tsx": {
				file: "assets/entry-abc123.js",
				isEntry: true,
			},
		}

		const result = resolveModulePreloads(manifest, "src/entry.tsx")
		expect(result.js[0]).toBe("/assets/entry-abc123.js")
	})

	it("should not produce double-slash for CSS entries with leading slash", () => {
		const manifest: ViteManifest = {
			"src/entry.tsx": {
				css: ["/assets/style-xyz.css"],
				file: "assets/entry.js",
				isEntry: true,
			},
		}

		const result = resolveModulePreloads(manifest, "src/entry.tsx")
		expect(result.css[0]).toBe("/assets/style-xyz.css")
		expect(result.css[0]?.startsWith("//")).toBe(false)
	})

	it("resolveRoutePreloads should not produce double-slash", () => {
		const manifest: ViteManifest = {
			"src/routes/about.tsx": {
				file: "/assets/about-abc.js",
			},
		}

		const result = resolveRoutePreloads(manifest, ["src/routes/about.tsx"])
		expect(result.js[0]).toBe("/assets/about-abc.js")
		expect(result.js[0]?.startsWith("//")).toBe(false)
	})
})
