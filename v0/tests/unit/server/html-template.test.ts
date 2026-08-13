/**
 * HTML Template Builder Unit Tests
 *
 * Tests HTML document construction.
 * Template-based (NOT string replace), ordered injections.
 */

import { describe, expect, it } from "vitest"
import {
	buildDataScript,
	buildHtmlDocument,
	buildInlineScript,
	escapeHtml,
} from "../../../src/server/_internal/html-template"

describe("buildHtmlDocument", () => {
	const testNonce = "abc123def456789012345678901234ab"

	describe("basic structure", () => {
		it("produces valid HTML5 document", () => {
			const html = buildHtmlDocument({
				body: { content: "<div>Hello</div>" },
				head: {},
				nonce: testNonce,
			})
			expect(html).toMatch(/^<!DOCTYPE html>/)
			expect(html).toContain("<html")
			expect(html).toContain("<head>")
			expect(html).toContain("</head>")
			expect(html).toContain("<body")
			expect(html).toContain("</body>")
			expect(html).toContain("</html>")
		})

		it("includes body content", () => {
			const html = buildHtmlDocument({
				body: { content: "<div>Test Content</div>" },
				head: {},
				nonce: testNonce,
			})
			expect(html).toContain("<div>Test Content</div>")
		})

		it("includes html lang attribute", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: {},
				lang: "en",
				nonce: testNonce,
			})
			expect(html).toContain('<html lang="en">')
		})

		it("includes html dir attribute", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				dir: "rtl",
				head: {},
				nonce: testNonce,
			})
			expect(html).toContain('dir="rtl"')
		})
	})

	describe("head injections", () => {
		it("includes title", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: { title: "My Page" },
				nonce: testNonce,
			})
			expect(html).toContain("<title>My Page</title>")
		})

		it("escapes title content", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: { title: "Page <script>alert('xss')</script>" },
				nonce: testNonce,
			})
			expect(html).toContain("&lt;script&gt;")
			expect(html).not.toContain("<script>alert")
		})

		it("includes meta tags", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: {
					meta: [
						{ content: "Test description", name: "description" },
						{ content: "keyword1, keyword2", name: "keywords" },
					],
				},
				nonce: testNonce,
			})
			expect(html).toContain('<meta name="description" content="Test description">')
			expect(html).toContain('<meta name="keywords" content="keyword1, keyword2">')
		})

		it("includes charset meta", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: {},
				nonce: testNonce,
			})
			expect(html).toContain('<meta charset="utf-8">')
		})

		it("includes viewport meta", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: {},
				nonce: testNonce,
			})
			expect(html).toContain('<meta name="viewport"')
		})

		it("includes link tags", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: {
					links: [
						{ href: "/favicon.ico", rel: "icon" },
						{ href: "/styles.css", rel: "stylesheet" },
					],
				},
				nonce: testNonce,
			})
			expect(html).toContain('<link rel="icon" href="/favicon.ico">')
			expect(html).toContain('<link rel="stylesheet" href="/styles.css">')
		})

		it("includes style tags with nonce", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: {
					styles: [".test { color: red; }"],
				},
				nonce: testNonce,
			})
			expect(html).toContain(`<style nonce="${testNonce}">.test { color: red; }</style>`)
		})

		it("includes head scripts with nonce", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: {
					scripts: ["console.log('head')"],
				},
				nonce: testNonce,
			})
			expect(html).toContain(`<script nonce="${testNonce}">console.log('head')</script>`)
		})
	})

	describe("body injections", () => {
		it("includes body scripts with nonce", () => {
			const html = buildHtmlDocument({
				body: {
					content: "<div>App</div>",
					scripts: ["console.log('body')"],
				},
				head: {},
				nonce: testNonce,
			})
			expect(html).toContain(`<script nonce="${testNonce}">console.log('body')</script>`)
		})

		it("includes module scripts", () => {
			const html = buildHtmlDocument({
				body: {
					content: "<div>App</div>",
					moduleScripts: ["/client.js"],
				},
				head: {},
				nonce: testNonce,
			})
			expect(html).toContain(
				`<script nonce="${testNonce}" type="module" src="/client.js"></script>`,
			)
		})

		it("includes data scripts as JSON", () => {
			const html = buildHtmlDocument({
				body: {
					content: "<div>App</div>",
					dataScripts: [{ data: { params: {}, route: "/home" }, id: "__ROUTE_DATA__" }],
				},
				head: {},
				nonce: testNonce,
			})
			expect(html).toContain(
				`<script nonce="${testNonce}" id="__ROUTE_DATA__" type="application/json">`,
			)
			expect(html).toContain('"route":"/home"')
		})

		it("includes body attributes", () => {
			const html = buildHtmlDocument({
				body: {
					attributes: { "data-runtime": "client", "data-theme": "dark" },
					content: "",
				},
				head: {},
				nonce: testNonce,
			})
			expect(html).toContain('data-runtime="client"')
			expect(html).toContain('data-theme="dark"')
		})
	})

	describe("injection order", () => {
		it("places trusted types policy first in head", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: {
					scripts: ["console.log('other')"],
				},
				nonce: testNonce,
				trustedTypesPolicy: "trustedTypes.createPolicy('default', {})",
			})
			const trustedTypesPos = html.indexOf("trustedTypes.createPolicy")
			const otherScriptPos = html.indexOf("console.log('other')")
			expect(trustedTypesPos).toBeLessThan(otherScriptPos)
		})

		it("places charset first in head", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: { title: "Test" },
				nonce: testNonce,
			})
			const charsetPos = html.indexOf('charset="utf-8"')
			const titlePos = html.indexOf("<title>")
			expect(charsetPos).toBeLessThan(titlePos)
		})

		it("places styles before scripts in head", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: {
					scripts: ["console.log('script')"],
					styles: [".test { color: red; }"],
				},
				nonce: testNonce,
			})
			const stylePos = html.indexOf("<style")
			const scriptPos = html.indexOf("console.log('script')")
			expect(stylePos).toBeLessThan(scriptPos)
		})

		it("places data scripts before module scripts in body", () => {
			const html = buildHtmlDocument({
				body: {
					content: "<div>App</div>",
					dataScripts: [{ data: {}, id: "__DATA__" }],
					moduleScripts: ["/client.js"],
				},
				head: {},
				nonce: testNonce,
			})
			const dataPos = html.indexOf("__DATA__")
			const modulePos = html.indexOf("/client.js")
			expect(dataPos).toBeLessThan(modulePos)
		})

		it("places body scripts before closing body tag", () => {
			const html = buildHtmlDocument({
				body: {
					content: "<div>App</div>",
					scripts: ["console.log('test')"],
				},
				head: {},
				nonce: testNonce,
			})
			const scriptPos = html.indexOf("console.log('test')")
			const bodyClosePos = html.indexOf("</body>")
			expect(scriptPos).toBeLessThan(bodyClosePos)
		})
	})

	describe("html attributes", () => {
		it("includes custom html attributes", () => {
			const html = buildHtmlDocument({
				body: { content: "" },
				head: {},
				htmlAttributes: { "data-theme": "dark" },
				nonce: testNonce,
			})
			expect(html).toContain('data-theme="dark"')
		})
	})
})

describe("escapeHtml", () => {
	it("escapes less than", () => {
		expect(escapeHtml("<")).toBe("&lt;")
	})

	it("escapes greater than", () => {
		expect(escapeHtml(">")).toBe("&gt;")
	})

	it("escapes ampersand", () => {
		expect(escapeHtml("&")).toBe("&amp;")
	})

	it("escapes double quotes", () => {
		expect(escapeHtml('"')).toBe("&quot;")
	})

	it("escapes single quotes", () => {
		expect(escapeHtml("'")).toBe("&#39;")
	})

	it("escapes complex strings", () => {
		expect(escapeHtml('<script>alert("xss")</script>')).toBe(
			"&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
		)
	})

	it("returns empty string for empty input", () => {
		expect(escapeHtml("")).toBe("")
	})
})

describe("buildDataScript", () => {
	it("creates JSON script tag", () => {
		const script = buildDataScript("__DATA__", { key: "value" }, testNonce)
		expect(script).toContain('type="application/json"')
		expect(script).toContain('id="__DATA__"')
		expect(script).toContain('"key":"value"')
	})

	it("includes nonce", () => {
		const script = buildDataScript("__DATA__", {}, testNonce)
		expect(script).toContain(`nonce="${testNonce}"`)
	})

	it("escapes script content", () => {
		const script = buildDataScript("__DATA__", { html: "</script>" }, testNonce)
		expect(script).not.toContain("</script></script>")
	})
})

describe("buildInlineScript", () => {
	it("creates script tag", () => {
		const script = buildInlineScript("console.log('test')", testNonce)
		expect(script).toContain("<script")
		expect(script).toContain("console.log('test')")
		expect(script).toContain("</script>")
	})

	it("includes nonce", () => {
		const script = buildInlineScript("test()", testNonce)
		expect(script).toContain(`nonce="${testNonce}"`)
	})
})

const testNonce = "abc123def456789012345678901234ab"
