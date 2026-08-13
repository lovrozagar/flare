import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { addFont, readManifest, removeFont } from "../../../src/font/tracking"

let tempDir: string

beforeEach(() => {
	tempDir = join(tmpdir(), `flare-font-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
	mkdirSync(join(tempDir, "public", "fonts"), { recursive: true })
})

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true })
})

describe("readManifest", () => {
	it("returns empty manifest when file does not exist", () => {
		const manifest = readManifest(tempDir)
		expect(manifest.fonts).toEqual({})
	})

	it("reads existing manifest", () => {
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json")
		writeFileSync(
			manifestPath,
			JSON.stringify({
				fonts: {
					inter: {
						family: "Inter",
						installedAt: "2026-03-07T21:00:00Z",
						subsets: ["latin"],
					},
				},
			}),
		)

		const manifest = readManifest(tempDir)
		expect(manifest.fonts.inter).toBeDefined()
		expect(manifest.fonts.inter?.family).toBe("Inter")
		expect(manifest.fonts.inter?.subsets).toEqual(["latin"])
	})

	it("returns empty manifest for invalid JSON", () => {
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json")
		writeFileSync(manifestPath, "not json")

		const manifest = readManifest(tempDir)
		expect(manifest.fonts).toEqual({})
	})
})

describe("addFont", () => {
	it("adds font to empty manifest", () => {
		addFont(tempDir, "inter", "Inter", ["latin", "cyrillic"])

		const manifest = readManifest(tempDir)
		expect(manifest.fonts.inter).toBeDefined()
		expect(manifest.fonts.inter?.family).toBe("Inter")
		expect(manifest.fonts.inter?.subsets).toEqual(["latin", "cyrillic"])
		expect(manifest.fonts.inter?.installedAt).toBeTruthy()
	})

	it("adds font to existing manifest", () => {
		addFont(tempDir, "inter", "Inter", ["latin"])
		addFont(tempDir, "lora", "Lora", ["latin", "latin-ext"])

		const manifest = readManifest(tempDir)
		expect(Object.keys(manifest.fonts)).toHaveLength(2)
		expect(manifest.fonts.inter?.family).toBe("Inter")
		expect(manifest.fonts.lora?.family).toBe("Lora")
	})

	it("overwrites existing font entry on re-add", () => {
		addFont(tempDir, "inter", "Inter", ["latin"])
		addFont(tempDir, "inter", "Inter", ["latin", "cyrillic"])

		const manifest = readManifest(tempDir)
		expect(manifest.fonts.inter?.subsets).toEqual(["latin", "cyrillic"])
	})

	it("creates public/fonts directory if missing", () => {
		rmSync(join(tempDir, "public"), { force: true, recursive: true })
		addFont(tempDir, "inter", "Inter", ["latin"])

		expect(existsSync(join(tempDir, "public", "fonts", ".flare-fonts.json"))).toBe(true)
	})

	it("sorts fonts alphabetically by slug", () => {
		addFont(tempDir, "roboto", "Roboto", ["latin"])
		addFont(tempDir, "inter", "Inter", ["latin"])
		addFont(tempDir, "abel", "Abel", ["latin"])

		const raw = readFileSync(join(tempDir, "public", "fonts", ".flare-fonts.json"), "utf-8")
		const keys = Object.keys(JSON.parse(raw).fonts)
		expect(keys).toEqual(["abel", "inter", "roboto"])
	})
})

describe("removeFont", () => {
	it("removes font from manifest", () => {
		addFont(tempDir, "inter", "Inter", ["latin"])
		addFont(tempDir, "lora", "Lora", ["latin"])

		removeFont(tempDir, "inter")

		const manifest = readManifest(tempDir)
		expect(manifest.fonts.inter).toBeUndefined()
		expect(manifest.fonts.lora).toBeDefined()
	})

	it("no-op for non-existent font", () => {
		addFont(tempDir, "inter", "Inter", ["latin"])
		removeFont(tempDir, "comic-sans")

		const manifest = readManifest(tempDir)
		expect(Object.keys(manifest.fonts)).toHaveLength(1)
	})

	it("results in empty manifest when last font removed", () => {
		addFont(tempDir, "inter", "Inter", ["latin"])
		removeFont(tempDir, "inter")

		const manifest = readManifest(tempDir)
		expect(Object.keys(manifest.fonts)).toHaveLength(0)
	})
})
