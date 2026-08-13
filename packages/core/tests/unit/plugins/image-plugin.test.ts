import { resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"

/* Mock vite-plugin-solid to avoid esbuild binary in jsdom */
vi.mock("vite-plugin-solid", () => ({
	default: () => ({ name: "solid" }),
}))

import { createImagePlugin } from "../../../src/plugins/index.ts"

describe("createImagePlugin", () => {
	const plugin = createImagePlugin()

	describe("resolveId — auto mode", () => {
		it("intercepts bare .jpg import", () => {
			expect(plugin.resolveId?.("/path/to/hero.jpg")).toBe("\0flare-image:/path/to/hero.jpg")
		})

		it("intercepts bare .png import", () => {
			expect(plugin.resolveId?.("/icon.png")).toBe("\0flare-image:/icon.png")
		})

		it("intercepts bare .webp import", () => {
			expect(plugin.resolveId?.("/photo.webp")).toBe("\0flare-image:/photo.webp")
		})

		it("intercepts bare .avif import", () => {
			expect(plugin.resolveId?.("/photo.avif")).toBe("\0flare-image:/photo.avif")
		})

		it("intercepts bare .jpeg import", () => {
			expect(plugin.resolveId?.("/photo.jpeg")).toBe("\0flare-image:/photo.jpeg")
		})

		it("intercepts bare .tiff import", () => {
			expect(plugin.resolveId?.("/scan.tiff")).toBe("\0flare-image:/scan.tiff")
		})

		it("case-insensitive extension (.JPG)", () => {
			expect(plugin.resolveId?.("/PHOTO.JPG")).toBe("\0flare-image:/PHOTO.JPG")
		})

		it("case-insensitive extension (.PNG)", () => {
			expect(plugin.resolveId?.("/icon.PNG")).toBe("\0flare-image:/icon.PNG")
		})
	})

	describe("resolveId — opt-out", () => {
		it("?url returns null (Vite handles)", () => {
			expect(plugin.resolveId?.("/hero.jpg?url")).toBeNull()
		})

		it("?raw returns null (Vite handles)", () => {
			expect(plugin.resolveId?.("/hero.jpg?raw")).toBeNull()
		})

		it("?url with extra params returns null", () => {
			expect(plugin.resolveId?.("/hero.jpg?url&inline")).toBeNull()
		})

		it("?raw with extra params returns null", () => {
			expect(plugin.resolveId?.("/hero.jpg?raw&inline")).toBeNull()
		})
	})

	describe("resolveId — SVG/GIF pass-through", () => {
		it("SVG silently passes through", () => {
			expect(plugin.resolveId?.("/icon.svg")).toBeNull()
		})

		it("GIF silently passes through", () => {
			expect(plugin.resolveId?.("/anim.gif")).toBeNull()
		})
	})

	describe("resolveId — exclude regex", () => {
		it("exclude regex skips matching paths", () => {
			const p = createImagePlugin({ image: { exclude: /vendor/ } })
			expect(p.resolveId?.("/vendor/logo.jpg")).toBeNull()
		})

		it("exclude regex allows non-matching paths", () => {
			const p = createImagePlugin({ image: { exclude: /vendor/ } })
			expect(p.resolveId?.("/assets/hero.jpg")).toBe("\0flare-image:/assets/hero.jpg")
		})

		it("exclude regex checked against resolved absolute path", () => {
			const p = createImagePlugin({ image: { exclude: /excluded/ } })
			const result = p.resolveId?.("./excluded/hero.jpg", "/project/src/page.tsx")
			expect(result).toBeNull()
		})
	})

	describe("resolveId — relative path resolution", () => {
		it("resolves relative paths using importer", () => {
			const result = plugin.resolveId?.("../assets/hero.jpg", "/project/src/routes/page.tsx")
			expect(result).toBe("\0flare-image:/project/src/assets/hero.jpg")
		})

		it("absolute paths unchanged regardless of importer", () => {
			const result = plugin.resolveId?.("/abs/hero.jpg", "/project/src/page.tsx")
			expect(result).toBe("\0flare-image:/abs/hero.jpg")
		})

		it("handles ./relative path (same directory)", () => {
			const result = plugin.resolveId?.("./hero.jpg", "/project/src/routes/page.tsx")
			expect(result).toBe("\0flare-image:/project/src/routes/hero.jpg")
		})

		it("handles deeply nested relative path", () => {
			const result = plugin.resolveId?.(
				"../../../../shared/assets/hero.jpg",
				"/project/src/features/blog/routes/page.tsx",
			)
			expect(result).toBe("\0flare-image:/project/shared/assets/hero.jpg")
		})

		it("relative path without importer uses raw path", () => {
			const result = plugin.resolveId?.("../assets/hero.jpg")
			expect(result).toBe("\0flare-image:../assets/hero.jpg")
		})

		it("non-string importer treated as no importer", () => {
			const result = plugin.resolveId?.("../assets/hero.jpg", 42)
			expect(result).toBe("\0flare-image:../assets/hero.jpg")
		})
	})

	describe("resolveId — edge cases", () => {
		it("returns null for unsupported extensions", () => {
			expect(plugin.resolveId?.("/data.json")).toBeNull()
			expect(plugin.resolveId?.("/styles.css")).toBeNull()
			expect(plugin.resolveId?.("/readme.md")).toBeNull()
		})

		it("handles path with dots in directory names", () => {
			expect(plugin.resolveId?.("/assets/v2.0/hero.jpg")).toBe(
				"\0flare-image:/assets/v2.0/hero.jpg",
			)
		})

		it("no extension returns null", () => {
			expect(plugin.resolveId?.("myfile")).toBeNull()
		})
	})

	describe("load", () => {
		it("returns null for non-flare-image ids", async () => {
			const ctx = { environment: { config: { mode: "production" } } }
			const result = await plugin.load?.call(ctx as never, "some-other-id")
			expect(result).toBeNull()
		})

		it("returns null for partial prefix match", async () => {
			const ctx = { environment: { config: { mode: "production" } } }
			const result = await plugin.load?.call(ctx as never, "\0flare-imageXXX:/path.jpg")
			expect(result).toBeNull()
		})

		it("returns null for empty string", async () => {
			const ctx = { environment: { config: { mode: "production" } } }
			const result = await plugin.load?.call(ctx as never, "")
			expect(result).toBeNull()
		})
	})

	describe("config", () => {
		it("respects custom quality", () => {
			const customPlugin = createImagePlugin({ image: { quality: 90 } })
			expect(customPlugin.name).toBe("flare:image")
		})

		it("respects custom widths", () => {
			const customPlugin = createImagePlugin({ image: { widths: [320, 640] } })
			expect(customPlugin.name).toBe("flare:image")
		})

		it("respects exclude option", () => {
			const customPlugin = createImagePlugin({ image: { exclude: /vendor/ } })
			expect(customPlugin.name).toBe("flare:image")
		})
	})

	describe("plugin shape", () => {
		it("has correct name", () => {
			expect(plugin.name).toBe("flare:image")
		})

		it("enforces pre", () => {
			expect(plugin.enforce).toBe("pre")
		})

		it("has resolveId, load, configureServer", () => {
			expect(plugin.resolveId).toBeTypeOf("function")
			expect(plugin.load).toBeTypeOf("function")
			expect(plugin.configureServer).toBeTypeOf("function")
		})
	})

	describe("load build mode (real sharp)", () => {
		const testImagePath = resolve(__dirname, "../../../../flare-e2e/src/assets/test-hero.jpg")

		it("build mode: emits WebP asset and returns correct module", async () => {
			const emitted: { fileName: string; source: Buffer; type: string }[] = []
			const ctx = {
				emitFile: (file: { fileName: string; source: Buffer; type: string }) => {
					emitted.push(file)
				},
				environment: { config: { mode: "production" } },
			}

			const result = await plugin.load?.call(ctx as never, `\0flare-image:${testImagePath}`)

			expect(result).toBeTruthy()
			if (typeof result !== "object" || result === null) return
			expect(result.moduleType).toBe("js")

			/* Parse the exported module */
			const json = result.code.replace("export default ", "") ?? ""
			const data = JSON.parse(json)

			/* Correct dimensions */
			expect(data.width).toBe(200)
			expect(data.height).toBe(150)

			/* Blur placeholder */
			expect(data.blurDataURL).toMatch(/^data:image\/webp;base64,/)

			/* src points to largest variant */
			expect(data.src).toMatch(/^\/assets\/test-hero-200-[a-f0-9]{8}\.webp$/)

			/* Only one variant (200) since source is 200px — all defaults > 200 */
			const variantWidths = Object.keys(data.variants).map(Number)
			expect(variantWidths).toEqual([200])
			expect(data.variants[200]).toBe(data.src)

			/* emitFile called once with correct shape */
			expect(emitted).toHaveLength(1)
			expect(emitted[0].type).toBe("asset")
			expect(emitted[0].fileName).toMatch(/^assets\/test-hero-200-[a-f0-9]{8}\.webp$/)
			expect(emitted[0].source).toBeInstanceOf(Buffer)
			expect(emitted[0].source.length).toBeGreaterThan(0)
		})

		it("build mode: emits multiple variants for large images", async () => {
			const customPlugin = createImagePlugin({ image: { widths: [100, 150] } })
			const emitted: { fileName: string }[] = []
			const ctx = {
				emitFile: (file: { fileName: string }) => {
					emitted.push(file)
				},
				environment: { config: { mode: "production" } },
			}

			const result = await customPlugin.load?.call(ctx as never, `\0flare-image:${testImagePath}`)
			if (typeof result !== "object" || result === null) return

			const json = result.code.replace("export default ", "") ?? ""
			const data = JSON.parse(json)

			/* Widths: 100, 150, 200 (original always included) */
			const variantWidths = Object.keys(data.variants).map(Number)
			expect(variantWidths).toEqual([100, 150, 200])

			/* 3 files emitted */
			expect(emitted).toHaveLength(3)
			expect(emitted[0].fileName).toContain("test-hero-100-")
			expect(emitted[1].fileName).toContain("test-hero-150-")
			expect(emitted[2].fileName).toContain("test-hero-200-")
		})

		it("build mode: content hash is deterministic", async () => {
			const emitted1: { fileName: string }[] = []
			const emitted2: { fileName: string }[] = []
			const makeCtx = (arr: { fileName: string }[]) => ({
				emitFile: (file: { fileName: string }) => arr.push(file),
				environment: { config: { mode: "production" } },
			})

			await plugin.load?.call(makeCtx(emitted1) as never, `\0flare-image:${testImagePath}`)
			await plugin.load?.call(makeCtx(emitted2) as never, `\0flare-image:${testImagePath}`)

			expect(emitted1[0].fileName).toBe(emitted2[0].fileName)
		})

		it("dev mode: returns middleware URLs, no emitFile", async () => {
			const emitted: unknown[] = []
			const ctx = {
				emitFile: (file: unknown) => emitted.push(file),
				environment: { config: { mode: "development" } },
			}

			const result = await plugin.load?.call(ctx as never, `\0flare-image:${testImagePath}`)
			if (typeof result !== "object" || result === null) return

			const json = result.code.replace("export default ", "") ?? ""
			const data = JSON.parse(json)

			/* Dev mode: src is original file path */
			expect(data.src).toBe(testImagePath)

			/* Variants point to dev middleware */
			const variantUrl = data.variants[200] as string
			expect(variantUrl).toContain("/_flare/image?src=")
			expect(variantUrl).toContain("&w=200")

			/* No emitFile calls in dev mode */
			expect(emitted).toHaveLength(0)
		})

		it("build mode: variant filenames include width and hash", async () => {
			const emitted: { fileName: string }[] = []
			const ctx = {
				emitFile: (file: { fileName: string }) => emitted.push(file),
				environment: { config: { mode: "production" } },
			}

			await plugin.load?.call(ctx as never, `\0flare-image:${testImagePath}`)

			for (const file of emitted) {
				/* Pattern: assets/{stem}-{width}-{hash8}.webp */
				expect(file.fileName).toMatch(/^assets\/test-hero-\d+-[a-f0-9]{8}\.webp$/)
			}
		})

		it("build mode: custom quality affects output", async () => {
			const highQ = createImagePlugin({ image: { quality: 95 } })
			const lowQ = createImagePlugin({ image: { quality: 10 } })

			const emitHigh: { source: Buffer }[] = []
			const emitLow: { source: Buffer }[] = []
			const makeCtx = (arr: { source: Buffer }[]) => ({
				emitFile: (file: { source: Buffer }) => arr.push(file),
				environment: { config: { mode: "production" } },
			})

			await highQ.load?.call(makeCtx(emitHigh) as never, `\0flare-image:${testImagePath}`)
			await lowQ.load?.call(makeCtx(emitLow) as never, `\0flare-image:${testImagePath}`)

			/* Different quality produces different output (tiny images may invert size expectation) */
			expect(emitHigh[0].source.length).not.toBe(emitLow[0].source.length)
		})
	})
})
