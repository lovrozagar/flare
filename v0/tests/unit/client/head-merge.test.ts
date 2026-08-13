/**
 * Head Merge Unit Tests
 *
 * Tests Turbo Drive-style head merging for CSR navigation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	applyHeadConfig,
	applyHeadConfigForRoute,
	applyPerRouteHeads,
	clearRouteTracking,
	extractHead,
	extractHtmlAttributes,
	getCurrentRouteHierarchy,
	mergeHead,
	parseAttributes,
	updateHtmlAttributes,
} from "../../../src/client/head-merge"
import type { HeadConfig } from "../../../src/router/_internal/types"

describe("parseAttributes", () => {
	it("parses double-quoted attributes", () => {
		const result = parseAttributes('name="description" content="Test page"')
		expect(result).toEqual({ content: "Test page", name: "description" })
	})

	it("parses single-quoted attributes", () => {
		const result = parseAttributes("name='keywords' content='a, b, c'")
		expect(result).toEqual({ content: "a, b, c", name: "keywords" })
	})

	it("parses unquoted attributes", () => {
		const result = parseAttributes("type=module src=app.js")
		expect(result).toEqual({ src: "app.js", type: "module" })
	})

	it("parses boolean attributes", () => {
		const result = parseAttributes("async defer type=module")
		expect(result).toEqual({ async: "", defer: "", type: "module" })
	})

	it("parses data attributes", () => {
		const result = parseAttributes('data-theme="dark" data-version="2"')
		expect(result).toEqual({ "data-theme": "dark", "data-version": "2" })
	})
})

describe("extractHead", () => {
	it("extracts title", () => {
		const html = "<html><head><title>My Page</title></head></html>"
		const result = extractHead(html)
		expect(result.title).toBe("My Page")
	})

	it("uses last title found (page overrides root)", () => {
		const html = "<html><head><title>Root</title><title>Page</title></head></html>"
		const result = extractHead(html)
		expect(result.title).toBe("Page")
	})

	it("extracts meta tags with name", () => {
		const html = '<html><head><meta name="description" content="Test desc"></head></html>'
		const result = extractHead(html)
		expect(result.meta).toHaveLength(1)
		expect(result.meta[0]).toMatchObject({
			content: "Test desc",
			key: "description",
		})
	})

	it("extracts meta tags with property (OpenGraph)", () => {
		const html = '<html><head><meta property="og:title" content="OG Title"></head></html>'
		const result = extractHead(html)
		expect(result.meta).toHaveLength(1)
		expect(result.meta[0]).toMatchObject({
			content: "OG Title",
			key: "og:title",
		})
	})

	it("extracts link tags", () => {
		const html = '<html><head><link rel="stylesheet" href="/styles.css"></head></html>'
		const result = extractHead(html)
		expect(result.links).toHaveLength(1)
		expect(result.links[0]).toMatchObject({
			href: "/styles.css",
			rel: "stylesheet",
		})
	})

	it("extracts script tags with src", () => {
		const html = '<html><head><script src="/app.js" type="module"></script></head></html>'
		const result = extractHead(html)
		expect(result.scripts).toHaveLength(1)
		expect(result.scripts[0]).toMatchObject({
			src: "/app.js",
		})
	})

	it("ignores inline scripts (no src)", () => {
		const html = "<html><head><script>console.log('hi')</script></head></html>"
		const result = extractHead(html)
		expect(result.scripts).toHaveLength(0)
	})

	it("returns empty for missing elements", () => {
		const html = "<html><head></head></html>"
		const result = extractHead(html)
		expect(result.title).toBeNull()
		expect(result.meta).toHaveLength(0)
		expect(result.links).toHaveLength(0)
		expect(result.scripts).toHaveLength(0)
	})
})

describe("extractHtmlAttributes", () => {
	it("extracts lang attribute", () => {
		const html = '<html lang="en"><head></head></html>'
		const result = extractHtmlAttributes(html)
		expect(result.lang).toBe("en")
	})

	it("extracts dir attribute", () => {
		const html = '<html dir="rtl"><head></head></html>'
		const result = extractHtmlAttributes(html)
		expect(result.dir).toBe("rtl")
	})

	it("extracts class attribute", () => {
		const html = '<html class="dark"><head></head></html>'
		const result = extractHtmlAttributes(html)
		expect(result.class).toBe("dark")
	})

	it("extracts data attributes", () => {
		const html = '<html data-theme="dark" data-version="2"><head></head></html>'
		const result = extractHtmlAttributes(html)
		expect(result["data-theme"]).toBe("dark")
		expect(result["data-version"]).toBe("2")
	})

	it("returns empty object for no attributes", () => {
		const html = "<html><head></head></html>"
		const result = extractHtmlAttributes(html)
		expect(result).toEqual({})
	})
})

describe("mergeHead", () => {
	let mockHead: {
		appendChild: ReturnType<typeof vi.fn>
		querySelector: ReturnType<typeof vi.fn>
		querySelectorAll: ReturnType<typeof vi.fn>
	}
	let originalDocument: typeof globalThis.document

	beforeEach(() => {
		originalDocument = globalThis.document
		mockHead = {
			appendChild: vi.fn(),
			querySelector: vi.fn(() => null),
			querySelectorAll: vi.fn(() => []),
		}

		;(globalThis as Record<string, unknown>).document = {
			createElement: vi.fn(() => ({
				getAttribute: vi.fn(),
				href: "",
				rel: "",
				setAttribute: vi.fn(),
			})),
			head: mockHead,
			title: "Old Title",
		}
	})

	afterEach(() => {
		;(globalThis as Record<string, unknown>).document = originalDocument
	})

	it("updates title when changed", () => {
		const newHead = {
			links: [],
			meta: [],
			scripts: [],
			title: "New Title",
		}

		mergeHead(newHead)

		expect(document.title).toBe("New Title")
	})

	it("does not update title when same", () => {
		;(globalThis as Record<string, unknown>).document = {
			createElement: vi.fn(() => ({
				getAttribute: vi.fn(),
				href: "",
				rel: "",
				setAttribute: vi.fn(),
			})),
			head: mockHead,
			title: "Same Title",
		}

		const newHead = {
			links: [],
			meta: [],
			scripts: [],
			title: "Same Title",
		}

		mergeHead(newHead)

		expect(document.title).toBe("Same Title")
	})

	it("adds new meta tag when not found", () => {
		const newHead = {
			links: [],
			meta: [
				{
					attrs: { content: "Test desc", name: "description" },
					content: "Test desc",
					key: "description",
				},
			],
			scripts: [],
			title: null,
		}

		mergeHead(newHead)

		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("adds new stylesheet when not existing", () => {
		const newHead = {
			links: [
				{ attrs: { href: "/new.css", rel: "stylesheet" }, href: "/new.css", rel: "stylesheet" },
			],
			meta: [],
			scripts: [],
			title: null,
		}

		mergeHead(newHead)

		expect(mockHead.appendChild).toHaveBeenCalled()
	})
})

describe("updateHtmlAttributes", () => {
	let originalDocument: typeof globalThis.document
	let mockSetAttribute: ReturnType<typeof vi.fn>

	beforeEach(() => {
		originalDocument = globalThis.document
		mockSetAttribute = vi.fn()

		;(globalThis as Record<string, unknown>).document = {
			documentElement: {
				className: "",
				dir: "",
				getAttribute: vi.fn(() => null),
				lang: "",
				setAttribute: mockSetAttribute,
			},
		}
	})

	afterEach(() => {
		;(globalThis as Record<string, unknown>).document = originalDocument
	})

	it("updates lang attribute", () => {
		updateHtmlAttributes({ lang: "fr" })
		expect(document.documentElement.lang).toBe("fr")
	})

	it("updates dir attribute", () => {
		updateHtmlAttributes({ dir: "rtl" })
		expect(document.documentElement.dir).toBe("rtl")
	})

	it("updates class attribute", () => {
		updateHtmlAttributes({ class: "dark mode" })
		expect(document.documentElement.className).toBe("dark mode")
	})

	it("updates data attributes", () => {
		updateHtmlAttributes({ "data-theme": "dark" })
		expect(mockSetAttribute).toHaveBeenCalledWith("data-theme", "dark")
	})
})

describe("applyHeadConfig", () => {
	let mockHead: {
		appendChild: ReturnType<typeof vi.fn>
		querySelector: ReturnType<typeof vi.fn>
		querySelectorAll: ReturnType<typeof vi.fn>
	}
	let originalDocument: typeof globalThis.document

	beforeEach(() => {
		originalDocument = globalThis.document
		mockHead = {
			appendChild: vi.fn(),
			querySelector: vi.fn(() => null),
			querySelectorAll: vi.fn(() => []),
		}

		;(globalThis as Record<string, unknown>).document = {
			body: {
				querySelector: vi.fn(() => null),
			},
			createElement: vi.fn(() => ({
				content: "",
				href: "",
				hreflang: "",
				rel: "",
				setAttribute: vi.fn(),
				src: "",
				textContent: "",
				type: "",
			})),
			head: mockHead,
			title: "Old Title",
		}
	})

	afterEach(() => {
		;(globalThis as Record<string, unknown>).document = originalDocument
	})

	it("updates title from config", () => {
		const config: HeadConfig = { title: "New Config Title" }
		applyHeadConfig(config)
		expect(document.title).toBe("New Config Title")
	})

	it("adds description meta when not found", () => {
		const config: HeadConfig = { description: "Test description" }
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("updates canonical link", () => {
		const config: HeadConfig = { canonical: "https://example.com/page" }
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies OpenGraph meta tags", () => {
		const config: HeadConfig = {
			openGraph: {
				description: "OG desc",
				title: "OG Title",
				type: "website",
			},
		}
		applyHeadConfig(config)
		/* Should add og:title, og:description, og:type */
		expect(mockHead.appendChild).toHaveBeenCalledTimes(3)
	})

	it("applies Twitter card meta tags", () => {
		const config: HeadConfig = {
			twitter: {
				card: "summary_large_image",
				description: "Twitter desc",
				title: "Twitter Title",
			},
		}
		applyHeadConfig(config)
		/* Should add twitter:card, twitter:title, twitter:description */
		expect(mockHead.appendChild).toHaveBeenCalledTimes(3)
	})

	it("applies keywords meta", () => {
		const config: HeadConfig = { keywords: "test, keywords, seo" }
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies robots meta with index/follow", () => {
		const config: HeadConfig = {
			robots: { follow: true, index: true },
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies robots meta with noindex/nofollow", () => {
		const config: HeadConfig = {
			robots: { follow: false, index: false, noarchive: true },
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies viewport meta from MetaConfig", () => {
		const config: HeadConfig = {
			meta: { viewport: "width=device-width, initial-scale=1" },
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies author meta from MetaConfig", () => {
		const config: HeadConfig = {
			meta: { author: "John Doe" },
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies apple mobile web app meta", () => {
		const config: HeadConfig = {
			meta: {
				appleMobileWebAppCapable: "yes",
				appleMobileWebAppStatusBarStyle: "black-translucent",
				appleMobileWebAppTitle: "My App",
			},
		}
		applyHeadConfig(config)
		/* Should add 3 apple meta tags */
		expect(mockHead.appendChild).toHaveBeenCalledTimes(3)
	})

	it("applies favicon links", () => {
		const config: HeadConfig = {
			favicons: {
				appleTouchIcon: "/apple-touch-icon.png",
				ico: "/favicon.ico",
				svg: "/favicon.svg",
			},
		}
		applyHeadConfig(config)
		/* Should add 3 link elements */
		expect(mockHead.appendChild).toHaveBeenCalledTimes(3)
	})

	it("applies sized favicon links", () => {
		const config: HeadConfig = {
			favicons: {
				"192x192": "/icon-192.png",
				"512x512": "/icon-512.png",
				"96x96": "/icon-96.png",
			},
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalledTimes(3)
	})

	it("applies jsonLd script", () => {
		const config: HeadConfig = {
			jsonLd: {
				"@context": "https://schema.org",
				"@type": "Organization",
				name: "Test Corp",
			},
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies hreflang links for languages", () => {
		const config: HeadConfig = {
			languages: {
				en: "https://example.com/en",
				es: "https://example.com/es",
				fr: "https://example.com/fr",
			},
		}
		applyHeadConfig(config)
		/* Should add 3 hreflang link elements */
		expect(mockHead.appendChild).toHaveBeenCalledTimes(3)
	})

	it("applies custom meta tags", () => {
		const config: HeadConfig = {
			custom: {
				meta: [
					{ content: "custom-value", name: "custom-name" },
					{ content: "og-custom", property: "og:custom" },
				],
			},
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalledTimes(2)
	})

	it("applies custom link tags", () => {
		const config: HeadConfig = {
			custom: {
				links: [{ href: "/preload.js", rel: "preload" }],
			},
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies custom external scripts", () => {
		const config: HeadConfig = {
			custom: {
				scripts: [{ src: "/analytics.js", type: "module" }],
			},
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies custom inline scripts", () => {
		const config: HeadConfig = {
			custom: {
				scripts: [{ children: "console.log('hello')" }],
			},
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies multiple OG images", () => {
		const config: HeadConfig = {
			openGraph: {
				images: [
					{ height: 600, url: "https://example.com/img1.jpg", width: 800 },
					{ url: "https://example.com/img2.jpg" },
					{ url: "https://example.com/img3.jpg" },
				],
			},
		}
		applyHeadConfig(config)
		/* First image: og:image + og:image:width + og:image:height = 3 */
		/* Additional images: 2 more og:image */
		/* Total: 5 */
		expect(mockHead.appendChild).toHaveBeenCalledTimes(5)
	})

	it("applies OG videos", () => {
		const config: HeadConfig = {
			openGraph: {
				videos: [
					{ height: 720, type: "video/mp4", url: "https://example.com/video.mp4", width: 1280 },
				],
			},
		}
		applyHeadConfig(config)
		/* og:video + og:video:type + og:video:width + og:video:height = 4 */
		expect(mockHead.appendChild).toHaveBeenCalledTimes(4)
	})

	it("applies OG audio", () => {
		const config: HeadConfig = {
			openGraph: {
				audio: [{ type: "audio/mp3", url: "https://example.com/audio.mp3" }],
			},
		}
		applyHeadConfig(config)
		/* og:audio + og:audio:type = 2 */
		expect(mockHead.appendChild).toHaveBeenCalledTimes(2)
	})

	it("applies OG alternate locales", () => {
		const config: HeadConfig = {
			openGraph: {
				alternateLocale: ["en_US", "es_ES", "fr_FR"],
			},
		}
		applyHeadConfig(config)
		expect(mockHead.appendChild).toHaveBeenCalledTimes(3)
	})

	it("applies Twitter image with alt", () => {
		const config: HeadConfig = {
			twitter: {
				images: [{ alt: "Twitter image alt text", url: "https://example.com/twitter.jpg" }],
			},
		}
		applyHeadConfig(config)
		/* twitter:image + twitter:image:alt = 2 */
		expect(mockHead.appendChild).toHaveBeenCalledTimes(2)
	})
})

describe("applyHeadConfig - stale cleanup", () => {
	let mockHead: {
		appendChild: ReturnType<typeof vi.fn>
		querySelector: ReturnType<typeof vi.fn>
		querySelectorAll: ReturnType<typeof vi.fn>
	}
	let originalDocument: typeof globalThis.document
	let _removedElements: string[]

	beforeEach(() => {
		originalDocument = globalThis.document
		_removedElements = []
		mockHead = {
			appendChild: vi.fn(),
			querySelector: vi.fn(() => null),
			querySelectorAll: vi.fn(() => []),
		}

		;(globalThis as Record<string, unknown>).document = {
			createElement: vi.fn(() => ({
				content: "",
				href: "",
				hreflang: "",
				rel: "",
				setAttribute: vi.fn(),
				textContent: "",
				type: "",
			})),
			head: mockHead,
			title: "Old Title",
		}
	})

	afterEach(() => {
		;(globalThis as Record<string, unknown>).document = originalDocument
	})

	it("tracks meta tags for cleanup", () => {
		/* First navigation - add keywords */
		applyHeadConfig({ keywords: "first, keywords" })
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("handles empty config without errors", () => {
		applyHeadConfig({})
		/* Should not throw */
	})
})

describe("applyPerRouteHeads - route-based cleanup", () => {
	let mockHead: {
		appendChild: ReturnType<typeof vi.fn>
		querySelector: ReturnType<typeof vi.fn>
		querySelectorAll: ReturnType<typeof vi.fn>
	}
	let originalDocument: typeof globalThis.document
	const removedSelectors: string[] = []

	beforeEach(() => {
		originalDocument = globalThis.document
		removedSelectors.length = 0
		clearRouteTracking()

		mockHead = {
			appendChild: vi.fn(),
			querySelector: vi.fn(() => null),
			querySelectorAll: vi.fn((selector: string) => {
				/* Track the selector for verification */
				removedSelectors.push(selector)
				return []
			}),
		}

		;(globalThis as Record<string, unknown>).document = {
			body: { querySelector: vi.fn(() => null) },
			createElement: vi.fn(() => ({
				content: "",
				href: "",
				hreflang: "",
				rel: "",
				setAttribute: vi.fn(),
				src: "",
				textContent: "",
				type: "",
			})),
			head: mockHead,
			title: "Old Title",
		}
	})

	afterEach(() => {
		;(globalThis as Record<string, unknown>).document = originalDocument
		clearRouteTracking()
	})

	it("tracks route hierarchy", () => {
		const perRouteHeads = [
			{ head: { title: "Root" }, matchId: "_root_" },
			{ head: { title: "Blog Layout" }, matchId: "_root_/blog" },
			{ head: { title: "Blog Post" }, matchId: "_root_/blog/[id]" },
		]
		applyPerRouteHeads(perRouteHeads)
		expect(getCurrentRouteHierarchy()).toEqual(["_root_", "_root_/blog", "_root_/blog/[id]"])
	})

	it("cleans up removed routes when navigating", () => {
		/* First navigation: blog post page */
		const blogRoute = [
			{ head: { description: "Root desc" }, matchId: "_root_" },
			{ head: { description: "Blog desc" }, matchId: "_root_/blog" },
			{ head: { description: "Post desc" }, matchId: "_root_/blog/[id]" },
		]
		applyPerRouteHeads(blogRoute)
		expect(getCurrentRouteHierarchy()).toEqual(["_root_", "_root_/blog", "_root_/blog/[id]"])

		/* Second navigation: about page (removes blog and post) */
		removedSelectors.length = 0
		const aboutRoute = [
			{ head: { description: "Root desc" }, matchId: "_root_" },
			{ head: { description: "About desc" }, matchId: "_root_/about" },
		]
		applyPerRouteHeads(aboutRoute)

		/* Should have queried for elements to remove from old routes */
		expect(getCurrentRouteHierarchy()).toEqual(["_root_", "_root_/about"])
	})

	it("preserves layout head when navigating between pages", () => {
		/* First navigation: blog post 123 */
		const post123 = [
			{ head: { title: "Root" }, matchId: "_root_" },
			{ head: { title: "Blog" }, matchId: "_root_/blog" },
			{ head: { description: "Post 123 desc", title: "Post 123" }, matchId: "_root_/blog/[id]" },
		]
		applyPerRouteHeads(post123)

		/* Second navigation: blog post 456 (same layout, different page) */
		removedSelectors.length = 0
		const post456 = [
			{ head: { title: "Root" }, matchId: "_root_" },
			{ head: { title: "Blog" }, matchId: "_root_/blog" },
			{ head: { description: "Post 456 desc", title: "Post 456" }, matchId: "_root_/blog/[id]" },
		]
		applyPerRouteHeads(post456)

		/* Same route hierarchy - no routes should be removed */
		expect(getCurrentRouteHierarchy()).toEqual(["_root_", "_root_/blog", "_root_/blog/[id]"])
	})

	it("handles first navigation (no previous routes)", () => {
		const routes = [
			{ head: { title: "Home" }, matchId: "_root_" },
			{ head: { title: "Home Page" }, matchId: "_root_/" },
		]
		applyPerRouteHeads(routes)
		expect(getCurrentRouteHierarchy()).toEqual(["_root_", "_root_/"])
	})

	it("handles complete route change (all routes different)", () => {
		/* First navigation: products */
		const products = [
			{ head: { title: "Products" }, matchId: "_products_" },
			{ head: { title: "Product 123" }, matchId: "_products_/[id]" },
		]
		applyPerRouteHeads(products)
		expect(getCurrentRouteHierarchy()).toEqual(["_products_", "_products_/[id]"])

		/* Second navigation: completely different route tree */
		const dashboard = [
			{ head: { title: "Dashboard" }, matchId: "_dashboard_" },
			{ head: { title: "Settings" }, matchId: "_dashboard_/settings" },
		]
		applyPerRouteHeads(dashboard)

		/* All old routes should be cleaned up */
		expect(getCurrentRouteHierarchy()).toEqual(["_dashboard_", "_dashboard_/settings"])
	})
})

describe("applyHeadConfigForRoute", () => {
	let mockHead: {
		appendChild: ReturnType<typeof vi.fn>
		querySelector: ReturnType<typeof vi.fn>
		querySelectorAll: ReturnType<typeof vi.fn>
	}
	let originalDocument: typeof globalThis.document

	beforeEach(() => {
		originalDocument = globalThis.document
		clearRouteTracking()

		mockHead = {
			appendChild: vi.fn(),
			querySelector: vi.fn(() => null),
			querySelectorAll: vi.fn(() => []),
		}

		;(globalThis as Record<string, unknown>).document = {
			body: { querySelector: vi.fn(() => null) },
			createElement: vi.fn(() => ({
				content: "",
				href: "",
				hreflang: "",
				rel: "",
				setAttribute: vi.fn(),
				src: "",
				textContent: "",
				type: "",
			})),
			head: mockHead,
			title: "Old Title",
		}
	})

	afterEach(() => {
		;(globalThis as Record<string, unknown>).document = originalDocument
		clearRouteTracking()
	})

	it("applies head config for specific route", () => {
		const config: HeadConfig = {
			description: "Test description",
			title: "Test Title",
		}
		applyHeadConfigForRoute("_root_/test", config)
		expect(mockHead.appendChild).toHaveBeenCalled()
	})

	it("applies OpenGraph meta for route", () => {
		const config: HeadConfig = {
			openGraph: {
				description: "OG description",
				title: "OG Title",
				type: "website",
			},
		}
		applyHeadConfigForRoute("_root_/test", config)
		/* og:title, og:description, og:type = 3 calls */
		expect(mockHead.appendChild).toHaveBeenCalledTimes(3)
	})

	it("applies custom scripts for route", () => {
		const config: HeadConfig = {
			custom: {
				scripts: [{ src: "/analytics.js" }],
			},
		}
		applyHeadConfigForRoute("_root_/about", config)
		expect(mockHead.appendChild).toHaveBeenCalledTimes(1)
	})

	it("applies custom meta for route", () => {
		const config: HeadConfig = {
			custom: {
				meta: [
					{ content: "value1", name: "custom-meta-1" },
					{ content: "value2", name: "custom-meta-2" },
				],
			},
		}
		applyHeadConfigForRoute("_root_/page", config)
		expect(mockHead.appendChild).toHaveBeenCalledTimes(2)
	})
})
