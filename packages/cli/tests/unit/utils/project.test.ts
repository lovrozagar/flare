import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { findRootLayoutDir, resolveProject } from "../../../src/utils/project"

describe("resolveProject", () => {
	let tmp: string

	beforeEach(() => {
		tmp = join(tmpdir(), `flare-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
		mkdirSync(tmp, { recursive: true })
	})

	afterEach(() => {
		rmSync(tmp, { force: true, recursive: true })
	})

	it("detects flare in dependencies", () => {
		writeFileSync(
			join(tmp, "package.json"),
			JSON.stringify({ dependencies: { "flare": "^0.0.1" } }),
		)
		const result = resolveProject(tmp)
		expect(result.hasFlare).toBe(true)
		expect(result.root).toBe(tmp)
	})

	it("detects flare in devDependencies", () => {
		writeFileSync(
			join(tmp, "package.json"),
			JSON.stringify({ devDependencies: { "flare": "^0.0.1" } }),
		)
		const result = resolveProject(tmp)
		expect(result.hasFlare).toBe(true)
	})

	it("returns hasFlare=false when not found", () => {
		writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { react: "^18" } }))
		const result = resolveProject(tmp)
		expect(result.hasFlare).toBe(false)
	})

	it("does not treat a string-style routes dir as fs-codegen", () => {
		writeFileSync(
			join(tmp, "package.json"),
			JSON.stringify({ dependencies: { "flare": "^0.0.1" } }),
		)
		mkdirSync(join(tmp, "src", "routes"), { recursive: true })
		writeFileSync(join(tmp, "src", "routes", "about.tsx"), `export const route = createPage("_root_/about")`)
		const result = resolveProject(tmp)
		expect(result.hasFsCodegen).toBe(false)
	})

	it("detects fs-codegen when suffix route files exist", () => {
		writeFileSync(
			join(tmp, "package.json"),
			JSON.stringify({ dependencies: { "flare": "^0.0.1" } }),
		)
		mkdirSync(join(tmp, "src", "routes", "_root_"), { recursive: true })
		writeFileSync(join(tmp, "src", "routes", "_root_", "home.page.tsx"), "")
		const result = resolveProject(tmp)
		expect(result.hasFsCodegen).toBe(true)
	})

	it("detects no fs-codegen when routes dir missing", () => {
		writeFileSync(
			join(tmp, "package.json"),
			JSON.stringify({ dependencies: { "flare": "^0.0.1" } }),
		)
		const result = resolveProject(tmp)
		expect(result.hasFsCodegen).toBe(false)
	})

	it("walks up to find package.json", () => {
		writeFileSync(
			join(tmp, "package.json"),
			JSON.stringify({ dependencies: { "flare": "^0.0.1" } }),
		)
		const sub = join(tmp, "src", "deep", "nested")
		mkdirSync(sub, { recursive: true })
		const result = resolveProject(sub)
		expect(result.hasFlare).toBe(true)
		expect(result.root).toBe(tmp)
	})
})

describe("findRootLayoutDir", () => {
	let tmp: string

	beforeEach(() => {
		tmp = join(tmpdir(), `flare-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
		mkdirSync(tmp, { recursive: true })
	})

	afterEach(() => {
		rmSync(tmp, { force: true, recursive: true })
	})

	it("finds root-layout.tsx file", () => {
		const dir = join(tmp, "[[locale]]", "_root_")
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "root-layout.tsx"), "export const route = createRootLayout('')")
		const result = findRootLayoutDir(tmp)
		expect(result).toBe("[[locale]]/_root_")
	})

	it("finds .root-layout.tsx suffix", () => {
		const dir = join(tmp, "_root_")
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "app.root-layout.tsx"), "export const route = createRootLayout('')")
		const result = findRootLayoutDir(tmp)
		expect(result).toBe("_root_")
	})

	it("finds createRootLayout call in tsx files", () => {
		mkdirSync(join(tmp, "app"), { recursive: true })
		writeFileSync(
			join(tmp, "app", "setup.tsx"),
			`import { createRootLayout } from "flare"\nexport const route = createRootLayout("[[locale]]/_root_")`,
		)
		const result = findRootLayoutDir(tmp)
		expect(result).toBe("[[locale]]/_root_")
	})

	it("returns null when no root layout exists", () => {
		mkdirSync(join(tmp, "pages"), { recursive: true })
		writeFileSync(join(tmp, "pages", "index.tsx"), "export default function() {}")
		const result = findRootLayoutDir(tmp)
		expect(result).toBeNull()
	})

	it("returns null for non-existent directory", () => {
		const result = findRootLayoutDir(join(tmp, "nonexistent"))
		expect(result).toBeNull()
	})
})
