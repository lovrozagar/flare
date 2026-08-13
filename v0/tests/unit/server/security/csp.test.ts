/**
 * CSP Builder Unit Tests
 *
 * Tests Content-Security-Policy header building.
 * Nonce injection, dev mode relaxation, directive merging.
 */

import { describe, expect, it } from "vitest"
import {
	buildCspHeader,
	type CspDirectives,
	DEFAULT_CSP_DIRECTIVES,
	parseCspHeader,
} from "../../../../src/server/_internal/security"

describe("buildCspHeader", () => {
	const testNonce = "abc123def456789012345678901234ab"

	describe("production mode", () => {
		it("includes nonce in script-src", () => {
			const csp = buildCspHeader({}, testNonce, false)
			expect(csp).toContain(`'nonce-${testNonce}'`)
		})

		it("includes strict-dynamic in script-src", () => {
			const csp = buildCspHeader({}, testNonce, false)
			expect(csp).toContain("'strict-dynamic'")
		})

		it("sets default-src to 'self'", () => {
			const csp = buildCspHeader({}, testNonce, false)
			expect(csp).toContain("default-src 'self'")
		})

		it("sets object-src to 'none'", () => {
			const csp = buildCspHeader({}, testNonce, false)
			expect(csp).toContain("object-src 'none'")
		})

		it("sets base-uri to 'self'", () => {
			const csp = buildCspHeader({}, testNonce, false)
			expect(csp).toContain("base-uri 'self'")
		})

		it("includes frame-ancestors 'self'", () => {
			const csp = buildCspHeader({}, testNonce, false)
			expect(csp).toContain("frame-ancestors 'self'")
		})
	})

	describe("development mode", () => {
		it("includes unsafe-inline in script-src", () => {
			const csp = buildCspHeader({}, testNonce, true)
			expect(csp).toContain("'unsafe-inline'")
		})

		it("includes unsafe-eval in script-src", () => {
			const csp = buildCspHeader({}, testNonce, true)
			expect(csp).toContain("'unsafe-eval'")
		})

		it("includes websocket URLs in connect-src", () => {
			const csp = buildCspHeader({}, testNonce, true)
			expect(csp).toContain("ws://localhost:*")
			expect(csp).toContain("wss://localhost:*")
		})

		it("includes blob: in worker-src for Vite HMR", () => {
			const csp = buildCspHeader({}, testNonce, true)
			expect(csp).toContain("worker-src 'self' blob:")
		})
	})

	describe("custom directives", () => {
		it("merges custom script-src values", () => {
			const directives: CspDirectives = {
				scriptSrc: ["https://cdn.example.com"],
			}
			const csp = buildCspHeader(directives, testNonce, false)
			expect(csp).toContain("https://cdn.example.com")
			expect(csp).toContain(`'nonce-${testNonce}'`)
		})

		it("merges custom connect-src values", () => {
			const directives: CspDirectives = {
				connectSrc: ["https://api.example.com"],
			}
			const csp = buildCspHeader(directives, testNonce, false)
			expect(csp).toContain("https://api.example.com")
		})

		it("merges custom img-src values", () => {
			const directives: CspDirectives = {
				imgSrc: ["https://images.example.com", "data:"],
			}
			const csp = buildCspHeader(directives, testNonce, false)
			expect(csp).toContain("https://images.example.com")
			expect(csp).toContain("data:")
		})

		it("merges custom font-src values", () => {
			const directives: CspDirectives = {
				fontSrc: ["https://fonts.example.com"],
			}
			const csp = buildCspHeader(directives, testNonce, false)
			expect(csp).toContain("https://fonts.example.com")
		})

		it("respects custom frame-ancestors", () => {
			const directives: CspDirectives = {
				frameAncestors: ["https://parent.example.com"],
			}
			const csp = buildCspHeader(directives, testNonce, false)
			expect(csp).toContain("frame-ancestors https://parent.example.com")
		})

		it("supports upgrade-insecure-requests", () => {
			const directives: CspDirectives = {
				upgradeInsecureRequests: true,
			}
			const csp = buildCspHeader(directives, testNonce, false)
			expect(csp).toContain("upgrade-insecure-requests")
		})

		it("omits upgrade-insecure-requests when false", () => {
			const directives: CspDirectives = {
				upgradeInsecureRequests: false,
			}
			const csp = buildCspHeader(directives, testNonce, false)
			expect(csp).not.toContain("upgrade-insecure-requests")
		})
	})

	describe("directive ordering", () => {
		it("produces valid CSP format", () => {
			const csp = buildCspHeader({}, testNonce, false)
			const parts = csp.split("; ")
			for (const part of parts) {
				expect(part).toMatch(/^[a-z-]+\s+.+$|^[a-z-]+$/)
			}
		})

		it("separates directives with semicolon and space", () => {
			const csp = buildCspHeader({}, testNonce, false)
			expect(csp).toContain("; ")
			expect(csp).not.toContain(";;")
		})
	})
})

describe("parseCspHeader", () => {
	it("parses simple CSP header", () => {
		const csp = "default-src 'self'; script-src 'unsafe-inline'"
		const parsed = parseCspHeader(csp)
		expect(parsed.defaultSrc).toEqual(["'self'"])
		expect(parsed.scriptSrc).toEqual(["'unsafe-inline'"])
	})

	it("parses multiple values in directive", () => {
		const csp = "script-src 'self' https://cdn.com 'unsafe-inline'"
		const parsed = parseCspHeader(csp)
		expect(parsed.scriptSrc).toEqual(["'self'", "https://cdn.com", "'unsafe-inline'"])
	})

	it("handles empty input", () => {
		const parsed = parseCspHeader("")
		expect(parsed).toEqual({})
	})

	it("parses boolean directives", () => {
		const csp = "upgrade-insecure-requests"
		const parsed = parseCspHeader(csp)
		expect(parsed.upgradeInsecureRequests).toBe(true)
	})
})

describe("DEFAULT_CSP_DIRECTIVES", () => {
	it("has secure defaults", () => {
		expect(DEFAULT_CSP_DIRECTIVES.defaultSrc).toEqual(["'self'"])
		expect(DEFAULT_CSP_DIRECTIVES.objectSrc).toEqual(["'none'"])
		expect(DEFAULT_CSP_DIRECTIVES.baseUri).toEqual(["'self'"])
	})
})
