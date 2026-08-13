/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { extractNonce, replaceNonce } from "../../../src/prerender/index.ts"

describe("Bug 45: extractNonce base64 support", () => {
	it("should extract hex nonces (existing behavior)", () => {
		const html = `<script nonce="abc123def456">code</script>`
		expect(extractNonce(html)).toBe("abc123def456")
	})

	it("should extract base64 nonces with +/= characters", () => {
		const html = `<script nonce="R28rY2F0+/base64==">code</script>`
		expect(extractNonce(html)).toBe("R28rY2F0+/base64==")
	})

	it("should extract base64url nonces with - and _", () => {
		const html = `<script nonce="abc-def_ghi123">code</script>`
		expect(extractNonce(html)).toBe("abc-def_ghi123")
	})

	it("should extract nonce from CSP header with base64 value", () => {
		const csp = "script-src 'nonce-R28rY2F0+/base64=='"
		expect(extractNonce(csp)).toBe("R28rY2F0+/base64==")
	})

	it("should replace base64 nonces with placeholder", () => {
		const html = `<script nonce="R28rY2F0+/base64==">code</script>`
		const nonce = "R28rY2F0+/base64=="
		const result = replaceNonce(html, nonce)
		expect(result).not.toContain(nonce)
		expect(result).toContain("__FLARE_NONCE__")
	})
})
