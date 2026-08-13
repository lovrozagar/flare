/**
 * Nonce Generation Unit Tests
 *
 * Tests cryptographic nonce generation for CSP.
 * 128-bit entropy, hex encoding, uniqueness.
 */

import { describe, expect, it } from "vitest"
import { generateNonce } from "../../../../src/server/_internal/security"

describe("generateNonce", () => {
	it("returns string", () => {
		const nonce = generateNonce()
		expect(typeof nonce).toBe("string")
	})

	it("returns 32 hex characters (128 bits)", () => {
		const nonce = generateNonce()
		expect(nonce).toHaveLength(32)
		expect(/^[0-9a-f]{32}$/.test(nonce)).toBe(true)
	})

	it("generates unique values", () => {
		const nonces = new Set<string>()
		for (let i = 0; i < 1000; i++) {
			nonces.add(generateNonce())
		}
		expect(nonces.size).toBe(1000)
	})

	it("uses lowercase hex", () => {
		const nonce = generateNonce()
		expect(nonce).toBe(nonce.toLowerCase())
	})

	it("does not contain non-hex characters", () => {
		const nonce = generateNonce()
		expect(/[^0-9a-f]/.test(nonce)).toBe(false)
	})

	it("generates different nonce each call", () => {
		const nonce1 = generateNonce()
		const nonce2 = generateNonce()
		expect(nonce1).not.toBe(nonce2)
	})
})
