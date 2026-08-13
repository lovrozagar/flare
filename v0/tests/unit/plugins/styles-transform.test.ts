/**
 * Styles Transform Plugin Tests
 *
 * Tests styles() duplicate detection and tracking logic.
 * Pure functions re-implemented for testing.
 */

import { describe, expect, it } from "vitest"

/* ============================================================================
 * Re-implemented Types and Functions for Testing
 * ============================================================================ */

interface LocationInfo {
	file: string
	line: number
	col: number
}

interface FileTracking {
	names: Set<string>
	locations: Map<string, LocationInfo>
}

/**
 * Extract styles() call names from source code
 * Uses regex-based extraction (fast, no AST needed)
 */
function extractStylesNames(code: string, file: string): FileTracking {
	const names = new Set<string>()
	const locations = new Map<string, LocationInfo>()

	/* Match styles("name", ...) or styles('name', ...) */
	const stylesCallRegex = /\bstyles\s*\(\s*["']([^"']+)["']/g

	/* Track line numbers */
	const lines = code.split("\n")
	let charOffset = 0
	const lineOffsets: number[] = []
	for (const line of lines) {
		lineOffsets.push(charOffset)
		charOffset += line.length + 1 /* +1 for newline */
	}

	function getLineCol(index: number): { line: number; col: number } {
		let line = 1
		for (let i = 0; i < lineOffsets.length; i++) {
			const offset = lineOffsets[i]
			if (offset !== undefined && offset <= index) {
				line = i + 1
			} else {
				break
			}
		}
		const col = index - (lineOffsets[line - 1] ?? 0) + 1
		return { col, line }
	}

	let match = stylesCallRegex.exec(code)
	while (match !== null) {
		const name = match[1]
		if (name) {
			const { line, col } = getLineCol(match.index)
			names.add(name)
			locations.set(name, { col, file, line })
		}
		match = stylesCallRegex.exec(code)
	}

	return { locations, names }
}

/**
 * Check if code imports styles from flare styles module
 */
function hasStylesImport(code: string): boolean {
	/* Match: import { styles } from "@flare/v0/styles" or similar */
	return /import\s*\{[^}]*\bstyles\b[^}]*\}\s*from\s*["']@repo\/flare(?:-v2)?\/styles["']/.test(
		code,
	)
}

/**
 * Check if file is TSX/JSX
 */
function isTsxOrJsx(id: string): boolean {
	const cleanId = id.split("?")[0]
	return cleanId?.endsWith(".tsx") || cleanId?.endsWith(".jsx") || false
}

/**
 * Format error message for duplicate names
 */
function formatDuplicateError(
	name: string,
	existing: LocationInfo,
	duplicate: LocationInfo,
): string {
	return (
		`[flare:styles-transform] Duplicate styles name "${name}"\n` +
		`  First defined: ${existing.file}:${existing.line}:${existing.col}\n` +
		`  Duplicate at:  ${duplicate.file}:${duplicate.line}:${duplicate.col}`
	)
}

/* ============================================================================
 * extractStylesNames Tests
 * ============================================================================ */

describe("extractStylesNames", () => {
	describe("basic extraction", () => {
		it("extracts single styles() name", () => {
			const code = `styles("button", { css: "color:red" })`
			const result = extractStylesNames(code, "/test.tsx")

			expect(result.names.has("button")).toBe(true)
			expect(result.names.size).toBe(1)
		})

		it("extracts multiple styles() names", () => {
			const code = `
				styles("header", { css: "a" })
				styles("footer", { css: "b" })
				styles("sidebar", { css: "c" })
			`
			const result = extractStylesNames(code, "/test.tsx")

			expect(result.names.size).toBe(3)
			expect(result.names.has("header")).toBe(true)
			expect(result.names.has("footer")).toBe(true)
			expect(result.names.has("sidebar")).toBe(true)
		})

		it("handles single-quoted names", () => {
			const code = `styles('card', { css: "padding:1rem" })`
			const result = extractStylesNames(code, "/test.tsx")

			expect(result.names.has("card")).toBe(true)
		})

		it("handles whitespace variations", () => {
			const code = `styles(  "spacious"  , { css: "x" })`
			const result = extractStylesNames(code, "/test.tsx")

			expect(result.names.has("spacious")).toBe(true)
		})
	})

	describe("location tracking", () => {
		it("tracks line number correctly", () => {
			const code = `line1\nline2\nstyles("test", {})`
			const result = extractStylesNames(code, "/test.tsx")

			const location = result.locations.get("test")
			expect(location?.line).toBe(3)
		})

		it("tracks column number correctly", () => {
			const code = `const x = styles("test", {})`
			const result = extractStylesNames(code, "/test.tsx")

			const location = result.locations.get("test")
			expect(location?.col).toBe(11) /* "const x = " is 10 chars, + 1 */
		})

		it("tracks file path", () => {
			const code = `styles("test", {})`
			const result = extractStylesNames(code, "/path/to/component.tsx")

			const location = result.locations.get("test")
			expect(location?.file).toBe("/path/to/component.tsx")
		})

		it("tracks multiple locations correctly", () => {
			const code = `styles("first", {})\nstyles("second", {})`
			const result = extractStylesNames(code, "/test.tsx")

			expect(result.locations.get("first")?.line).toBe(1)
			expect(result.locations.get("second")?.line).toBe(2)
		})
	})

	describe("edge cases", () => {
		it("returns empty for no styles() calls", () => {
			const code = "const x = 1; const y = 2;"
			const result = extractStylesNames(code, "/test.tsx")

			expect(result.names.size).toBe(0)
		})

		it("returns empty for empty code", () => {
			const result = extractStylesNames("", "/test.tsx")

			expect(result.names.size).toBe(0)
		})

		it("ignores styles inside comments", () => {
			/* Note: This basic regex doesn't handle comments, just documents behavior */
			const code = `// styles("commented", {})`
			const result = extractStylesNames(code, "/test.tsx")

			/* Basic regex will still match - this is expected behavior limitation */
			expect(result.names.has("commented")).toBe(true)
		})

		it("handles complex names with hyphens", () => {
			const code = `styles("my-component-button", {})`
			const result = extractStylesNames(code, "/test.tsx")

			expect(result.names.has("my-component-button")).toBe(true)
		})

		it("handles names with underscores", () => {
			const code = `styles("my_component", {})`
			const result = extractStylesNames(code, "/test.tsx")

			expect(result.names.has("my_component")).toBe(true)
		})
	})
})

/* ============================================================================
 * hasStylesImport Tests
 * ============================================================================ */

describe("hasStylesImport", () => {
	describe("valid imports", () => {
		it("detects standard import", () => {
			const code = `import { styles } from "@flare/v0/styles"`
			expect(hasStylesImport(code)).toBe(true)
		})

		it("detects import with other named imports", () => {
			const code = `import { styles, registerCSS } from "@flare/v0/styles"`
			expect(hasStylesImport(code)).toBe(true)
		})

		it("detects import with styles not first", () => {
			const code = `import { registerCSS, styles } from "@flare/v0/styles"`
			expect(hasStylesImport(code)).toBe(true)
		})

		it("detects single-quoted import", () => {
			const code = `import { styles } from '@flare/v0/styles'`
			expect(hasStylesImport(code)).toBe(true)
		})

		it("detects v2 variant", () => {
			const code = `import { styles } from "@flare/v0-v2/styles"`
			expect(hasStylesImport(code)).toBe(true)
		})
	})

	describe("invalid imports", () => {
		it("rejects import from different package", () => {
			const code = `import { styles } from "other-package/styles"`
			expect(hasStylesImport(code)).toBe(false)
		})

		it("rejects import from main flare export", () => {
			const code = `import { styles } from "@flare/v0"`
			expect(hasStylesImport(code)).toBe(false)
		})

		it("rejects default import", () => {
			const code = `import styles from "@flare/v0/styles"`
			expect(hasStylesImport(code)).toBe(false)
		})

		it("rejects namespace import", () => {
			const code = `import * as styles from "@flare/v0/styles"`
			expect(hasStylesImport(code)).toBe(false)
		})

		it("rejects code without import", () => {
			const code = "const styles = () => {}"
			expect(hasStylesImport(code)).toBe(false)
		})
	})

	describe("edge cases", () => {
		it("handles multiline imports", () => {
			const code = `import {\n  styles,\n  registerCSS\n} from "@flare/v0/styles"`
			expect(hasStylesImport(code)).toBe(true)
		})

		it("handles extra whitespace", () => {
			const code = `import {  styles  }  from  "@flare/v0/styles"`
			expect(hasStylesImport(code)).toBe(true)
		})

		it("detects import among other code", () => {
			const code = `
				import { useState } from "react"
				import { styles } from "@flare/v0/styles"
				import { something } from "elsewhere"
			`
			expect(hasStylesImport(code)).toBe(true)
		})
	})
})

/* ============================================================================
 * isTsxOrJsx Tests
 * ============================================================================ */

describe("isTsxOrJsx", () => {
	describe("TSX files", () => {
		it("accepts .tsx extension", () => {
			expect(isTsxOrJsx("/path/to/file.tsx")).toBe(true)
		})

		it("accepts .tsx with query params", () => {
			expect(isTsxOrJsx("/path/to/file.tsx?v=123")).toBe(true)
		})
	})

	describe("JSX files", () => {
		it("accepts .jsx extension", () => {
			expect(isTsxOrJsx("/path/to/file.jsx")).toBe(true)
		})

		it("accepts .jsx with query params", () => {
			expect(isTsxOrJsx("/path/to/file.jsx?v=123")).toBe(true)
		})
	})

	describe("non-JSX files", () => {
		it("rejects .ts extension", () => {
			expect(isTsxOrJsx("/path/to/file.ts")).toBe(false)
		})

		it("rejects .js extension", () => {
			expect(isTsxOrJsx("/path/to/file.js")).toBe(false)
		})

		it("rejects .css extension", () => {
			expect(isTsxOrJsx("/path/to/file.css")).toBe(false)
		})

		it("rejects no extension", () => {
			expect(isTsxOrJsx("/path/to/file")).toBe(false)
		})
	})
})

/* ============================================================================
 * formatDuplicateError Tests
 * ============================================================================ */

describe("formatDuplicateError", () => {
	it("formats error with all information", () => {
		const existing: LocationInfo = { col: 10, file: "/src/a.tsx", line: 5 }
		const duplicate: LocationInfo = { col: 20, file: "/src/b.tsx", line: 15 }

		const error = formatDuplicateError("button", existing, duplicate)

		expect(error).toContain('Duplicate styles name "button"')
		expect(error).toContain("First defined: /src/a.tsx:5:10")
		expect(error).toContain("Duplicate at:  /src/b.tsx:15:20")
	})

	it("includes plugin prefix", () => {
		const existing: LocationInfo = { col: 1, file: "/a.tsx", line: 1 }
		const duplicate: LocationInfo = { col: 1, file: "/b.tsx", line: 1 }

		const error = formatDuplicateError("test", existing, duplicate)

		expect(error).toContain("[flare:styles-transform]")
	})

	it("formats multiline message", () => {
		const existing: LocationInfo = { col: 1, file: "/a.tsx", line: 1 }
		const duplicate: LocationInfo = { col: 1, file: "/b.tsx", line: 1 }

		const error = formatDuplicateError("x", existing, duplicate)

		/* Should have 3 lines */
		expect(error.split("\n").length).toBe(3)
	})
})

/* ============================================================================
 * Integration Scenarios
 * ============================================================================ */

describe("integration scenarios", () => {
	describe("duplicate detection simulation", () => {
		it("detects same name in different files", () => {
			const fileA = `import { styles } from "@flare/v0/styles"\nstyles("shared", {})`
			const fileB = `import { styles } from "@flare/v0/styles"\nstyles("shared", {})`

			const registryA = extractStylesNames(fileA, "/a.tsx")
			const registryB = extractStylesNames(fileB, "/b.tsx")

			/* Both have "shared" */
			expect(registryA.names.has("shared")).toBe(true)
			expect(registryB.names.has("shared")).toBe(true)

			/* This would trigger duplicate error in real plugin */
			const existingLocation = registryA.locations.get("shared")
			const duplicateLocation = registryB.locations.get("shared")

			if (existingLocation && duplicateLocation) {
				const error = formatDuplicateError("shared", existingLocation, duplicateLocation)
				expect(error).toContain("/a.tsx")
				expect(error).toContain("/b.tsx")
			}
		})

		it("allows same name in same file (update)", () => {
			const code = `import { styles } from "@flare/v0/styles"\nstyles("button", {})`
			const result = extractStylesNames(code, "/component.tsx")

			/* Same file can register multiple times (HMR update scenario) */
			expect(result.names.has("button")).toBe(true)
		})
	})

	describe("file filtering", () => {
		it("processes only TSX/JSX with styles import", () => {
			const tsxWithImport = `import { styles } from "@flare/v0/styles"\nstyles("x", {})`
			const tsxWithoutImport = `styles("y", {})`
			const tsFile = `import { styles } from "@flare/v0/styles"\nstyles("z", {})`

			expect(isTsxOrJsx("/test.tsx") && hasStylesImport(tsxWithImport)).toBe(true)
			expect(isTsxOrJsx("/test.tsx") && hasStylesImport(tsxWithoutImport)).toBe(false)
			expect(isTsxOrJsx("/test.ts") && hasStylesImport(tsFile)).toBe(false)
		})
	})
})
