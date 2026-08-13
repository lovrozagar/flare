import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { listAvailableFonts, listInstalledFonts } from "../../../src/font/list"
import type { FontEntry } from "../../../src/font/resolve"
import { addFont } from "../../../src/font/tracking"

let tempDir: string

const REGISTRY: FontEntry[] = [
	["Inter", "inter", "inter", "sans-serif"],
	["Lora", "lora", "lora", "serif"],
	["Fira Code", "fira-code", "firaCode", "monospace"],
	["Roboto", "roboto", "roboto", "sans-serif"],
	["Playfair Display", "playfair-display", "playfairDisplay", "serif"],
]

beforeEach(() => {
	tempDir = join(tmpdir(), `flare-list-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
	mkdirSync(join(tempDir, "public", "fonts"), { recursive: true })
})

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true })
})

describe("listInstalledFonts", () => {
	it("returns empty when no fonts installed", () => {
		const result = listInstalledFonts(tempDir)
		expect(result).toEqual([])
	})

	it("returns installed fonts from manifest", () => {
		addFont(tempDir, "inter", "Inter", ["latin"])
		addFont(tempDir, "lora", "Lora", ["latin", "cyrillic"])

		const result = listInstalledFonts(tempDir)
		expect(result).toHaveLength(2)
		expect(result[0]?.slug).toBe("inter")
		expect(result[1]?.slug).toBe("lora")
	})

	it("includes family, slug, and subsets", () => {
		addFont(tempDir, "inter", "Inter", ["latin", "cyrillic"])

		const result = listInstalledFonts(tempDir)
		expect(result[0]).toEqual({
			family: "Inter",
			slug: "inter",
			subsets: ["latin", "cyrillic"],
		})
	})

	it("returns fonts sorted by slug", () => {
		addFont(tempDir, "roboto", "Roboto", ["latin"])
		addFont(tempDir, "inter", "Inter", ["latin"])
		addFont(tempDir, "abel", "Abel", ["latin"])

		const result = listInstalledFonts(tempDir)
		const slugs = result.map((f) => f.slug)
		expect(slugs).toEqual(["abel", "inter", "roboto"])
	})
})

describe("listAvailableFonts", () => {
	it("returns all fonts from registry", () => {
		const result = listAvailableFonts(REGISTRY)
		expect(result).toHaveLength(5)
	})

	it("filters by category", () => {
		const result = listAvailableFonts(REGISTRY, "serif")
		expect(result).toHaveLength(2)
		expect(result.map((f) => f.family)).toContain("Lora")
		expect(result.map((f) => f.family)).toContain("Playfair Display")
	})

	it("category filter is case-insensitive", () => {
		const result = listAvailableFonts(REGISTRY, "MONOSPACE")
		expect(result).toHaveLength(1)
		expect(result[0]?.family).toBe("Fira Code")
	})

	it("returns empty for unknown category", () => {
		const result = listAvailableFonts(REGISTRY, "handwriting")
		expect(result).toHaveLength(0)
	})

	it("returns entries with family, slug, camelName, category", () => {
		const result = listAvailableFonts(REGISTRY)
		expect(result[0]).toEqual({
			camelName: "inter",
			category: "sans-serif",
			family: "Inter",
			slug: "inter",
		})
	})
})
