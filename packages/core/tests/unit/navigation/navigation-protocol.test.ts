/**
 * S3: isExternal must handle dangerous protocols case-insensitively.
 * Defense-in-depth: even though Link sanitizes href, isExternal
 * should recognize dangerous protocols regardless of casing.
 */
import { describe, expect, it } from "vitest"
import { isExternal } from "../../../src/navigation/index.ts"

describe("isExternal dangerous protocol handling", () => {
	describe("lowercase (already handled)", () => {
		it("javascript: is not external", () => {
			expect(isExternal("javascript:alert(1)")).toBe(false)
		})

		it("data: is not external", () => {
			expect(isExternal("data:text/html,evil")).toBe(false)
		})

		it("blob: is not external", () => {
			expect(isExternal("blob:https://evil.com")).toBe(false)
		})
	})

	describe("mixed case (must also be handled)", () => {
		it("JavaScript: is not external", () => {
			expect(isExternal("JavaScript:alert(1)")).toBe(false)
		})

		it("JAVASCRIPT: is not external", () => {
			expect(isExternal("JAVASCRIPT:alert(1)")).toBe(false)
		})

		it("DATA: is not external", () => {
			expect(isExternal("DATA:text/html,evil")).toBe(false)
		})

		it("Blob: is not external", () => {
			expect(isExternal("Blob:https://evil.com")).toBe(false)
		})
	})

	describe("protocol-relative URLs are external", () => {
		it("//evil.com is external (different origin)", () => {
			expect(isExternal("//evil.com/path")).toBe(true)
		})

		it("//evil.com:8080 is external (different origin with port)", () => {
			expect(isExternal("//evil.com:8080/path")).toBe(true)
		})

		it("//localhost is external (resolves to current protocol, different host)", () => {
			expect(isExternal("//localhost/foo")).toBe(true)
		})

		it("//same-origin is not external", () => {
			/* window.location.hostname in test env is typically 'localhost' */
			const sameOrigin = `//${window.location.host}/path`
			expect(isExternal(sameOrigin)).toBe(false)
		})
	})

	describe("legitimate protocols still work", () => {
		it("mailto: is external", () => {
			expect(isExternal("mailto:test@example.com")).toBe(true)
		})

		it("tel: is external", () => {
			expect(isExternal("tel:+1234567890")).toBe(true)
		})

		it("relative path is not external", () => {
			expect(isExternal("/about")).toBe(false)
		})
	})
})
