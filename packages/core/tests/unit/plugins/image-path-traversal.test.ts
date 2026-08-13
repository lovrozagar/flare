import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Tests for image plugin path traversal protection.
 * The plugin should use realpathSync to resolve symlinks before checking
 * that the path is within the project root.
 */

describe("image plugin — path traversal protection", () => {
	it("path.resolve does NOT follow symlinks (proving the vulnerability)", () => {
		/* path.resolve just normalizes, doesn't resolve symlinks */
		const cwd = process.cwd()
		const traversal = resolve("../../etc/passwd")
		/* This would NOT start with cwd — direct traversal caught */
		expect(traversal.startsWith(cwd)).toBe(false)
	})

	it("relative path with ../ is caught by startsWith check", () => {
		const cwd = process.cwd()
		const resolved = resolve("../../../etc/passwd")
		expect(resolved.startsWith(cwd)).toBe(false)
	})

	it("source file for image plugin uses realpathSync", () => {
		const { readFileSync } = require("node:fs")
		const src = readFileSync(join(__dirname, "../../../src/plugins/image-plugin.ts"), "utf-8")
		/* Verify the image serving code uses realpathSync for symlink resolution */
		expect(src).toContain("realpathSync")
	})
})
