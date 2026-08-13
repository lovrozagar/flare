import { describe, expect, it } from "vitest"
import { RedirectResponse } from "../../../src/errors/index.ts"

describe("RedirectResponse — default status should be 303 (See Other)", () => {
	it("internal redirect defaults to 303", () => {
		const r = new RedirectResponse({ to: "/foo" })
		expect(r.status).toBe(303)
	})

	it("external redirect defaults to 303", () => {
		const r = new RedirectResponse({ href: "https://example.com" })
		expect(r.status).toBe(303)
	})

	it("explicit status 302 overrides the default", () => {
		const r = new RedirectResponse({ status: 302, to: "/foo" })
		expect(r.status).toBe(302)
	})
})
