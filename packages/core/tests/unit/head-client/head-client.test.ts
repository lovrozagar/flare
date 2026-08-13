import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	applyHeadConfig,
	applyPerRouteHeads,
	clearRouteTracking,
	initRouteHierarchy,
} from "../../../src/head-client/index.ts"

function createMockDocument() {
	const elements = new Map<
		string,
		{ attrs: Record<string, string>; tag: string; textContent: string }
	>()
	let titleValue = ""

	function makeEl(tag: string, attrs: Record<string, string> = {}, text = "") {
		const el = {
			attrs: { ...attrs },
			getAttribute(name: string) {
				return this.attrs[name] ?? null
			},
			get innerHTML() {
				return this.textContent
			},
			set innerHTML(v: string) {
				this.textContent = v
			},
			remove() {
				elements.delete(buildKey(el.tag, el.attrs))
			},
			setAttribute(name: string, value: string) {
				this.attrs[name] = value
			},
			tag,
			textContent: text,
		}
		return el
	}

	function buildKey(tag: string, attrs: Record<string, string>) {
		const sorted = Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b))
		return `${tag}:${sorted.map(([k, v]) => `${k}=${v}`).join(",")}`
	}

	const head = {
		appendChild(el: { tag: string; attrs: Record<string, string>; textContent: string }) {
			const key = buildKey(el.tag, el.attrs)
			elements.set(key, el)
		},
		querySelector(selector: string) {
			for (const el of elements.values()) {
				if (matchesSelector(el, selector)) return el
			}
			return null
		},
		querySelectorAll(selector: string) {
			const result: unknown[] = []
			for (const el of elements.values()) {
				if (matchesSelector(el, selector)) result.push(el)
			}
			return {
				forEach(fn: (el: unknown) => void) {
					result.forEach(fn)
				},
				[Symbol.iterator]() {
					return result[Symbol.iterator]()
				},
				length: result.length,
			}
		},
	}

	function matchesSelector(
		el: { tag: string; attrs: Record<string, string> },
		selector: string,
	): boolean {
		/* Simple selector matching for tests */
		const tagMatch = selector.match(/^(\w+)/)
		if (tagMatch && tagMatch[1] !== el.tag) return false

		const attrMatches = [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)]
		for (const m of attrMatches) {
			const attrName = m[1] ?? ""
			const attrValue = m[2]
			if (attrValue !== undefined) {
				if (el.attrs[attrName] !== attrValue) return false
			} else {
				if (!(attrName in el.attrs)) return false
			}
		}
		return true
	}

	return {
		createElement(tag: string) {
			return makeEl(tag)
		},
		elements,
		head,
		get title() {
			return titleValue
		},
		set title(v: string) {
			titleValue = v
		},
	}
}

let mockDoc: ReturnType<typeof createMockDocument>

beforeEach(() => {
	mockDoc = createMockDocument()
	globalThis.document = mockDoc as unknown as Document
	clearRouteTracking()
})

afterEach(() => {
	delete (globalThis as Record<string, unknown>).document
})

describe("applyHeadConfig", () => {
	it("updates title if different", () => {
		applyHeadConfig({ title: "Hello" })
		expect(mockDoc.title).toBe("Hello")
	})

	it("creates meta description if missing", () => {
		applyHeadConfig({ description: "A page" })
		const el = mockDoc.head.querySelector('meta[name="description"]')
		expect(el).not.toBeNull()
		expect(el?.attrs.content).toBe("A page")
	})

	it("updates meta description content if changed", () => {
		applyHeadConfig({ description: "First" })
		applyHeadConfig({ description: "Second" })
		const el = mockDoc.head.querySelector('meta[name="description"]')
		expect(el?.attrs.content).toBe("Second")
	})

	it("creates og:title", () => {
		applyHeadConfig({ openGraph: { title: "OG Title" } })
		const el = mockDoc.head.querySelector('meta[property="og:title"]')
		expect(el).not.toBeNull()
		expect(el?.attrs.content).toBe("OG Title")
	})

	it("creates og:description", () => {
		applyHeadConfig({ openGraph: { description: "OG Desc" } })
		const el = mockDoc.head.querySelector('meta[property="og:description"]')
		expect(el?.attrs.content).toBe("OG Desc")
	})

	it("creates twitter:card", () => {
		applyHeadConfig({ twitter: { card: "summary" } })
		const el = mockDoc.head.querySelector('meta[name="twitter:card"]')
		expect(el?.attrs.content).toBe("summary")
	})

	it("creates twitter:title", () => {
		applyHeadConfig({ twitter: { title: "TW Title" } })
		const el = mockDoc.head.querySelector('meta[name="twitter:title"]')
		expect(el?.attrs.content).toBe("TW Title")
	})

	it("updates canonical link href", () => {
		applyHeadConfig({ canonical: "https://example.com/a" })
		const el = mockDoc.head.querySelector('link[rel="canonical"]')
		expect(el?.attrs.href).toBe("https://example.com/a")
	})

	it("creates JSON-LD script", () => {
		applyHeadConfig({ jsonLd: [{ "@type": "WebPage", name: "Test" }] })
		const el = mockDoc.head.querySelector('script[type="application/ld+json"]')
		expect(el).not.toBeNull()
	})

	it("creates hreflang links per language entry", () => {
		applyHeadConfig({ languages: { de: "/de/page", en: "/en/page" } })
		const de = mockDoc.head.querySelector('link[hreflang="de"]')
		const en = mockDoc.head.querySelector('link[hreflang="en"]')
		expect(de?.attrs.href).toBe("/de/page")
		expect(en?.attrs.href).toBe("/en/page")
	})

	it("cleans up stale meta tags from previous nav", () => {
		applyHeadConfig({ description: "old", keywords: "old-kw" })
		applyHeadConfig({ description: "new" })
		const kw = mockDoc.head.querySelector('meta[name="keywords"]')
		expect(kw).toBeNull()
	})

	it("cleans up stale hreflang links from previous nav", () => {
		applyHeadConfig({ languages: { de: "/de", en: "/en" } })
		applyHeadConfig({ languages: { en: "/en" } })
		const de = mockDoc.head.querySelector('link[hreflang="de"]')
		expect(de).toBeNull()
	})

	it("creates keywords meta", () => {
		applyHeadConfig({ keywords: "a, b, c" })
		const el = mockDoc.head.querySelector('meta[name="keywords"]')
		expect(el?.attrs.content).toBe("a, b, c")
	})

	it("creates robots meta from config", () => {
		applyHeadConfig({ robots: { follow: false, index: false } })
		const el = mockDoc.head.querySelector('meta[name="robots"]')
		expect(el?.attrs.content).toContain("noindex")
		expect(el?.attrs.content).toContain("nofollow")
	})
})

describe("robots content", () => {
	it("{ index: false } → noindex", () => {
		applyHeadConfig({ robots: { index: false } })
		const el = mockDoc.head.querySelector('meta[name="robots"]')
		expect(el?.attrs.content).toContain("noindex")
	})

	it("{ index: true, follow: false } → index, nofollow", () => {
		applyHeadConfig({ robots: { follow: false, index: true } })
		const el = mockDoc.head.querySelector('meta[name="robots"]')
		expect(el?.attrs.content).toContain("index")
		expect(el?.attrs.content).toContain("nofollow")
	})

	it("{ noarchive: true } → noarchive", () => {
		applyHeadConfig({ robots: { noarchive: true } })
		const el = mockDoc.head.querySelector('meta[name="robots"]')
		expect(el?.attrs.content).toContain("noarchive")
	})

	it("{ max-snippet: 100 } → max-snippet:100", () => {
		applyHeadConfig({ robots: { "max-snippet": 100 } })
		const el = mockDoc.head.querySelector('meta[name="robots"]')
		expect(el?.attrs.content).toContain("max-snippet:100")
	})
})

describe("favicon updates", () => {
	it("ico → link[rel=icon] with sizes any", () => {
		applyHeadConfig({ favicons: { ico: "/favicon.ico" } })
		const el = mockDoc.head.querySelector('link[rel="icon"]')
		expect(el?.attrs.href).toBe("/favicon.ico")
		expect(el?.attrs.sizes).toBe("any")
	})

	it("svg → link[rel=icon][type=image/svg+xml]", () => {
		applyHeadConfig({ favicons: { svg: "/icon.svg" } })
		const el = mockDoc.head.querySelector('link[type="image/svg+xml"]')
		expect(el?.attrs.href).toBe("/icon.svg")
	})

	it("appleTouchIcon → link[rel=apple-touch-icon]", () => {
		applyHeadConfig({ favicons: { appleTouchIcon: "/apple.png" } })
		const el = mockDoc.head.querySelector('link[rel="apple-touch-icon"]')
		expect(el?.attrs.href).toBe("/apple.png")
	})
})

describe("initRouteHierarchy", () => {
	it("sets currentRouteHierarchy from matchIds", () => {
		/* Verify by then calling applyPerRouteHeads */
		initRouteHierarchy(["root", "page"])
		applyPerRouteHeads([
			{ head: { title: "Root" }, matchId: "root" },
			{ head: { description: "Page desc" }, matchId: "page" },
		])
		expect(mockDoc.title).toBe("Root")
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("Page desc")
	})
})

describe("applyPerRouteHeads", () => {
	it("same hierarchy → updates in place, no removal", () => {
		initRouteHierarchy(["root", "page"])
		applyPerRouteHeads([
			{ head: { title: "V1" }, matchId: "root" },
			{ head: { description: "D1" }, matchId: "page" },
		])
		applyPerRouteHeads([
			{ head: { title: "V2" }, matchId: "root" },
			{ head: { description: "D2" }, matchId: "page" },
		])
		expect(mockDoc.title).toBe("V2")
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("D2")
	})

	it("parent layout persists + page changes → only page elements removed", () => {
		initRouteHierarchy(["root", "page1"])
		applyPerRouteHeads([
			{ head: { keywords: "layout-kw" }, matchId: "root" },
			{ head: { description: "Page1" }, matchId: "page1" },
		])
		/* Navigate: root stays, page changes */
		applyPerRouteHeads([
			{ head: { keywords: "layout-kw" }, matchId: "root" },
			{ head: { description: "Page2" }, matchId: "page2" },
		])
		expect(mockDoc.head.querySelector('meta[name="keywords"]')?.attrs.content).toBe("layout-kw")
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("Page2")
	})

	it("removed route → its elements removed from DOM", () => {
		initRouteHierarchy(["root", "page1"])
		applyPerRouteHeads([
			{ head: {}, matchId: "root" },
			{ head: { description: "Page1" }, matchId: "page1" },
		])
		/* Navigate away — different layout */
		applyPerRouteHeads([
			{ head: {}, matchId: "new-root" },
			{ head: { description: "Page2" }, matchId: "page2" },
		])
		/* page1 description should have been replaced by page2 */
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("Page2")
	})

	it("title always updated (not route-tracked)", () => {
		initRouteHierarchy(["root"])
		applyPerRouteHeads([{ head: { title: "Title1" }, matchId: "root" }])
		applyPerRouteHeads([{ head: { title: "Title2" }, matchId: "root" }])
		expect(mockDoc.title).toBe("Title2")
	})

	it("new route adds elements → tracked under new matchId", () => {
		initRouteHierarchy(["root"])
		applyPerRouteHeads([{ head: {}, matchId: "root" }])
		applyPerRouteHeads([
			{ head: {}, matchId: "root" },
			{ head: { description: "New" }, matchId: "new-page" },
		])
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("New")
	})

	it("stale tags removed when route head changes", () => {
		initRouteHierarchy(["page"])
		applyPerRouteHeads([
			{
				head: { description: "Desc", keywords: "a,b" },
				matchId: "page",
			},
		])
		expect(mockDoc.head.querySelector('meta[name="keywords"]')).not.toBeNull()

		/* Same route, different head — keywords removed */
		applyPerRouteHeads([
			{
				head: { description: "Desc only" },
				matchId: "page",
			},
		])
		expect(mockDoc.head.querySelector('meta[name="keywords"]')).toBeNull()
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("Desc only")
	})
})

describe("OG images — multiple values", () => {
	it("multiple OG images creates separate elements", () => {
		applyHeadConfig({
			openGraph: {
				images: [{ url: "https://img1.jpg" }, { url: "https://img2.jpg" }],
			},
		})
		const all = mockDoc.head.querySelectorAll('meta[property="og:image"]')
		expect(all.length).toBe(2)
	})

	it("updating OG images replaces all old ones", () => {
		applyHeadConfig({
			openGraph: {
				images: [{ url: "https://old1.jpg" }, { url: "https://old2.jpg" }],
			},
		})
		applyHeadConfig({
			openGraph: {
				images: [{ url: "https://new1.jpg" }],
			},
		})
		const all = mockDoc.head.querySelectorAll('meta[property="og:image"]')
		expect(all.length).toBe(1)
	})

	it("OG image with dimensions creates separate dimension tags per image", () => {
		applyHeadConfig({
			openGraph: {
				images: [
					{ height: 400, url: "https://img1.jpg", width: 800 },
					{ height: 300, url: "https://img2.jpg", width: 600 },
				],
			},
		})
		const widths = mockDoc.head.querySelectorAll('meta[property="og:image:width"]')
		expect(widths.length).toBe(2)
	})
})

/* ── CSS lifecycle on SPA navigation ───────────────────────────────── */

describe("CSS lifecycle — head.css", () => {
	it("head.css string → creates link[rel=stylesheet]", () => {
		initRouteHierarchy(["page"])
		applyPerRouteHeads([{ head: { css: "/styles/page.css" }, matchId: "page" }])
		const el = mockDoc.head.querySelector('link[rel="stylesheet"]')
		expect(el).not.toBeNull()
		expect(el?.attrs.href).toBe("/styles/page.css")
		expect(el?.attrs["data-flare-route"]).toBe("page")
	})

	it("head.css array → creates multiple links", () => {
		initRouteHierarchy(["page"])
		applyPerRouteHeads([{ head: { css: ["/a.css", "/b.css"] }, matchId: "page" }])
		const all = mockDoc.head.querySelectorAll('link[rel="stylesheet"]')
		expect(all.length).toBe(2)
	})

	it("route exit → CSS link removed", () => {
		initRouteHierarchy(["page1"])
		applyPerRouteHeads([{ head: { css: "/page1.css" }, matchId: "page1" }])
		expect(mockDoc.head.querySelector('link[href="/page1.css"]')).not.toBeNull()

		applyPerRouteHeads([{ head: {}, matchId: "page2" }])
		expect(mockDoc.head.querySelector('link[href="/page1.css"]')).toBeNull()
	})
})

describe("CSS lifecycle — custom.styles", () => {
	it("custom.styles → creates style elements", () => {
		initRouteHierarchy(["page"])
		applyPerRouteHeads([
			{
				head: { custom: { styles: [{ children: ".card { color: red; }" }] } },
				matchId: "page",
			},
		])
		const el = mockDoc.head.querySelector('style[data-flare-route="page"]')
		expect(el).not.toBeNull()
		expect(el?.textContent).toBe(".card { color: red; }")
	})

	it("route exit → style elements removed", () => {
		initRouteHierarchy(["page1"])
		applyPerRouteHeads([
			{
				head: { custom: { styles: [{ children: ".x { color: blue; }" }] } },
				matchId: "page1",
			},
		])
		expect(mockDoc.head.querySelector('style[data-flare-route="page1"]')).not.toBeNull()

		applyPerRouteHeads([{ head: {}, matchId: "page2" }])
		expect(mockDoc.head.querySelector('style[data-flare-route="page1"]')).toBeNull()
	})
})

describe("CSS lifecycle — stylesheet deduplication", () => {
	it("shared stylesheet refcounted — not removed until last route exits", () => {
		initRouteHierarchy(["layout", "page"])
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "layout" },
			{ head: { css: "/shared.css" }, matchId: "page" },
		])
		/* Only one link element despite two routes referencing it */
		const all = mockDoc.head.querySelectorAll('link[href="/shared.css"]')
		expect(all.length).toBe(1)

		/* Navigate: page leaves but layout stays */
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "layout" },
			{ head: {}, matchId: "page2" },
		])
		expect(mockDoc.head.querySelector('link[href="/shared.css"]')).not.toBeNull()
	})

	it("shared stylesheet removed when all routes exit", () => {
		initRouteHierarchy(["layout", "page"])
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "layout" },
			{ head: { css: "/shared.css" }, matchId: "page" },
		])

		/* Both routes leave */
		applyPerRouteHeads([{ head: {}, matchId: "new-root" }])
		expect(mockDoc.head.querySelector('link[href="/shared.css"]')).toBeNull()
	})
})

describe("CSS lifecycle — custom.links with rel=stylesheet", () => {
	it("custom stylesheet link tracked as CSS", () => {
		initRouteHierarchy(["page"])
		applyPerRouteHeads([
			{
				head: {
					custom: {
						links: [{ href: "/custom.css", rel: "stylesheet" }],
					},
				},
				matchId: "page",
			},
		])
		const el = mockDoc.head.querySelector('link[href="/custom.css"]')
		expect(el).not.toBeNull()
		expect(el?.attrs["data-flare-route"]).toBe("page")
	})
})
