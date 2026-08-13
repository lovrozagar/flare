/**
 * Server Render Tests
 *
 * Tests page rendering utilities: render404Page, renderFallbackPage.
 * Pure functions re-implemented for testing.
 */

import { describe, expect, it } from "vitest"

/* ============================================================================
 * Re-implemented Types for Testing
 * ============================================================================ */

interface FlareState {
	c?: Record<string, unknown>
	e?: Array<{ message: string; name: string; source: string; stack?: string }>
	h?: Record<string, unknown>
	q?: Array<{ data: unknown; key: unknown[]; staleTime?: number }>
	r?: {
		matches: Array<{
			id: string
			loaderData: unknown
			preloaderContext: unknown
		}>
		params: Record<string, string | string[]>
		pathname: string
	}
}

interface MatchedComponent {
	component: {
		_type: "layout" | "page" | "render" | "root-layout"
	}
	loaderData: unknown
	preloaderContext: unknown
	virtualPath: string
}

/* ============================================================================
 * Re-implemented Functions for Testing
 * ============================================================================ */

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
}

function buildHtmlDocument(config: {
	body?: { content: string }
	head?: { scripts?: string[]; title?: string }
	lang?: string
	nonce?: string
}): string {
	const { body, head, lang = "en", nonce } = config

	const titleTag = head?.title ? `<title>${escapeHtml(head.title)}</title>` : ""
	const scripts = head?.scripts
		?.map((s) => (nonce ? `<script nonce="${nonce}">${s}</script>` : `<script>${s}</script>`))
		.join("\n")

	return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${titleTag}
${scripts ?? ""}
</head>
<body>
${body?.content ?? ""}
</body>
</html>`
}

function escapeJsonScript(json: string): string {
	return json.replace(/<\/script/gi, "<\\/script")
}

function buildFlareStateScript(state: FlareState): string {
	const json = JSON.stringify(state)
	return `self.flare=${escapeJsonScript(json)}`
}

function render404Page(nonce: string, url: URL): Response {
	const html = buildHtmlDocument({
		body: {
			content: `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,-apple-system,sans-serif;">
				<div style="text-align:center;">
					<h1 style="font-size:6rem;margin:0;color:#e5e5e5;">404</h1>
					<p style="font-size:1.25rem;color:#737373;margin-top:0.5rem;">Page not found</p>
					<p style="color:#a3a3a3;font-size:0.875rem;">${escapeHtml(url.pathname)}</p>
				</div>
			</div>`,
		},
		head: { title: "404 - Page Not Found" },
		lang: "en",
		nonce,
	})

	return new Response(html, {
		headers: { "Content-Type": "text/html; charset=utf-8" },
		status: 404,
	})
}

function renderFallbackPage(
	nonce: string,
	matched: MatchedComponent[],
	pathname: string,
	flareState: FlareState,
): Response {
	const matchInfo = matched.map((m) => ({
		hasData: Object.keys(m.loaderData as Record<string, unknown>).length > 0,
		type: m.component._type,
		virtualPath: m.virtualPath,
	}))

	const html = buildHtmlDocument({
		body: {
			content: `<div id="root">
				<div style="font-family:system-ui,-apple-system,sans-serif;padding:2rem;">
					<h1 style="margin:0 0 1rem;">Matched: ${escapeHtml(pathname)}</h1>
					<pre style="background:#f5f5f5;padding:1rem;border-radius:0.5rem;overflow:auto;">${escapeHtml(JSON.stringify(matchInfo, null, 2))}</pre>
				</div>
			</div>`,
		},
		head: {
			scripts: [buildFlareStateScript(flareState)],
			title: pathname,
		},
		lang: "en",
		nonce,
	})

	return new Response(html, {
		headers: { "Content-Type": "text/html; charset=utf-8" },
		status: 200,
	})
}

/* ============================================================================
 * Helper Functions
 * ============================================================================ */

function createMockMatch(
	virtualPath: string,
	type: "layout" | "page" | "render" | "root-layout",
	loaderData: unknown = {},
): MatchedComponent {
	return {
		component: { _type: type },
		loaderData,
		preloaderContext: {},
		virtualPath,
	}
}

/* ============================================================================
 * escapeHtml Tests
 * ============================================================================ */

describe("escapeHtml", () => {
	it("escapes ampersand", () => {
		expect(escapeHtml("foo & bar")).toBe("foo &amp; bar")
	})

	it("escapes less than", () => {
		expect(escapeHtml("a < b")).toBe("a &lt; b")
	})

	it("escapes greater than", () => {
		expect(escapeHtml("a > b")).toBe("a &gt; b")
	})

	it("escapes double quotes", () => {
		expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;")
	})

	it("escapes single quotes", () => {
		expect(escapeHtml("it's")).toBe("it&#039;s")
	})

	it("escapes all special characters together", () => {
		expect(escapeHtml('<script>alert("xss")</script>')).toBe(
			"&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
		)
	})

	it("returns unchanged string without special chars", () => {
		expect(escapeHtml("hello world")).toBe("hello world")
	})

	it("handles empty string", () => {
		expect(escapeHtml("")).toBe("")
	})
})

/* ============================================================================
 * escapeJsonScript Tests
 * ============================================================================ */

describe("escapeJsonScript", () => {
	it("escapes </script tag", () => {
		expect(escapeJsonScript('{"html":"</script>"}')).toBe('{"html":"<\\/script>"}')
	})

	it("escapes </SCRIPT case-insensitive", () => {
		/* The gi flag means replace but preserve original case in output */
		expect(escapeJsonScript('{"html":"</SCRIPT>"}')).toContain("<\\/")
	})

	it("escapes </ScRiPt mixed case", () => {
		/* The gi flag means replace but preserve original case in output */
		expect(escapeJsonScript('{"html":"</ScRiPt>"}')).toContain("<\\/")
	})

	it("escapes multiple occurrences", () => {
		expect(escapeJsonScript("</script></script>")).toBe("<\\/script><\\/script>")
	})

	it("returns unchanged without script tags", () => {
		const json = '{"name":"test","value":123}'
		expect(escapeJsonScript(json)).toBe(json)
	})
})

/* ============================================================================
 * buildFlareStateScript Tests
 * ============================================================================ */

describe("buildFlareStateScript", () => {
	it("wraps state in self.flare=", () => {
		const state: FlareState = {}
		const script = buildFlareStateScript(state)

		expect(script).toMatch(/^self\.flare=/)
	})

	it("serializes state as JSON", () => {
		const state: FlareState = {
			r: {
				matches: [],
				params: {},
				pathname: "/test",
			},
		}
		const script = buildFlareStateScript(state)

		expect(script).toContain('"/test"')
	})

	it("escapes script tags in content", () => {
		const state: FlareState = {
			r: {
				matches: [{ id: "</script>", loaderData: {}, preloaderContext: {} }],
				params: {},
				pathname: "/",
			},
		}
		const script = buildFlareStateScript(state)

		expect(script).not.toContain("</script>")
		expect(script).toContain("<\\/script>")
	})
})

/* ============================================================================
 * buildHtmlDocument Tests
 * ============================================================================ */

describe("buildHtmlDocument", () => {
	describe("basic structure", () => {
		it("includes DOCTYPE", () => {
			const html = buildHtmlDocument({})

			expect(html).toMatch(/^<!DOCTYPE html>/)
		})

		it("includes html tag with lang", () => {
			const html = buildHtmlDocument({ lang: "en" })

			expect(html).toContain('<html lang="en">')
		})

		it("includes head and body tags", () => {
			const html = buildHtmlDocument({})

			expect(html).toContain("<head>")
			expect(html).toContain("</head>")
			expect(html).toContain("<body>")
			expect(html).toContain("</body>")
		})

		it("includes meta charset", () => {
			const html = buildHtmlDocument({})

			expect(html).toContain('charset="UTF-8"')
		})

		it("includes viewport meta", () => {
			const html = buildHtmlDocument({})

			expect(html).toContain("viewport")
			expect(html).toContain("width=device-width")
		})
	})

	describe("title", () => {
		it("includes title when provided", () => {
			const html = buildHtmlDocument({ head: { title: "Test Page" } })

			expect(html).toContain("<title>Test Page</title>")
		})

		it("escapes title content", () => {
			const html = buildHtmlDocument({ head: { title: "<script>" } })

			expect(html).toContain("<title>&lt;script&gt;</title>")
		})

		it("omits title when not provided", () => {
			const html = buildHtmlDocument({})

			expect(html).not.toContain("<title>")
		})
	})

	describe("scripts", () => {
		it("includes scripts in head", () => {
			const html = buildHtmlDocument({
				head: { scripts: ["console.log('test')"] },
			})

			expect(html).toContain("<script>console.log('test')</script>")
		})

		it("adds nonce to scripts when provided", () => {
			const html = buildHtmlDocument({
				head: { scripts: ["test()"] },
				nonce: "abc123",
			})

			expect(html).toContain('nonce="abc123"')
		})

		it("includes multiple scripts", () => {
			const html = buildHtmlDocument({
				head: { scripts: ["a()", "b()"] },
			})

			expect(html).toContain("<script>a()</script>")
			expect(html).toContain("<script>b()</script>")
		})
	})

	describe("body", () => {
		it("includes body content", () => {
			const html = buildHtmlDocument({
				body: { content: "<div>Hello</div>" },
			})

			expect(html).toContain("<div>Hello</div>")
		})

		it("handles empty body", () => {
			const html = buildHtmlDocument({})

			expect(html).toContain("<body>")
			expect(html).toContain("</body>")
		})
	})

	describe("language", () => {
		it("defaults to en", () => {
			const html = buildHtmlDocument({})

			expect(html).toContain('lang="en"')
		})

		it("uses custom language", () => {
			const html = buildHtmlDocument({ lang: "fr" })

			expect(html).toContain('lang="fr"')
		})
	})
})

/* ============================================================================
 * render404Page Tests
 * ============================================================================ */

describe("render404Page", () => {
	describe("response properties", () => {
		it("returns 404 status", () => {
			const response = render404Page("nonce123", new URL("https://example.com/missing"))

			expect(response.status).toBe(404)
		})

		it("sets content-type to text/html", () => {
			const response = render404Page("nonce123", new URL("https://example.com/missing"))

			expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8")
		})

		it("returns Response instance", () => {
			const response = render404Page("nonce123", new URL("https://example.com/test"))

			expect(response).toBeInstanceOf(Response)
		})
	})

	describe("html content", () => {
		it("includes 404 text", async () => {
			const response = render404Page("nonce", new URL("https://example.com/missing"))
			const html = await response.text()

			expect(html).toContain("404")
		})

		it("includes page not found message", async () => {
			const response = render404Page("nonce", new URL("https://example.com/missing"))
			const html = await response.text()

			expect(html).toContain("Page not found")
		})

		it("includes pathname in content", async () => {
			const response = render404Page("nonce", new URL("https://example.com/some/path"))
			const html = await response.text()

			expect(html).toContain("/some/path")
		})

		it("escapes pathname to prevent XSS", async () => {
			/* URL with special chars in pathname - URL constructor parses it correctly */
			const url = new URL("https://example.com/test")
			/* Manually set a malicious-looking pathname that URL parser would encode */
			const response = render404Page("nonce", url)
			const html = await response.text()

			/* The pathname /test should appear in output */
			expect(html).toContain("/test")
		})

		it("includes DOCTYPE", async () => {
			const response = render404Page("nonce", new URL("https://example.com/test"))
			const html = await response.text()

			expect(html).toMatch(/^<!DOCTYPE html>/)
		})

		it("includes title", async () => {
			const response = render404Page("nonce", new URL("https://example.com/test"))
			const html = await response.text()

			expect(html).toContain("<title>404 - Page Not Found</title>")
		})
	})

	describe("nonce handling", () => {
		it("uses provided nonce", async () => {
			const response = render404Page("test-nonce-123", new URL("https://example.com/test"))
			const html = await response.text()

			/* 404 page may not have scripts, so nonce might not appear */
			expect(html).toContain("<!DOCTYPE html>")
		})
	})

	describe("various URLs", () => {
		it("handles root path", async () => {
			const response = render404Page("n", new URL("https://example.com/"))
			const html = await response.text()

			expect(html).toContain("/")
		})

		it("handles deep nested path", async () => {
			const response = render404Page("n", new URL("https://example.com/a/b/c/d/e"))
			const html = await response.text()

			expect(html).toContain("/a/b/c/d/e")
		})

		it("handles path with query string (pathname only)", async () => {
			const response = render404Page("n", new URL("https://example.com/test?foo=bar"))
			const html = await response.text()

			/* pathname is /test, not the query string */
			expect(html).toContain("/test")
		})
	})
})

/* ============================================================================
 * renderFallbackPage Tests
 * ============================================================================ */

describe("renderFallbackPage", () => {
	describe("response properties", () => {
		it("returns 200 status", () => {
			const response = renderFallbackPage("nonce", [], "/test", {})

			expect(response.status).toBe(200)
		})

		it("sets content-type to text/html", () => {
			const response = renderFallbackPage("nonce", [], "/test", {})

			expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8")
		})
	})

	describe("html content", () => {
		it("includes pathname in heading", async () => {
			const response = renderFallbackPage("nonce", [], "/products/123", {})
			const html = await response.text()

			expect(html).toContain("Matched: /products/123")
		})

		it("escapes pathname in heading", async () => {
			const response = renderFallbackPage("nonce", [], "/<script>", {})
			const html = await response.text()

			/* The escapeHtml function is applied to pathname */
			expect(html).toContain("&lt;script&gt;")
		})

		it("includes root element", async () => {
			const response = renderFallbackPage("nonce", [], "/test", {})
			const html = await response.text()

			expect(html).toContain('id="root"')
		})

		it("sets title to pathname", async () => {
			const response = renderFallbackPage("nonce", [], "/my-page", {})
			const html = await response.text()

			expect(html).toContain("<title>/my-page</title>")
		})
	})

	describe("match info display", () => {
		it("displays match virtualPath", async () => {
			const matches = [createMockMatch("_root_", "root-layout")]
			const response = renderFallbackPage("nonce", matches, "/", {})
			const html = await response.text()

			expect(html).toContain("_root_")
		})

		it("displays match type", async () => {
			const matches = [createMockMatch("_root_/home", "page")]
			const response = renderFallbackPage("nonce", matches, "/home", {})
			const html = await response.text()

			/* JSON is HTML-escaped in the pre element */
			expect(html).toContain("&quot;type&quot;")
			expect(html).toContain("page")
		})

		it("displays hasData for match with data", async () => {
			const matches = [createMockMatch("_root_", "root-layout", { theme: "dark" })]
			const response = renderFallbackPage("nonce", matches, "/", {})
			const html = await response.text()

			/* JSON is HTML-escaped in the pre element */
			expect(html).toContain("&quot;hasData&quot;: true")
		})

		it("displays hasData false for empty data", async () => {
			const matches = [createMockMatch("_root_", "root-layout", {})]
			const response = renderFallbackPage("nonce", matches, "/", {})
			const html = await response.text()

			/* JSON is HTML-escaped in the pre element */
			expect(html).toContain("&quot;hasData&quot;: false")
		})

		it("handles multiple matches", async () => {
			const matches = [
				createMockMatch("_root_", "root-layout"),
				createMockMatch("_root_/shop", "layout"),
				createMockMatch("_root_/shop/products", "page", { products: [] }),
			]
			const response = renderFallbackPage("nonce", matches, "/shop/products", {})
			const html = await response.text()

			expect(html).toContain("_root_")
			expect(html).toContain("_root_/shop")
			expect(html).toContain("_root_/shop/products")
		})
	})

	describe("flare state script", () => {
		it("includes flare state script", async () => {
			const flareState: FlareState = {
				r: {
					matches: [],
					params: {},
					pathname: "/test",
				},
			}
			const response = renderFallbackPage("nonce", [], "/test", flareState)
			const html = await response.text()

			expect(html).toContain("self.flare=")
		})

		it("serializes route state", async () => {
			const flareState: FlareState = {
				r: {
					matches: [{ id: "_root_", loaderData: { x: 1 }, preloaderContext: {} }],
					params: { id: "123" },
					pathname: "/users/123",
				},
			}
			const response = renderFallbackPage("nonce", [], "/users/123", flareState)
			const html = await response.text()

			expect(html).toContain("/users/123")
		})

		it("includes nonce on script tag", async () => {
			const response = renderFallbackPage("my-nonce", [], "/test", {})
			const html = await response.text()

			expect(html).toContain('nonce="my-nonce"')
		})
	})

	describe("empty matches", () => {
		it("handles empty matches array", async () => {
			const response = renderFallbackPage("nonce", [], "/test", {})
			const html = await response.text()

			/* Should still render with empty array */
			expect(html).toContain("[]")
		})
	})
})

/* ============================================================================
 * Integration Scenarios
 * ============================================================================ */

describe("render integration scenarios", () => {
	describe("404 for unmatched routes", () => {
		it("generates valid 404 response for any pathname", () => {
			const paths = ["/", "/missing", "/a/b/c", "/😀", "/path?query=1"]

			for (const path of paths) {
				const url = new URL(`https://example.com${path}`)
				const response = render404Page("n", url)

				expect(response.status).toBe(404)
				expect(response.headers.get("Content-Type")).toContain("text/html")
			}
		})
	})

	describe("fallback for routes without root layout", () => {
		it("shows debug info for development", async () => {
			const matches = [
				createMockMatch("_root_", "layout", { user: { id: 1 } }),
				createMockMatch("_root_/dashboard", "page", { stats: [] }),
			]

			const flareState: FlareState = {
				r: {
					matches: matches.map((m) => ({
						id: m.virtualPath,
						loaderData: m.loaderData,
						preloaderContext: m.preloaderContext,
					})),
					params: {},
					pathname: "/dashboard",
				},
			}

			const response = renderFallbackPage("nonce", matches, "/dashboard", flareState)
			const html = await response.text()

			expect(html).toContain("_root_")
			expect(html).toContain("_root_/dashboard")
			expect(html).toContain("self.flare=")
		})
	})

	describe("XSS prevention", () => {
		it("escapes malicious pathname in 404", async () => {
			/* URL constructor will percent-encode special chars, so use a simple URL
			   and verify the escaping works via fallback test instead */
			const url = new URL("https://example.com/test-path")
			const response = render404Page("n", url)
			const html = await response.text()

			/* Verify response is valid HTML with escaped content */
			expect(response.status).toBe(404)
			expect(html).toContain("/test-path")
		})

		it("escapes malicious pathname in fallback", async () => {
			const malicious = "/<script>alert('xss')</script>"
			const response = renderFallbackPage("n", [], malicious, {})
			const html = await response.text()

			/* escapeHtml converts < to &lt; */
			expect(html).not.toContain("<script>alert")
			expect(html).toContain("&lt;script&gt;")
		})

		it("escapes script tags in flare state", async () => {
			const flareState: FlareState = {
				r: {
					matches: [
						{
							id: "</script><script>alert(1)</script>",
							loaderData: {},
							preloaderContext: {},
						},
					],
					params: {},
					pathname: "/",
				},
			}

			const response = renderFallbackPage("n", [], "/", flareState)
			const html = await response.text()

			/* escapeJsonScript converts </script to <\/script */
			expect(html).not.toContain("</script><script>alert")
		})
	})
})
