/**
 * URL Handling Unit Tests
 *
 * Tests URL normalization and static file detection.
 */

import { describe, expect, it } from "vitest"
import { handleStaticFile, normalizeUrl } from "../../../src/server/handler/url"

/* ============================================================================
 * normalizeUrl
 * ============================================================================ */

describe("normalizeUrl", () => {
	describe("trailing slash removal", () => {
		it("redirects /path/ to /path", () => {
			const url = new URL("https://example.com/products/")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(301)
			expect(response?.headers.get("Location")).toBe("https://example.com/products")
		})

		it("redirects /nested/path/ to /nested/path", () => {
			const url = new URL("https://example.com/a/b/c/")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(301)
			expect(response?.headers.get("Location")).toBe("https://example.com/a/b/c")
		})

		it("preserves query string when redirecting", () => {
			const url = new URL("https://example.com/search/?q=test&page=2")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.headers.get("Location")).toBe("https://example.com/search?q=test&page=2")
		})

		it("preserves hash when redirecting", () => {
			const url = new URL("https://example.com/docs/#section")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.headers.get("Location")).toBe("https://example.com/docs#section")
		})

		it("preserves query and hash when redirecting", () => {
			const url = new URL("https://example.com/page/?id=1#top")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.headers.get("Location")).toBe("https://example.com/page?id=1#top")
		})
	})

	describe("no redirect needed", () => {
		it("returns null for root path /", () => {
			const url = new URL("https://example.com/")
			const response = normalizeUrl(url)

			expect(response).toBeNull()
		})

		it("returns null for path without trailing slash", () => {
			const url = new URL("https://example.com/products")
			const response = normalizeUrl(url)

			expect(response).toBeNull()
		})

		it("returns null for nested path without trailing slash", () => {
			const url = new URL("https://example.com/a/b/c")
			const response = normalizeUrl(url)

			expect(response).toBeNull()
		})

		it("returns null for path with query but no trailing slash", () => {
			const url = new URL("https://example.com/search?q=test")
			const response = normalizeUrl(url)

			expect(response).toBeNull()
		})
	})

	describe("case sensitivity", () => {
		it("preserves case in path segments", () => {
			const url = new URL("https://example.com/Users/JohnDoe/")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.headers.get("Location")).toBe("https://example.com/Users/JohnDoe")
		})

		it("preserves case in query params", () => {
			const url = new URL("https://example.com/path/?Name=John&AGE=30")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.headers.get("Location")).toBe("https://example.com/path?Name=John&AGE=30")
		})
	})

	describe("edge cases", () => {
		it("handles URL with port", () => {
			const url = new URL("https://example.com:8080/path/")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.headers.get("Location")).toBe("https://example.com:8080/path")
		})

		it("handles URL with username and password", () => {
			const url = new URL("https://user:pass@example.com/path/")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.headers.get("Location")).toBe("https://user:pass@example.com/path")
		})

		it("handles encoded characters in path", () => {
			const url = new URL("https://example.com/hello%20world/")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.headers.get("Location")).toContain("/hello%20world")
		})

		it("handles HTTP protocol", () => {
			const url = new URL("http://example.com/path/")
			const response = normalizeUrl(url)

			expect(response).not.toBeNull()
			expect(response?.headers.get("Location")).toBe("http://example.com/path")
		})
	})
})

/* ============================================================================
 * handleStaticFile
 * ============================================================================ */

describe("handleStaticFile", () => {
	describe("returns 404 for static assets", () => {
		it("returns 404 for .js files", () => {
			const url = new URL("https://example.com/script.js")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .css files", () => {
			const url = new URL("https://example.com/style.css")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .png files", () => {
			const url = new URL("https://example.com/image.png")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .jpg files", () => {
			const url = new URL("https://example.com/photo.jpg")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .jpeg files", () => {
			const url = new URL("https://example.com/photo.jpeg")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .gif files", () => {
			const url = new URL("https://example.com/animation.gif")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .svg files", () => {
			const url = new URL("https://example.com/icon.svg")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .webp files", () => {
			const url = new URL("https://example.com/image.webp")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .woff2 files", () => {
			const url = new URL("https://example.com/font.woff2")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .woff files", () => {
			const url = new URL("https://example.com/font.woff")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .ttf files", () => {
			const url = new URL("https://example.com/font.ttf")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .json files", () => {
			const url = new URL("https://example.com/data.json")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .xml files", () => {
			const url = new URL("https://example.com/sitemap.xml")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .txt files", () => {
			const url = new URL("https://example.com/robots.txt")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .ico files", () => {
			const url = new URL("https://example.com/favicon.ico")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .map files", () => {
			const url = new URL("https://example.com/script.js.map")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .pdf files", () => {
			const url = new URL("https://example.com/document.pdf")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .zip files", () => {
			const url = new URL("https://example.com/archive.zip")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})
	})

	describe("allows HTML files", () => {
		it("returns null for .html files", () => {
			const url = new URL("https://example.com/page.html")
			const response = handleStaticFile(url)

			expect(response).toBeNull()
		})

		it("returns null for .HTML files (uppercase)", () => {
			const url = new URL("https://example.com/page.HTML")
			const response = handleStaticFile(url)

			expect(response).toBeNull()
		})
	})

	describe("allows paths without extensions", () => {
		it("returns null for /products", () => {
			const url = new URL("https://example.com/products")
			const response = handleStaticFile(url)

			expect(response).toBeNull()
		})

		it("returns null for /users/123", () => {
			const url = new URL("https://example.com/users/123")
			const response = handleStaticFile(url)

			expect(response).toBeNull()
		})

		it("returns null for root /", () => {
			const url = new URL("https://example.com/")
			const response = handleStaticFile(url)

			expect(response).toBeNull()
		})

		it("returns null for /about", () => {
			const url = new URL("https://example.com/about")
			const response = handleStaticFile(url)

			expect(response).toBeNull()
		})
	})

	describe("handles case insensitivity", () => {
		it("returns 404 for .JS files (uppercase)", () => {
			const url = new URL("https://example.com/script.JS")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for .Css files (mixed case)", () => {
			const url = new URL("https://example.com/style.Css")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})
	})

	describe("edge cases", () => {
		it("returns null for path with dot but no extension", () => {
			const url = new URL("https://example.com/v1.0")
			const response = handleStaticFile(url)

			/* .0 is too short (< 2 chars) to be considered an extension */
			expect(response).toBeNull()
		})

		it("handles nested static file paths", () => {
			const url = new URL("https://example.com/assets/images/logo.png")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("handles file with query string", () => {
			const url = new URL("https://example.com/script.js?v=123")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns null for very long extension (> 6 chars)", () => {
			const url = new URL("https://example.com/file.longext")
			const response = handleStaticFile(url)

			/* .longext is 7 chars, exceeds 6 char limit */
			expect(response).toBeNull()
		})

		it("returns 404 for exactly 6 char extension", () => {
			const url = new URL("https://example.com/file.abcdef")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})

		it("returns 404 for exactly 2 char extension", () => {
			const url = new URL("https://example.com/file.ts")
			const response = handleStaticFile(url)

			expect(response).not.toBeNull()
			expect(response?.status).toBe(404)
		})
	})
})
