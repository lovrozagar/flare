import { describe, expect, it } from "vitest"
import { NONCE_PLACEHOLDER, prerender } from "../../../src/prerender/index.ts"

/* ── Nonce extraction regex (fixed: case-insensitive) ── */

describe("nonce extraction handles case variations", () => {
	function mockHandler(html: string) {
		return {
			fetch: async (req: Request) => {
				if (req.headers.get("x-d") === "1") return new Response("", { status: 200 })
				return new Response(html, {
					headers: { "Content-Type": "text/html" },
					status: 200,
				})
			},
		}
	}

	it("lowercase hex nonce extracted and replaced", async () => {
		const nonce = "deadbeef1234567890abcdef12345678"
		const html = `<script nonce="${nonce}">x</script>`
		const result = await prerender({
			handler: mockHandler(html),
			origin: "http://localhost",
			routes: [{ mode: "static", pathname: "/" }],
		})
		expect(result.entries[0]?.html).toContain(NONCE_PLACEHOLDER)
		expect(result.entries[0]?.html).not.toContain(nonce)
	})

	it("uppercase hex nonce extracted and replaced", async () => {
		const nonce = "DEADBEEF1234567890ABCDEF12345678"
		const html = `<script nonce="${nonce}">x</script>`
		const result = await prerender({
			handler: mockHandler(html),
			origin: "http://localhost",
			routes: [{ mode: "static", pathname: "/" }],
		})
		expect(result.entries[0]?.html).toContain(NONCE_PLACEHOLDER)
		expect(result.entries[0]?.html).not.toContain(nonce)
	})

	it("mixed case hex nonce extracted and replaced", async () => {
		const nonce = "DeAdBeEf1234567890AbCdEf12345678"
		const html = `<script nonce="${nonce}">x</script>`
		const result = await prerender({
			handler: mockHandler(html),
			origin: "http://localhost",
			routes: [{ mode: "static", pathname: "/" }],
		})
		expect(result.entries[0]?.html).toContain(NONCE_PLACEHOLDER)
		expect(result.entries[0]?.html).not.toContain(nonce)
	})
})

/* ── replaceNonce regex safety (fixed: escaped metacharacters) ── */

describe("replaceNonce regex safety", () => {
	it("NONCE_PLACEHOLDER is __FLARE_NONCE__", () => {
		expect(NONCE_PLACEHOLDER).toBe("__FLARE_NONCE__")
	})

	it("escapeRegExp prevents regex metachar injection", () => {
		/* Verify the escaping works on its own */
		const dangerous = "abc.def*ghi"
		const escaped = dangerous.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		const regex = new RegExp(escaped, "g")
		expect("abc.def*ghi matches".replace(regex, "X")).toBe("X matches")
		expect("abcXdefXghi no match".replace(regex, "X")).toBe("abcXdefXghi no match")
	})
})
