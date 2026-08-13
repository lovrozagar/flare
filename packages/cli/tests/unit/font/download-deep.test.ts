import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { downloadFonts, getSubsetsForFont, getUrlsForFont } from "../../../src/font/download"

let tempDir: string

const WOFF2_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x32])

beforeEach(() => {
	tempDir = join(tmpdir(), `flare-dl-deep-${Date.now()}-${Math.random().toString(36).slice(2)}`)
	mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true })
	vi.restoreAllMocks()
})

describe("getUrlsForFont — complex filename patterns", () => {
	const COMPLEX_MAP: Record<string, string> = {
		"/fonts/alegreya-sans/cyrillic-400.woff2": "https://cdn/1",
		"/fonts/alegreya-sans/cyrillic-700.woff2": "https://cdn/2",
		"/fonts/alegreya-sans/cyrillic-ext-400.woff2": "https://cdn/3",
		"/fonts/alegreya-sans/cyrillic-ext-700.woff2": "https://cdn/4",
		"/fonts/alegreya-sans/cyrillic-ext-i-400.woff2": "https://cdn/5",
		"/fonts/alegreya-sans/cyrillic-ext-i-700.woff2": "https://cdn/6",
		"/fonts/alegreya-sans/cyrillic-i-400.woff2": "https://cdn/7",
		"/fonts/alegreya-sans/cyrillic-i-700.woff2": "https://cdn/8",
		"/fonts/alegreya-sans/latin-400.woff2": "https://cdn/9",
		"/fonts/alegreya-sans/latin-700.woff2": "https://cdn/10",
		"/fonts/alegreya-sans/latin-ext-400.woff2": "https://cdn/11",
		"/fonts/alegreya-sans/latin-ext-i-400.woff2": "https://cdn/12",
		"/fonts/alegreya-sans/latin-i-400.woff2": "https://cdn/13",
		"/fonts/inter/cyrillic-ext-i.woff2": "https://cdn/14",
		"/fonts/inter/cyrillic-ext.woff2": "https://cdn/15",
		"/fonts/inter/cyrillic-i.woff2": "https://cdn/16",
		"/fonts/inter/cyrillic.woff2": "https://cdn/17",
		"/fonts/inter/latin-ext-i.woff2": "https://cdn/18",
		"/fonts/inter/latin-ext.woff2": "https://cdn/19",
		"/fonts/inter/latin-i.woff2": "https://cdn/20",
		"/fonts/inter/latin.woff2": "https://cdn/21",
	}

	it("latin filter on static font includes weight variants", () => {
		const urls = getUrlsForFont("alegreya-sans", COMPLEX_MAP, ["latin"])
		const paths = urls.map(([p]) => p)
		expect(paths).toContain("/fonts/alegreya-sans/latin-400.woff2")
		expect(paths).toContain("/fonts/alegreya-sans/latin-700.woff2")
		expect(paths).toContain("/fonts/alegreya-sans/latin-i-400.woff2")
	})

	it("latin filter does NOT include latin-ext", () => {
		const urls = getUrlsForFont("alegreya-sans", COMPLEX_MAP, ["latin"])
		const paths = urls.map(([p]) => p)
		expect(paths).not.toContain("/fonts/alegreya-sans/latin-ext-400.woff2")
		expect(paths).not.toContain("/fonts/alegreya-sans/latin-ext-i-400.woff2")
	})

	it("cyrillic-ext filter includes italic+weight combos", () => {
		const urls = getUrlsForFont("alegreya-sans", COMPLEX_MAP, ["cyrillic-ext"])
		const paths = urls.map(([p]) => p)
		expect(paths).toContain("/fonts/alegreya-sans/cyrillic-ext-400.woff2")
		expect(paths).toContain("/fonts/alegreya-sans/cyrillic-ext-700.woff2")
		expect(paths).toContain("/fonts/alegreya-sans/cyrillic-ext-i-400.woff2")
		expect(paths).toContain("/fonts/alegreya-sans/cyrillic-ext-i-700.woff2")
		expect(paths).not.toContain("/fonts/alegreya-sans/cyrillic-400.woff2")
	})

	it("cyrillic filter on static font does NOT include cyrillic-ext", () => {
		const urls = getUrlsForFont("alegreya-sans", COMPLEX_MAP, ["cyrillic"])
		const paths = urls.map(([p]) => p)
		expect(paths).toContain("/fonts/alegreya-sans/cyrillic-400.woff2")
		expect(paths).toContain("/fonts/alegreya-sans/cyrillic-700.woff2")
		expect(paths).toContain("/fonts/alegreya-sans/cyrillic-i-400.woff2")
		expect(paths).toContain("/fonts/alegreya-sans/cyrillic-i-700.woff2")
		expect(paths).not.toContain("/fonts/alegreya-sans/cyrillic-ext-400.woff2")
	})

	it("latin filter on variable font includes italic variant", () => {
		const urls = getUrlsForFont("inter", COMPLEX_MAP, ["latin"])
		const paths = urls.map(([p]) => p)
		expect(paths).toContain("/fonts/inter/latin.woff2")
		expect(paths).toContain("/fonts/inter/latin-i.woff2")
		expect(paths).not.toContain("/fonts/inter/latin-ext.woff2")
		expect(paths).not.toContain("/fonts/inter/latin-ext-i.woff2")
	})

	it("no subsets returns all files for font", () => {
		const urls = getUrlsForFont("alegreya-sans", COMPLEX_MAP)
		expect(urls).toHaveLength(13)
	})

	it("empty subsets array returns nothing", () => {
		const urls = getUrlsForFont("inter", COMPLEX_MAP, [])
		expect(urls).toHaveLength(0)
	})

	it("non-existent subset returns nothing", () => {
		const urls = getUrlsForFont("inter", COMPLEX_MAP, ["japanese"])
		expect(urls).toHaveLength(0)
	})

	it("skips entries with empty CDN URL", () => {
		const mapWithEmpty: Record<string, string> = {
			"/fonts/test/cyrillic.woff2": "https://cdn/valid",
			"/fonts/test/latin.woff2": "",
		}
		const urls = getUrlsForFont("test", mapWithEmpty)
		expect(urls).toHaveLength(1)
		expect(urls[0]?.[0]).toBe("/fonts/test/cyrillic.woff2")
	})
})

describe("getSubsetsForFont — complex patterns", () => {
	it("deduplicates across italic and weight variants", () => {
		const urlMap: Record<string, string> = {
			"/fonts/test/latin-400.woff2": "https://cdn/1",
			"/fonts/test/latin-700.woff2": "https://cdn/2",
			"/fonts/test/latin-i-400.woff2": "https://cdn/3",
			"/fonts/test/latin-i-700.woff2": "https://cdn/4",
			"/fonts/test/latin.woff2": "https://cdn/5",
		}
		const subsets = getSubsetsForFont("test", urlMap)
		expect(subsets).toEqual(["latin"])
	})

	it("handles cyrillic-ext-i-700 pattern correctly", () => {
		const urlMap: Record<string, string> = {
			"/fonts/test/cyrillic-ext-i-700.woff2": "https://cdn/1",
			"/fonts/test/cyrillic-ext.woff2": "https://cdn/2",
			"/fonts/test/latin.woff2": "https://cdn/3",
		}
		const subsets = getSubsetsForFont("test", urlMap)
		expect(subsets).toEqual(["cyrillic-ext", "latin"])
	})

	it("handles vietnamese subset name", () => {
		const urlMap: Record<string, string> = {
			"/fonts/test/vietnamese-i.woff2": "https://cdn/1",
			"/fonts/test/vietnamese.woff2": "https://cdn/2",
		}
		const subsets = getSubsetsForFont("test", urlMap)
		expect(subsets).toEqual(["vietnamese"])
	})

	it("handles greek-ext subset", () => {
		const urlMap: Record<string, string> = {
			"/fonts/test/greek-ext-i.woff2": "https://cdn/1",
			"/fonts/test/greek-ext.woff2": "https://cdn/2",
			"/fonts/test/greek.woff2": "https://cdn/3",
		}
		const subsets = getSubsetsForFont("test", urlMap)
		expect(subsets).toEqual(["greek", "greek-ext"])
	})

	it("empty URL map returns empty", () => {
		expect(getSubsetsForFont("inter", {})).toEqual([])
	})
})

describe("downloadFonts — deep edge cases", () => {
	it("batchSize=1 downloads serially", async () => {
		const order: number[] = []
		const entries: Array<[string, string]> = [
			["/fonts/a/1.woff2", "https://cdn/1"],
			["/fonts/a/2.woff2", "https://cdn/2"],
			["/fonts/a/3.woff2", "https://cdn/3"],
		]

		const mockFetch = vi.fn().mockImplementation(async (url: string) => {
			const idx = Number.parseInt(url.split("/").pop() ?? "0", 10)
			order.push(idx)
			await new Promise((r) => setTimeout(r, 5))
			return new Response(WOFF2_BYTES, { status: 200 })
		})

		await downloadFonts({
			batchSize: 1,
			entries,
			fetch: mockFetch,
			outDir: tempDir,
		})

		/* with batchSize=1, each batch completes before next starts */
		expect(order).toEqual([1, 2, 3])
	})

	it("passes exact URL to fetch", async () => {
		const entries: Array<[string, string]> = [
			[
				"/fonts/inter/latin.woff2",
				"https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2",
			],
		]

		const mockFetch = vi.fn().mockResolvedValue(new Response(WOFF2_BYTES, { status: 200 }))

		await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir })

		expect(mockFetch).toHaveBeenCalledWith(
			"https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2",
		)
	})

	it("does not leave partial file on HTTP error", async () => {
		const entries: Array<[string, string]> = [["/fonts/inter/latin.woff2", "https://cdn/fail"]]

		const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))

		await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir })

		expect(existsSync(join(tempDir, "fonts", "inter", "latin.woff2"))).toBe(false)
	})

	it("multiple batches each call onProgress", async () => {
		const entries: Array<[string, string]> = Array.from({ length: 7 }, (_, i) => [
			`/fonts/t/f${i}.woff2`,
			`https://cdn/${i}`,
		])

		const mockFetch = vi
			.fn()
			.mockImplementation(() => Promise.resolve(new Response(WOFF2_BYTES, { status: 200 })))

		const calls: number[] = []
		await downloadFonts({
			batchSize: 3,
			entries,
			fetch: mockFetch,
			onProgress(completed) {
				calls.push(completed)
			},
			outDir: tempDir,
		})

		/* 3 batches: 3, 6, 7 */
		expect(calls).toEqual([3, 6, 7])
	})

	it("all entries fail still returns correct total", async () => {
		const entries: Array<[string, string]> = [
			["/fonts/a/1.woff2", "https://cdn/1"],
			["/fonts/a/2.woff2", "https://cdn/2"],
		]

		const mockFetch = vi.fn().mockRejectedValue(new Error("dns failure"))

		const result = await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir })

		expect(result.failed).toBe(2)
		expect(result.downloaded).toBe(0)
		expect(result.skipped).toBe(0)
		expect(result.failedPaths).toHaveLength(2)
	})

	it("force overwrites file content", async () => {
		const dest = join(tempDir, "fonts", "inter")
		mkdirSync(dest, { recursive: true })
		writeFileSync(join(dest, "latin.woff2"), "old-content-here")

		const newBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
		const mockFetch = vi
			.fn()
			.mockImplementation(() => Promise.resolve(new Response(newBytes, { status: 200 })))

		await downloadFonts({
			entries: [["/fonts/inter/latin.woff2", "https://cdn/1"]],
			fetch: mockFetch,
			force: true,
			outDir: tempDir,
		})

		const { readFileSync } = await import("node:fs")
		const written = readFileSync(join(dest, "latin.woff2"))
		expect(Buffer.from(newBytes).equals(written)).toBe(true)
	})

	it("deeply nested directories created automatically", async () => {
		const entries: Array<[string, string]> = [
			["/fonts/some-font/deep/nested/path/latin.woff2", "https://cdn/1"],
		]

		const mockFetch = vi
			.fn()
			.mockImplementation(() => Promise.resolve(new Response(WOFF2_BYTES, { status: 200 })))

		await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir })

		expect(
			existsSync(join(tempDir, "fonts", "some-font", "deep", "nested", "path", "latin.woff2")),
		).toBe(true)
	})
})
