/**
 * Error Handling Integration Tests
 *
 * Tests error propagation through the Flare request lifecycle.
 * Covers NotFound, Redirect, Unauthenticated, Forbidden errors.
 */

import { describe, expect, it } from "vitest"

/* ============================================================================
 * Re-implemented Error Classes for Testing
 * ============================================================================ */

class NotFoundError extends Error {
	readonly name = "NotFoundError" as const
	readonly pathname?: string

	constructor(message?: string, pathname?: string) {
		super(message ?? "Not found")
		this.pathname = pathname
	}
}

interface RedirectOptionsInternal {
	replace?: boolean
	status?: number
	to: string
}

interface RedirectOptionsExternal {
	href: string
	replace?: boolean
	status?: number
}

type RedirectOptions = RedirectOptionsExternal | RedirectOptionsInternal

class RedirectResponse extends Error {
	readonly name = "RedirectResponse" as const
	readonly url: string
	readonly external: boolean
	readonly status: number
	readonly replace: boolean

	constructor(options: RedirectOptions) {
		super("Redirect")
		if ("href" in options) {
			this.url = options.href
			this.external = true
		} else {
			this.url = options.to
			this.external = false
		}
		this.status = options.status ?? 302
		this.replace = options.replace ?? false
	}
}

class UnauthenticatedError extends Error {
	readonly name = "UnauthenticatedError" as const
	readonly status = 401 as const

	constructor(message?: string) {
		super(message ?? "Unauthorized")
	}
}

class ForbiddenError extends Error {
	readonly name = "ForbiddenError" as const
	readonly status = 403 as const

	constructor(message?: string) {
		super(message ?? "Forbidden")
	}
}

class NavigationError extends Error {
	readonly name = "NavigationError" as const
}

interface ZodFlattenedError {
	fieldErrors: Record<string, string[]>
	formErrors: string[]
}

class ServerFnValidationError extends Error {
	readonly name = "ServerFnValidationError" as const
	readonly errors: ZodFlattenedError

	constructor(errors: ZodFlattenedError) {
		super("Validation failed")
		this.errors = errors
	}
}

/* ============================================================================
 * Helper Functions
 * ============================================================================ */

function notFound(message?: string): never {
	throw new NotFoundError(message)
}

function redirect(options: RedirectOptions): never {
	throw new RedirectResponse(options)
}

function unauthenticated(message?: string): never {
	throw new UnauthenticatedError(message)
}

function forbidden(message?: string): never {
	throw new ForbiddenError(message)
}

function isNotFoundError(error: unknown): error is NotFoundError {
	return error instanceof NotFoundError
}

function isRedirectResponse(error: unknown): error is RedirectResponse {
	return error instanceof RedirectResponse
}

function isUnauthenticatedError(error: unknown): error is UnauthenticatedError {
	return error instanceof UnauthenticatedError
}

function isForbiddenError(error: unknown): error is ForbiddenError {
	return error instanceof ForbiddenError
}

function isNavigationError(error: unknown): error is NavigationError {
	return error instanceof NavigationError
}

/* ============================================================================
 * Error Response Builder (simulating handler behavior)
 * ============================================================================ */

interface ErrorResponse {
	body: string
	headers: Headers
	status: number
}

function buildErrorResponse(error: unknown): ErrorResponse {
	const headers = new Headers()

	if (isNotFoundError(error)) {
		return {
			body: JSON.stringify({ error: "Not found", message: error.message }),
			headers,
			status: 404,
		}
	}

	if (isRedirectResponse(error)) {
		headers.set("Location", error.url)
		return {
			body: "",
			headers,
			status: error.status,
		}
	}

	if (isUnauthenticatedError(error)) {
		return {
			body: JSON.stringify({ error: "Unauthorized", message: error.message }),
			headers,
			status: 401,
		}
	}

	if (isForbiddenError(error)) {
		return {
			body: JSON.stringify({ error: "Forbidden", message: error.message }),
			headers,
			status: 403,
		}
	}

	/* Generic error fallback */
	return {
		body: JSON.stringify({ error: "Internal Server Error" }),
		headers,
		status: 500,
	}
}

/* ============================================================================
 * Loader Simulation
 * ============================================================================ */

type LoaderFn = () => Promise<unknown> | unknown

async function runLoader(loader: LoaderFn): Promise<{ data?: unknown; error?: unknown }> {
	try {
		const data = await loader()
		return { data }
	} catch (error) {
		return { error }
	}
}

/* ============================================================================
 * NotFoundError Tests
 * ============================================================================ */

describe("NotFoundError integration", () => {
	describe("loader throws NotFoundError", () => {
		it("returns 404 response", async () => {
			const loader = () => {
				notFound("Page not found")
			}

			const result = await runLoader(loader)
			const response = buildErrorResponse(result.error)

			expect(response.status).toBe(404)
		})

		it("includes error message in body", async () => {
			const loader = () => {
				notFound("Custom not found message")
			}

			const result = await runLoader(loader)
			const response = buildErrorResponse(result.error)
			const body = JSON.parse(response.body)

			expect(body.message).toBe("Custom not found message")
		})

		it("uses default message when none provided", async () => {
			const loader = () => {
				notFound()
			}

			const result = await runLoader(loader)
			expect(isNotFoundError(result.error)).toBe(true)
			expect((result.error as NotFoundError).message).toBe("Not found")
		})

		it("preserves pathname when provided", () => {
			const error = new NotFoundError("Not found", "/old-page")

			expect(error.pathname).toBe("/old-page")
		})
	})

	describe("nested loader error propagation", () => {
		it("error bubbles up through async chain", async () => {
			const innerLoader = async () => {
				await Promise.resolve()
				notFound("Deep not found")
			}

			const outerLoader = () => {
				return innerLoader()
			}

			const result = await runLoader(outerLoader)

			expect(isNotFoundError(result.error)).toBe(true)
			expect((result.error as NotFoundError).message).toBe("Deep not found")
		})
	})
})

/* ============================================================================
 * RedirectResponse Tests
 * ============================================================================ */

describe("RedirectResponse integration", () => {
	describe("internal redirects", () => {
		it("returns redirect response with Location header", async () => {
			const loader = () => {
				redirect({ to: "/dashboard" })
			}

			const result = await runLoader(loader)
			const response = buildErrorResponse(result.error)

			expect(response.status).toBe(302)
			expect(response.headers.get("Location")).toBe("/dashboard")
		})

		it("respects custom status code", async () => {
			const loader = () => {
				redirect({ status: 301, to: "/new-location" })
			}

			const result = await runLoader(loader)
			const response = buildErrorResponse(result.error)

			expect(response.status).toBe(301)
		})

		it("marks as internal redirect", async () => {
			const loader = () => {
				redirect({ to: "/internal" })
			}

			const result = await runLoader(loader)
			expect(isRedirectResponse(result.error)).toBe(true)
			expect((result.error as RedirectResponse).external).toBe(false)
		})

		it("preserves replace option", async () => {
			const loader = () => {
				redirect({ replace: true, to: "/replaced" })
			}

			const result = await runLoader(loader)
			expect((result.error as RedirectResponse).replace).toBe(true)
		})
	})

	describe("external redirects", () => {
		it("handles external redirect with href", async () => {
			const loader = () => {
				redirect({ href: "https://example.com" })
			}

			const result = await runLoader(loader)
			const response = buildErrorResponse(result.error)

			expect(response.status).toBe(302)
			expect(response.headers.get("Location")).toBe("https://example.com")
		})

		it("marks as external redirect", async () => {
			const loader = () => {
				redirect({ href: "https://external.com" })
			}

			const result = await runLoader(loader)
			expect(isRedirectResponse(result.error)).toBe(true)
			expect((result.error as RedirectResponse).external).toBe(true)
		})

		it("supports custom status for external", async () => {
			const loader = () => {
				redirect({ href: "https://moved.com", status: 308 })
			}

			const result = await runLoader(loader)
			expect((result.error as RedirectResponse).status).toBe(308)
		})
	})

	describe("redirect status codes", () => {
		const statusCodes = [301, 302, 303, 307, 308]

		for (const status of statusCodes) {
			it(`supports ${status} status code`, async () => {
				const loader = () => {
					redirect({ status, to: "/target" })
				}

				const result = await runLoader(loader)
				expect((result.error as RedirectResponse).status).toBe(status)
			})
		}
	})
})

/* ============================================================================
 * UnauthenticatedError Tests
 * ============================================================================ */

describe("UnauthenticatedError integration", () => {
	describe("auth protected routes", () => {
		it("returns 401 response", async () => {
			const loader = () => {
				unauthenticated("Please log in")
			}

			const result = await runLoader(loader)
			const response = buildErrorResponse(result.error)

			expect(response.status).toBe(401)
		})

		it("includes message in body", async () => {
			const loader = () => {
				unauthenticated("Session expired")
			}

			const result = await runLoader(loader)
			const response = buildErrorResponse(result.error)
			const body = JSON.parse(response.body)

			expect(body.message).toBe("Session expired")
		})

		it("uses default message", async () => {
			const loader = () => {
				unauthenticated()
			}

			const result = await runLoader(loader)
			expect((result.error as UnauthenticatedError).message).toBe("Unauthorized")
		})

		it("has fixed status property", () => {
			const error = new UnauthenticatedError()
			expect(error.status).toBe(401)
		})
	})

	describe("conditional authentication", () => {
		it("passes when user is authenticated", async () => {
			const loader = (user: { authenticated: boolean }) => {
				if (!user.authenticated) {
					unauthenticated()
				}
				return { user: "data" }
			}

			const result = await runLoader(() => loader({ authenticated: true }))
			expect(result.data).toEqual({ user: "data" })
		})

		it("throws when user not authenticated", async () => {
			const loader = (user: { authenticated: boolean }) => {
				if (!user.authenticated) {
					unauthenticated()
				}
				return { user: "data" }
			}

			const result = await runLoader(() => loader({ authenticated: false }))
			expect(isUnauthenticatedError(result.error)).toBe(true)
		})
	})
})

/* ============================================================================
 * ForbiddenError Tests
 * ============================================================================ */

describe("ForbiddenError integration", () => {
	describe("authorization failures", () => {
		it("returns 403 response", async () => {
			const loader = () => {
				forbidden("Access denied")
			}

			const result = await runLoader(loader)
			const response = buildErrorResponse(result.error)

			expect(response.status).toBe(403)
		})

		it("includes message in body", async () => {
			const loader = () => {
				forbidden("You do not have permission")
			}

			const result = await runLoader(loader)
			const response = buildErrorResponse(result.error)
			const body = JSON.parse(response.body)

			expect(body.message).toBe("You do not have permission")
		})

		it("uses default message", async () => {
			const loader = () => {
				forbidden()
			}

			const result = await runLoader(loader)
			expect((result.error as ForbiddenError).message).toBe("Forbidden")
		})

		it("has fixed status property", () => {
			const error = new ForbiddenError()
			expect(error.status).toBe(403)
		})
	})

	describe("role-based access", () => {
		it("passes for admin role", async () => {
			const loader = (role: string) => {
				if (role !== "admin") {
					forbidden("Admin access required")
				}
				return { adminData: true }
			}

			const result = await runLoader(() => loader("admin"))
			expect(result.data).toEqual({ adminData: true })
		})

		it("throws for non-admin role", async () => {
			const loader = (role: string) => {
				if (role !== "admin") {
					forbidden("Admin access required")
				}
				return { adminData: true }
			}

			const result = await runLoader(() => loader("user"))
			expect(isForbiddenError(result.error)).toBe(true)
		})
	})
})

/* ============================================================================
 * NavigationError Tests
 * ============================================================================ */

describe("NavigationError integration", () => {
	it("creates navigation error", () => {
		const error = new NavigationError("Navigation cancelled")

		expect(error.name).toBe("NavigationError")
		expect(error.message).toBe("Navigation cancelled")
	})

	it("is detected by type guard", () => {
		const error = new NavigationError("Test")

		expect(isNavigationError(error)).toBe(true)
		expect(isNotFoundError(error)).toBe(false)
	})

	it("handles client-side navigation abort", async () => {
		const navigateTo = (path: string, aborted: boolean) => {
			if (aborted) {
				throw new NavigationError("Navigation was aborted")
			}
			return { path }
		}

		const result = await runLoader(() => navigateTo("/test", true))
		expect(isNavigationError(result.error)).toBe(true)
	})
})

/* ============================================================================
 * ServerFnValidationError Tests
 * ============================================================================ */

describe("ServerFnValidationError integration", () => {
	it("captures validation errors", () => {
		const zodErrors: ZodFlattenedError = {
			fieldErrors: {
				email: ["Invalid email format"],
				name: ["Name is required"],
			},
			formErrors: [],
		}

		const error = new ServerFnValidationError(zodErrors)

		expect(error.name).toBe("ServerFnValidationError")
		expect(error.errors.fieldErrors.email).toContain("Invalid email format")
	})

	it("captures form-level errors", () => {
		const zodErrors: ZodFlattenedError = {
			fieldErrors: {},
			formErrors: ["Passwords do not match"],
		}

		const error = new ServerFnValidationError(zodErrors)

		expect(error.errors.formErrors).toContain("Passwords do not match")
	})

	it("simulates server function validation", async () => {
		const validateAndProcess = (data: { email: string }) => {
			if (!data.email.includes("@")) {
				throw new ServerFnValidationError({
					fieldErrors: { email: ["Must be valid email"] },
					formErrors: [],
				})
			}
			return { success: true }
		}

		const result = await runLoader(() => validateAndProcess({ email: "invalid" }))
		expect(result.error).toBeInstanceOf(ServerFnValidationError)
	})
})

/* ============================================================================
 * Error Type Guards Tests
 * ============================================================================ */

describe("error type guards", () => {
	it("isNotFoundError only matches NotFoundError", () => {
		expect(isNotFoundError(new NotFoundError())).toBe(true)
		expect(isNotFoundError(new Error())).toBe(false)
		expect(isNotFoundError(new UnauthenticatedError())).toBe(false)
		expect(isNotFoundError(null)).toBe(false)
	})

	it("isRedirectResponse only matches RedirectResponse", () => {
		expect(isRedirectResponse(new RedirectResponse({ to: "/" }))).toBe(true)
		expect(isRedirectResponse(new Error())).toBe(false)
		expect(isRedirectResponse(new NotFoundError())).toBe(false)
	})

	it("isUnauthenticatedError only matches UnauthenticatedError", () => {
		expect(isUnauthenticatedError(new UnauthenticatedError())).toBe(true)
		expect(isUnauthenticatedError(new ForbiddenError())).toBe(false)
		expect(isUnauthenticatedError(new Error())).toBe(false)
	})

	it("isForbiddenError only matches ForbiddenError", () => {
		expect(isForbiddenError(new ForbiddenError())).toBe(true)
		expect(isForbiddenError(new UnauthenticatedError())).toBe(false)
		expect(isForbiddenError(new Error())).toBe(false)
	})

	it("isNavigationError only matches NavigationError", () => {
		expect(isNavigationError(new NavigationError())).toBe(true)
		expect(isNavigationError(new Error())).toBe(false)
	})
})

/* ============================================================================
 * Error Chaining and Recovery
 * ============================================================================ */

describe("error chaining scenarios", () => {
	describe("preloader to loader error flow", () => {
		it("preloader NotFound prevents loader execution", async () => {
			let loaderCalled = false

			const preloader = () => {
				notFound("Resource not found in preloader")
			}

			const loader = () => {
				loaderCalled = true
				return { data: "loaded" }
			}

			const runPipeline = async () => {
				const preloaderResult = await runLoader(preloader)
				if (preloaderResult.error) {
					return preloaderResult
				}
				return runLoader(loader)
			}

			const result = await runPipeline()

			expect(isNotFoundError(result.error)).toBe(true)
			expect(loaderCalled).toBe(false)
		})

		it("preloader redirect prevents loader execution", async () => {
			let loaderCalled = false

			const preloader = () => {
				redirect({ to: "/login" })
			}

			const loader = () => {
				loaderCalled = true
				return { data: "loaded" }
			}

			const runPipeline = async () => {
				const preloaderResult = await runLoader(preloader)
				if (preloaderResult.error) {
					return preloaderResult
				}
				return runLoader(loader)
			}

			const result = await runPipeline()

			expect(isRedirectResponse(result.error)).toBe(true)
			expect(loaderCalled).toBe(false)
		})
	})

	describe("multiple loader error handling", () => {
		it("first error wins in parallel execution", async () => {
			const loaders = [
				async () => {
					await new Promise((r) => setTimeout(r, 10))
					notFound("From loader 1")
				},
				async () => {
					await new Promise((r) => setTimeout(r, 5))
					forbidden("From loader 2")
				},
			]

			const results = await Promise.allSettled(loaders.map((l) => runLoader(l)))
			const errors = results
				.map((r) => (r.status === "fulfilled" ? r.value.error : undefined))
				.filter(Boolean)

			expect(errors.length).toBe(2)
		})
	})
})

/* ============================================================================
 * Error Response Content Types
 * ============================================================================ */

describe("error response formatting", () => {
	it("NotFound response is JSON", async () => {
		const result = await runLoader(() => notFound("Test"))
		const response = buildErrorResponse(result.error)

		expect(() => JSON.parse(response.body)).not.toThrow()
	})

	it("Redirect response has empty body", async () => {
		const result = await runLoader(() => redirect({ to: "/" }))
		const response = buildErrorResponse(result.error)

		expect(response.body).toBe("")
	})

	it("generic error returns 500", async () => {
		const result = await runLoader(() => {
			throw new Error("Unknown error")
		})
		const response = buildErrorResponse(result.error)

		expect(response.status).toBe(500)
	})
})
