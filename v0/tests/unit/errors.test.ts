/**
 * Error Handling Unit Tests
 *
 * Tests error classes and helper functions.
 * notFound, redirect, type guards.
 */

import { describe, expect, it } from "vitest"
import {
	ForbiddenError,
	forbidden,
	isForbiddenError,
	isNavigationError,
	isNotFoundError,
	isRedirectResponse,
	isUnauthenticatedError,
	NavigationError,
	NotFoundError,
	notFound,
	RedirectResponse,
	redirect,
	ServerFnValidationError,
	UnauthenticatedError,
	unauthenticated,
} from "../../src/errors"

describe("Errors", () => {
	describe("NotFoundError", () => {
		it("creates error with message", () => {
			const error = new NotFoundError("Product not found")
			expect(error.message).toBe("Product not found")
			expect(error.name).toBe("NotFoundError")
		})

		it("creates error with pathname", () => {
			const error = new NotFoundError("Not found", "/products/123")
			expect(error.pathname).toBe("/products/123")
		})

		it("is instance of Error", () => {
			const error = new NotFoundError("Not found")
			expect(error).toBeInstanceOf(Error)
		})
	})

	describe("RedirectResponse", () => {
		it("creates internal redirect", () => {
			const redirect = new RedirectResponse({ to: "/login" })
			expect(redirect.url).toBe("/login")
			expect(redirect.external).toBe(false)
		})

		it("creates external redirect", () => {
			const redirect = new RedirectResponse({ href: "https://example.com" })
			expect(redirect.url).toBe("https://example.com")
			expect(redirect.external).toBe(true)
		})

		it("has default status 302", () => {
			const redirect = new RedirectResponse({ to: "/login" })
			expect(redirect.status).toBe(302)
		})

		it("accepts custom status", () => {
			const redirect = new RedirectResponse({ status: 301, to: "/login" })
			expect(redirect.status).toBe(301)
		})

		it("supports replace option", () => {
			const redirect = new RedirectResponse({ replace: true, to: "/login" })
			expect(redirect.replace).toBe(true)
		})
	})

	describe("NavigationError", () => {
		it("creates error with message", () => {
			const error = new NavigationError("Navigation failed")
			expect(error.message).toBe("Navigation failed")
			expect(error.name).toBe("NavigationError")
		})
	})

	describe("ServerFnValidationError", () => {
		it("creates error with zod errors", () => {
			const errors = { fieldErrors: { name: ["Required"] }, formErrors: [] }
			const error = new ServerFnValidationError(errors)
			expect(error.errors).toEqual(errors)
			expect(error.name).toBe("ServerFnValidationError")
		})
	})

	describe("UnauthenticatedError", () => {
		it("creates error with default message", () => {
			const error = new UnauthenticatedError()
			expect(error.name).toBe("UnauthenticatedError")
			expect(error.message).toBe("Unauthorized")
			expect(error.status).toBe(401)
		})

		it("accepts custom message", () => {
			const error = new UnauthenticatedError("Please login")
			expect(error.message).toBe("Please login")
		})
	})

	describe("ForbiddenError", () => {
		it("creates error with default message", () => {
			const error = new ForbiddenError()
			expect(error.name).toBe("ForbiddenError")
			expect(error.message).toBe("Forbidden")
			expect(error.status).toBe(403)
		})

		it("accepts custom message", () => {
			const error = new ForbiddenError("Access denied")
			expect(error.message).toBe("Access denied")
		})
	})

	describe("notFound helper", () => {
		it("throws NotFoundError", () => {
			expect(() => notFound()).toThrow(NotFoundError)
		})

		it("throws with message", () => {
			expect(() => notFound("Product not found")).toThrow("Product not found")
		})
	})

	describe("redirect helper", () => {
		it("throws RedirectResponse for internal", () => {
			expect(() => redirect({ to: "/login" })).toThrow(RedirectResponse)
		})

		it("throws RedirectResponse for external", () => {
			expect(() => redirect({ href: "https://example.com" })).toThrow(RedirectResponse)
		})
	})

	describe("unauthenticated helper", () => {
		it("throws UnauthenticatedError", () => {
			expect(() => unauthenticated()).toThrow(UnauthenticatedError)
		})

		it("throws with message", () => {
			expect(() => unauthenticated("Token expired")).toThrow("Token expired")
		})
	})

	describe("forbidden helper", () => {
		it("throws ForbiddenError", () => {
			expect(() => forbidden()).toThrow(ForbiddenError)
		})

		it("throws with message", () => {
			expect(() => forbidden("Admin only")).toThrow("Admin only")
		})
	})

	describe("isNotFoundError", () => {
		it("returns true for NotFoundError", () => {
			expect(isNotFoundError(new NotFoundError("Not found"))).toBe(true)
		})

		it("returns false for other errors", () => {
			expect(isNotFoundError(new Error("Other"))).toBe(false)
		})

		it("returns false for non-errors", () => {
			expect(isNotFoundError(null)).toBe(false)
			expect(isNotFoundError(undefined)).toBe(false)
			expect(isNotFoundError("string")).toBe(false)
		})
	})

	describe("isRedirectResponse", () => {
		it("returns true for RedirectResponse", () => {
			expect(isRedirectResponse(new RedirectResponse({ to: "/login" }))).toBe(true)
		})

		it("returns false for other errors", () => {
			expect(isRedirectResponse(new Error("Other"))).toBe(false)
		})

		it("returns false for non-errors", () => {
			expect(isRedirectResponse(null)).toBe(false)
		})
	})

	describe("isNavigationError", () => {
		it("returns true for NavigationError", () => {
			expect(isNavigationError(new NavigationError("Failed"))).toBe(true)
		})

		it("returns false for other errors", () => {
			expect(isNavigationError(new Error("Other"))).toBe(false)
		})
	})

	describe("isUnauthenticatedError", () => {
		it("returns true for UnauthenticatedError", () => {
			expect(isUnauthenticatedError(new UnauthenticatedError())).toBe(true)
		})

		it("returns false for other errors", () => {
			expect(isUnauthenticatedError(new Error("Other"))).toBe(false)
		})

		it("returns false for ForbiddenError", () => {
			expect(isUnauthenticatedError(new ForbiddenError())).toBe(false)
		})
	})

	describe("isForbiddenError", () => {
		it("returns true for ForbiddenError", () => {
			expect(isForbiddenError(new ForbiddenError())).toBe(true)
		})

		it("returns false for other errors", () => {
			expect(isForbiddenError(new Error("Other"))).toBe(false)
		})

		it("returns false for UnauthenticatedError", () => {
			expect(isForbiddenError(new UnauthenticatedError())).toBe(false)
		})
	})
})
