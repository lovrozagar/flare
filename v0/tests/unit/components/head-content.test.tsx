/**
 * HeadContent Component Unit Tests
 *
 * Tests SSR rendering of head elements from resolved HeadConfig.
 */

import { renderToString } from "solid-js/web"
import { describe, expect, it } from "vitest"
import { HeadContent } from "../../../src/components/head-content"
import { SSRContextProvider, type SSRContextValue } from "../../../src/components/ssr-context"

function renderWithContext(value: SSRContextValue): string {
	return renderToString(() => (
		<SSRContextProvider value={value}>
			<HeadContent />
		</SSRContextProvider>
	))
}

describe("HeadContent", () => {
	describe("SSR rendering", () => {
		it("renders nothing when no resolvedHead", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
			})
			/* Solid SSR includes hydration markers - check no actual head elements rendered */
			expect(html).not.toContain("<title")
			expect(html).not.toContain("<meta")
			expect(html).not.toContain("<link")
		})

		it("renders title element", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: { title: "My Page Title" },
			})
			expect(html).toContain("<title")
			expect(html).toContain(">My Page Title</title>")
		})

		it("renders meta description", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: { description: "Page description here" },
			})
			expect(html).toContain('name="description"')
			expect(html).toContain('content="Page description here"')
		})

		it("renders meta keywords", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: { keywords: "react, solid, framework" },
			})
			expect(html).toContain('name="keywords"')
			expect(html).toContain('content="react, solid, framework"')
		})

		it("renders canonical link", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: { canonical: "https://example.com/page" },
			})
			expect(html).toContain('rel="canonical"')
			expect(html).toContain('href="https://example.com/page"')
		})

		it("renders robots meta", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: { robots: { follow: true, index: true } },
			})
			expect(html).toContain('name="robots"')
			expect(html).toContain("index")
			expect(html).toContain("follow")
		})

		it("renders robots noindex, nofollow", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: { robots: { follow: false, index: false } },
			})
			expect(html).toContain('name="robots"')
			expect(html).toContain("noindex")
			expect(html).toContain("nofollow")
		})

		it("renders Open Graph meta tags", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: {
					openGraph: {
						description: "OG Description",
						siteName: "My Site",
						title: "OG Title",
						type: "website",
					},
				},
			})
			expect(html).toContain('property="og:title"')
			expect(html).toContain('content="OG Title"')
			expect(html).toContain('property="og:type"')
			expect(html).toContain('content="website"')
		})

		it("renders Twitter card meta tags", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: {
					twitter: {
						card: "summary_large_image",
						description: "Twitter desc",
						title: "Twitter Title",
					},
				},
			})
			expect(html).toContain('name="twitter:card"')
			expect(html).toContain('content="summary_large_image"')
			expect(html).toContain('name="twitter:title"')
		})

		it("renders multiple elements together", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: {
					canonical: "https://example.com",
					description: "Full page",
					title: "Full Page",
				},
			})
			expect(html).toContain("<title")
			expect(html).toContain(">Full Page</title>")
			expect(html).toContain('name="description"')
			expect(html).toContain('rel="canonical"')
		})
	})

	describe("client rendering", () => {
		it("renders nothing on client (isServer=false)", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: false,
				nonce: "",
				resolvedHead: { title: "Should Not Render" },
			})
			expect(html).toBe("")
		})
	})

	describe("edge cases", () => {
		it("handles empty resolvedHead object", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: {},
			})
			/* Solid SSR includes hydration markers - check no actual head elements rendered */
			expect(html).not.toContain("<title")
			expect(html).not.toContain("<meta")
			expect(html).not.toContain("<link")
		})

		it("escapes HTML in title", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: { title: "Title with <script>alert('xss')</script>" },
			})
			/* Solid escapes HTML entities in text content */
			expect(html).not.toContain("<script>alert")
			expect(html).toMatch(/&(amp;)?lt;script/)
		})

		it("escapes HTML in description", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
				resolvedHead: { description: 'Desc with "quotes"' },
			})
			/* Solid escapes quotes in attributes to prevent injection */
			expect(html).not.toContain('content="Desc with "quotes""')
			expect(html).toContain("&quot;")
		})
	})
})
