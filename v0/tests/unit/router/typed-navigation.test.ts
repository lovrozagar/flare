/**
 * Typed Navigation Unit Tests
 *
 * Tests type-safe redirect functions and RedirectResponse class.
 * Validates URL construction and status code handling.
 */

import { describe, expect, it } from "vitest"
import { isRedirectResponse, RedirectResponse } from "../../../src/errors"
import { redirect } from "../../../src/router/navigation"

describe("RedirectResponse", () => {
	it("creates instance with internal redirect (to)", () => {
		const response = new RedirectResponse({ to: "/login" })

		expect(response.url).toBe("/login")
		expect(response.status).toBe(302)
		expect(response.external).toBe(false)
		expect(response.replace).toBe(false)
	})

	it("creates instance with external redirect (href)", () => {
		const response = new RedirectResponse({ href: "https://example.com" })

		expect(response.url).toBe("https://example.com")
		expect(response.status).toBe(302)
		expect(response.external).toBe(true)
	})

	it("creates instance with custom status", () => {
		const response = new RedirectResponse({ status: 301, to: "/new-page" })

		expect(response.url).toBe("/new-page")
		expect(response.status).toBe(301)
	})

	it("creates instance with replace flag", () => {
		const response = new RedirectResponse({ replace: true, to: "/login" })

		expect(response.replace).toBe(true)
	})

	it("extends Error", () => {
		const response = new RedirectResponse({ to: "/login" })

		expect(response).toBeInstanceOf(Error)
		expect(response.name).toBe("RedirectResponse")
		expect(response.message).toBe("Redirect")
	})
})

describe("isRedirectResponse", () => {
	it("returns true for RedirectResponse instance", () => {
		const response = new RedirectResponse({ to: "/login" })

		expect(isRedirectResponse(response)).toBe(true)
	})

	it("returns false for plain object with same shape", () => {
		const fake = { external: false, replace: false, status: 302, url: "/login" }

		expect(isRedirectResponse(fake)).toBe(false)
	})

	it("returns false for null", () => {
		expect(isRedirectResponse(null)).toBe(false)
	})

	it("returns false for undefined", () => {
		expect(isRedirectResponse(undefined)).toBe(false)
	})

	it("returns false for string", () => {
		expect(isRedirectResponse("/login")).toBe(false)
	})

	it("returns false for regular Error", () => {
		const error = new Error("test")

		expect(isRedirectResponse(error)).toBe(false)
	})
})

describe("redirect (typed)", () => {
	it("throws RedirectResponse for simple path", () => {
		try {
			redirect({ to: "/login" })
			expect.fail("should have thrown")
		} catch (e) {
			expect(isRedirectResponse(e)).toBe(true)
			const r = e as RedirectResponse
			expect(r.url).toBe("/login")
			expect(r.status).toBe(302)
			expect(r.external).toBe(false)
		}
	})

	it("throws RedirectResponse with params", () => {
		try {
			redirect({
				params: { id: "123" },
				to: "/products/[id]",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).url).toBe("/products/123")
		}
	})

	it("throws RedirectResponse with multiple params", () => {
		try {
			redirect({
				params: { postId: "456", userId: "123" },
				to: "/users/[userId]/posts/[postId]",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).url).toBe("/users/123/posts/456")
		}
	})

	it("throws RedirectResponse with search params", () => {
		try {
			redirect({
				search: { returnTo: "/dashboard" },
				to: "/login",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).url).toBe("/login?returnTo=%2Fdashboard")
		}
	})

	it("throws RedirectResponse with hash", () => {
		try {
			redirect({
				hash: "section",
				to: "/about",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).url).toBe("/about#section")
		}
	})

	it("throws RedirectResponse with params, search, and hash", () => {
		try {
			redirect({
				hash: "reviews",
				params: { id: "123" },
				search: { tab: "details" },
				to: "/products/[id]",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).url).toBe("/products/123?tab=details#reviews")
		}
	})

	it("uses custom status code 301", () => {
		try {
			redirect({
				status: 301,
				to: "/new-location",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).status).toBe(301)
		}
	})

	it("uses custom status code 307", () => {
		try {
			redirect({
				status: 307,
				to: "/temporary",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).status).toBe(307)
		}
	})

	it("uses custom status code 308", () => {
		try {
			redirect({
				status: 308,
				to: "/permanent",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).status).toBe(308)
		}
	})

	it("throws RedirectResponse with catch-all params", () => {
		try {
			redirect({
				params: { slug: ["docs", "api", "auth"] },
				to: "/[...slug]",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).url).toBe("/docs/api/auth")
		}
	})

	it("throws RedirectResponse with optional single param provided", () => {
		try {
			redirect({
				params: { locale: "en" },
				to: "/[[locale]]/compare",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).url).toBe("/en/compare")
		}
	})

	it("throws RedirectResponse with optional single param omitted", () => {
		try {
			redirect({
				to: "/[[locale]]/compare",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).url).toBe("/compare")
		}
	})

	it("throws RedirectResponse with replace flag", () => {
		try {
			redirect({
				replace: true,
				to: "/login",
			})
			expect.fail("should have thrown")
		} catch (e) {
			expect((e as RedirectResponse).replace).toBe(true)
		}
	})
})
