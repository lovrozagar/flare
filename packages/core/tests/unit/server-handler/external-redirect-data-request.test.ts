import { describe, expect, it } from "vitest"
import { RedirectResponse } from "../../../src/errors/index.ts"
import { createRedirectNDJSONResponse, formatRedirectMessage } from "../../../src/ndjson-server/index.ts"

/**
 * Bug 76: External redirects during SPA navigation return raw HTTP 3xx
 *
 * When a loader throws redirect({ href: "https://example.com" }) and the
 * request is a data request (SPA navigation), the server returned a raw
 * HTTP 307 redirect. The browser's fetch() follows 3xx automatically,
 * making a cross-origin fetch to example.com which CORS-blocks.
 *
 * Fix: data requests must ALWAYS use NDJSON redirect format so the client
 * can call window.location.href instead of fetch following the redirect.
 */

describe("Bug 76: external redirect NDJSON for data requests", () => {
	it("createRedirectNDJSONResponse includes external flag", () => {
		const redirect = new RedirectResponse({
			href: "https://example.com/path?q=test",
			status: 307,
		})

		const response = createRedirectNDJSONResponse(redirect)
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")
		expect(response.status).toBe(200)
	})

	it("formatRedirectMessage sets xl=true for external redirects", () => {
		const msg = formatRedirectMessage("https://example.com", 307, true, true)
		const parsed = JSON.parse(msg) as Record<string, unknown>
		expect(parsed.xl).toBe(true)
		expect(parsed.u).toBe("https://example.com")
		expect(parsed.s).toBe(307)
		expect(parsed.t).toBe("x")
	})

	it("formatRedirectMessage omits xl for internal redirects", () => {
		const msg = formatRedirectMessage("/dashboard", 302, true, false)
		const parsed = JSON.parse(msg) as Record<string, unknown>
		expect(parsed.xl).toBeUndefined()
		expect(parsed.u).toBe("/dashboard")
	})

	it("NDJSON response body contains redirect + done lines", async () => {
		const redirect = new RedirectResponse({
			href: "https://example.com/path",
			status: 307,
		})

		const response = createRedirectNDJSONResponse(redirect)
		const text = await response.text()
		const lines = text.trim().split("\n")

		expect(lines).toHaveLength(2)

		const redirectLine = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>
		expect(redirectLine.t).toBe("x")
		expect(redirectLine.xl).toBe(true)
		expect(redirectLine.u).toBe("https://example.com/path")

		const doneLine = JSON.parse(lines[1] ?? "{}") as Record<string, unknown>
		expect(doneLine.t).toBe("d")
	})
})
