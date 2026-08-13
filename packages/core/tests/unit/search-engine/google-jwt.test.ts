/* @vitest-environment node */
import { describe, expect, it, vi } from "vitest"
import { getGoogleAccessToken, signJwt } from "../../../src/search-engine/google-jwt.ts"

/* ── signJwt ──────────────────────────────────────────────────────────── */

describe("signJwt", () => {
	it("produces three base64url segments", async () => {
		const keyPair = await crypto.subtle.generateKey(
			{
				hash: "SHA-256",
				modulusLength: 2048,
				name: "RSASSA-PKCS1-v1_5",
				publicExponent: new Uint8Array([1, 0, 1]),
			},
			true,
			["sign", "verify"],
		)
		const exported = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
		const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)))
		const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`

		const jwt = await signJwt({ aud: "test", iss: "test@test.com" }, pem)
		const parts = jwt.split(".")
		expect(parts).toHaveLength(3)

		/* Header should decode to RS256 */
		const header = JSON.parse(atob(parts[0]?.replace(/-/g, "+").replace(/_/g, "/") ?? ""))
		expect(header.alg).toBe("RS256")
		expect(header.typ).toBe("JWT")

		/* Claims should contain iss */
		const claims = JSON.parse(atob(parts[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? ""))
		expect(claims.iss).toBe("test@test.com")
		expect(claims.aud).toBe("test")
	})

	it("signature is verifiable", async () => {
		const keyPair = await crypto.subtle.generateKey(
			{
				hash: "SHA-256",
				modulusLength: 2048,
				name: "RSASSA-PKCS1-v1_5",
				publicExponent: new Uint8Array([1, 0, 1]),
			},
			true,
			["sign", "verify"],
		)
		const exported = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
		const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)))
		const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`

		const jwt = await signJwt({ test: true }, pem)
		const [header, claims, sig] = jwt.split(".")
		const input = `${header}.${claims}`

		/* Decode base64url signature */
		const sigB64 = (sig ?? "").replace(/-/g, "+").replace(/_/g, "/")
		const sigBinary = atob(sigB64)
		const sigBuffer = new Uint8Array(sigBinary.length)
		for (let i = 0; i < sigBinary.length; i++) {
			sigBuffer[i] = sigBinary.charCodeAt(i)
		}

		const valid = await crypto.subtle.verify(
			"RSASSA-PKCS1-v1_5",
			keyPair.publicKey,
			sigBuffer,
			new TextEncoder().encode(input),
		)
		expect(valid).toBe(true)
	})

	it("base64url has no padding or +/", async () => {
		const keyPair = await crypto.subtle.generateKey(
			{
				hash: "SHA-256",
				modulusLength: 2048,
				name: "RSASSA-PKCS1-v1_5",
				publicExponent: new Uint8Array([1, 0, 1]),
			},
			true,
			["sign", "verify"],
		)
		const exported = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
		const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)))
		const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`

		const jwt = await signJwt({ data: "x".repeat(100) }, pem)
		expect(jwt).not.toContain("=")
		expect(jwt).not.toContain("+")
		expect(jwt).not.toContain("/")
	})
})

/* ── getGoogleAccessToken ─────────────────────────────────────────────── */

describe("getGoogleAccessToken", () => {
	it("sends correct token exchange request", async () => {
		const keyPair = await crypto.subtle.generateKey(
			{
				hash: "SHA-256",
				modulusLength: 2048,
				name: "RSASSA-PKCS1-v1_5",
				publicExponent: new Uint8Array([1, 0, 1]),
			},
			true,
			["sign", "verify"],
		)
		const exported = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
		const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)))
		const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`

		let capturedUrl = ""
		let capturedBody = ""
		const mockFetch = vi.fn(async (url: string, init: RequestInit) => {
			capturedUrl = url
			capturedBody = init.body as string
			return new Response(
				JSON.stringify({ access_token: "mock-token", expires_in: 3600, token_type: "Bearer" }),
			)
		})
		const originalFetch = globalThis.fetch
		globalThis.fetch = mockFetch as unknown as typeof fetch

		try {
			const token = await getGoogleAccessToken(
				{ clientEmail: "test@test.iam.gserviceaccount.com", privateKey: pem },
				"https://www.googleapis.com/auth/webmasters",
			)
			expect(token).toBe("mock-token")
			expect(capturedUrl).toBe("https://oauth2.googleapis.com/token")
			expect(capturedBody).toContain("grant_type=")
			expect(capturedBody).toContain("assertion=")
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	it("throws on failed token exchange", async () => {
		const keyPair = await crypto.subtle.generateKey(
			{
				hash: "SHA-256",
				modulusLength: 2048,
				name: "RSASSA-PKCS1-v1_5",
				publicExponent: new Uint8Array([1, 0, 1]),
			},
			true,
			["sign", "verify"],
		)
		const exported = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
		const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)))
		const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`

		const mockFetch = vi.fn(async () => new Response("bad", { status: 401 }))
		const originalFetch = globalThis.fetch
		globalThis.fetch = mockFetch as unknown as typeof fetch

		try {
			await expect(
				getGoogleAccessToken(
					{ clientEmail: "test@test.iam.gserviceaccount.com", privateKey: pem },
					"scope",
				),
			).rejects.toThrow("Google token exchange failed")
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})
