import { expect, test } from "@playwright/test"

function parseCspDirectives(csp: string): Record<string, string> {
	const directives: Record<string, string> = {}
	for (const part of csp.split(";")) {
		const trimmed = part.trim()
		const spaceIdx = trimmed.indexOf(" ")
		if (spaceIdx === -1) {
			directives[trimmed] = ""
		} else {
			directives[trimmed.slice(0, spaceIdx)] = trimmed.slice(spaceIdx + 1)
		}
	}
	return directives
}

/* Dev CSP adds 'unsafe-inline' so Vite HMR and the dashboard overlay work.
   Prod is the nonce-only proof — run this describe on prod projects. */
test.describe("CSP — style-src must not contain unsafe-inline @prod-only", () => {
	test("GET / — style-src has no unsafe-inline", async ({ request }) => {
		const response = await request.get("/")
		const csp = response.headers()["content-security-policy"] ?? ""
		const directives = parseCspDirectives(csp)
		expect(directives["style-src"]).toBeDefined()
		expect(directives["style-src"]).not.toContain("'unsafe-inline'")
	})

	test("GET /about — style-src has no unsafe-inline", async ({ request }) => {
		const response = await request.get("/about")
		const csp = response.headers()["content-security-policy"] ?? ""
		const directives = parseCspDirectives(csp)
		expect(directives["style-src"]).toBeDefined()
		expect(directives["style-src"]).not.toContain("'unsafe-inline'")
	})

	test("GET /about data request — style-src has no unsafe-inline", async ({ request }) => {
		const response = await request.get("/about", {
			headers: { "x-d": "1" },
		})
		const csp = response.headers()["content-security-policy"] ?? ""
		const directives = parseCspDirectives(csp)
		expect(directives["style-src"]).toBeDefined()
		expect(directives["style-src"]).not.toContain("'unsafe-inline'")
	})
})
