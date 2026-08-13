import { describe, expect, it } from "vitest"

/**
 * cdnProxy key validation in middleware-builtins/index.ts is missing
 * CRLF and backslash checks that middleware/builtins/cdn-proxy.ts has.
 * Defense-in-depth: reject keys with \r, \n, \\ to prevent log injection
 * and path confusion.
 */

function isKeyRejectedFixed(key: string): boolean {
	return (
		key.includes("..") ||
		key.includes("\0") ||
		key.includes("\\") ||
		key.includes("\r") ||
		key.includes("\n")
	)
}

function isKeyRejectedBuggy(key: string): boolean {
	return key.includes("..") || key.includes("\0")
}

describe("cdnProxy key validation", () => {
	it("both versions reject path traversal", () => {
		expect(isKeyRejectedFixed("../etc/passwd")).toBe(true)
		expect(isKeyRejectedBuggy("../etc/passwd")).toBe(true)
	})

	it("both versions reject null bytes", () => {
		expect(isKeyRejectedFixed("file\0name")).toBe(true)
		expect(isKeyRejectedBuggy("file\0name")).toBe(true)
	})

	it("both versions allow normal keys", () => {
		expect(isKeyRejectedFixed("images/photo.jpg")).toBe(false)
		expect(isKeyRejectedBuggy("images/photo.jpg")).toBe(false)
	})

	it("buggy version allows backslash in key", () => {
		expect(isKeyRejectedBuggy("path\\file.txt")).toBe(false)
	})

	it("fixed version rejects backslash in key", () => {
		expect(isKeyRejectedFixed("path\\file.txt")).toBe(true)
	})

	it("buggy version allows CRLF in key", () => {
		expect(isKeyRejectedBuggy("file\r\ninjected")).toBe(false)
		expect(isKeyRejectedBuggy("file\rname")).toBe(false)
		expect(isKeyRejectedBuggy("file\nname")).toBe(false)
	})

	it("fixed version rejects CRLF in key", () => {
		expect(isKeyRejectedFixed("file\r\ninjected")).toBe(true)
		expect(isKeyRejectedFixed("file\rname")).toBe(true)
		expect(isKeyRejectedFixed("file\nname")).toBe(true)
	})

	it("fixed version allows keys with hyphens and dots", () => {
		expect(isKeyRejectedFixed("my-file.2024.jpg")).toBe(false)
		expect(isKeyRejectedFixed("uploads/user-123/avatar.png")).toBe(false)
	})
})
