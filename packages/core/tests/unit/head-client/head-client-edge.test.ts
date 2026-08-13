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

/* ── 3.1 OG image edge cases ─────────────────────────────────────────── */

describe("OG image edge cases", () => {
	it("update from 3 images → 1 image → stale tags removed", () => {
		applyHeadConfig({
			openGraph: {
				images: [{ url: "https://a.jpg" }, { url: "https://b.jpg" }, { url: "https://c.jpg" }],
			},
		})
		expect(mockDoc.head.querySelectorAll('meta[property="og:image"]').length).toBe(3)

		applyHeadConfig({
			openGraph: {
				images: [{ url: "https://only.jpg" }],
			},
		})
		expect(mockDoc.head.querySelectorAll('meta[property="og:image"]').length).toBe(1)
		expect(mockDoc.head.querySelector('meta[property="og:image"]')?.attrs.content).toBe(
			"https://only.jpg",
		)
	})

	it("OG image with only url (no width/height/alt)", () => {
		applyHeadConfig({
			openGraph: { images: [{ url: "https://plain.png" }] },
		})
		expect(mockDoc.head.querySelector('meta[property="og:image"]')?.attrs.content).toBe(
			"https://plain.png",
		)
		expect(mockDoc.head.querySelector('meta[property="og:image:width"]')).toBeNull()
		expect(mockDoc.head.querySelector('meta[property="og:image:height"]')).toBeNull()
		expect(mockDoc.head.querySelector('meta[property="og:image:alt"]')).toBeNull()
	})

	it("empty images array → all OG image tags removed", () => {
		applyHeadConfig({
			openGraph: {
				images: [{ height: 600, url: "https://old.jpg", width: 1200 }],
			},
		})
		expect(mockDoc.head.querySelector('meta[property="og:image"]')).not.toBeNull()

		applyHeadConfig({
			openGraph: { images: [] },
		})
		expect(mockDoc.head.querySelector('meta[property="og:image"]')).toBeNull()
	})

	it("OG images with alt text", () => {
		applyHeadConfig({
			openGraph: {
				images: [{ alt: "A nice <photo> & 'description'", url: "https://img.jpg" }],
			},
		})
		const alt = mockDoc.head.querySelector('meta[property="og:image:alt"]')
		expect(alt?.attrs.content).toBe("A nice <photo> & 'description'")
	})
})

/* ── 3.2 Robots meta comprehensive ───────────────────────────────────── */

describe("robots meta comprehensive", () => {
	it("all robot fields combined in single config", () => {
		applyHeadConfig({
			robots: {
				follow: true,
				index: true,
				"max-image-preview": "large",
				"max-snippet": 150,
				"max-video-preview": 30,
				noarchive: true,
				noimageindex: true,
			},
		})
		const el = mockDoc.head.querySelector('meta[name="robots"]')
		const content = el?.attrs.content ?? ""
		expect(content).toContain("index")
		expect(content).toContain("follow")
		expect(content).toContain("noarchive")
		expect(content).toContain("noimageindex")
		expect(content).toContain("max-snippet:150")
		expect(content).toContain("max-image-preview:large")
		expect(content).toContain("max-video-preview:30")
	})

	it("index: false, follow: false → noindex, nofollow", () => {
		applyHeadConfig({ robots: { follow: false, index: false } })
		const el = mockDoc.head.querySelector('meta[name="robots"]')
		expect(el?.attrs.content).toContain("noindex")
		expect(el?.attrs.content).toContain("nofollow")
	})

	it("max-snippet, max-image-preview, max-video-preview together", () => {
		applyHeadConfig({
			robots: {
				"max-image-preview": "standard",
				"max-snippet": 50,
				"max-video-preview": 0,
			},
		})
		const el = mockDoc.head.querySelector('meta[name="robots"]')
		const content = el?.attrs.content ?? ""
		expect(content).toContain("max-snippet:50")
		expect(content).toContain("max-image-preview:standard")
		expect(content).toContain("max-video-preview:0")
	})

	it("removing robots (all undefined) → tag cleaned on next apply", () => {
		applyHeadConfig({ robots: { index: false } })
		expect(mockDoc.head.querySelector('meta[name="robots"]')).not.toBeNull()
		/* Apply without robots to trigger cleanup */
		applyHeadConfig({})
		expect(mockDoc.head.querySelector('meta[name="robots"]')).toBeNull()
	})
})

/* ── 3.3 JSON-LD edge cases ──────────────────────────────────────────── */

describe("JSON-LD edge cases", () => {
	it("JSON-LD with array of 3+ schemas", () => {
		applyHeadConfig({
			jsonLd: [
				{ "@type": "WebPage", name: "Home" },
				{ "@type": "Organization", name: "Acme" },
				{ "@type": "BreadcrumbList", itemListElement: [] },
			],
		})
		const el = mockDoc.head.querySelector('script[type="application/ld+json"]')
		const parsed = JSON.parse(el?.textContent ?? "") as unknown[]
		expect(Array.isArray(parsed)).toBe(true)
		expect(parsed).toHaveLength(3)
	})

	it("updating JSON-LD from array → single object", () => {
		applyHeadConfig({
			jsonLd: [
				{ "@type": "WebPage", name: "V1" },
				{ "@type": "Organization", name: "Acme" },
			],
		})
		applyHeadConfig({
			jsonLd: [{ "@type": "WebPage", name: "V2" }],
		})
		const el = mockDoc.head.querySelector('script[type="application/ld+json"]')
		const parsed = JSON.parse(el?.textContent ?? "") as Record<string, unknown>
		expect(Array.isArray(parsed)).toBe(false)
		expect(parsed.name).toBe("V2")
	})

	it("JSON-LD with nested objects containing special chars", () => {
		applyHeadConfig({
			jsonLd: [
				{
					"@type": "Product",
					description: 'Contains "quotes" & <angle> brackets',
					name: "Widget\nwith\nnewlines",
				},
			],
		})
		const el = mockDoc.head.querySelector('script[type="application/ld+json"]')
		const parsed = JSON.parse(el?.textContent ?? "") as Record<string, unknown>
		expect(parsed.description).toBe('Contains "quotes" & <angle> brackets')
		expect(parsed.name).toBe("Widget\nwith\nnewlines")
	})
})

/* ── 3.4 Route hierarchy transitions ─────────────────────────────────── */

describe("route hierarchy transitions", () => {
	it("3-level hierarchy → sibling nav → parent preserved, old child removed", () => {
		initRouteHierarchy(["root", "parent", "child-a"])
		applyPerRouteHeads([
			{ head: { keywords: "root-kw" }, matchId: "root" },
			{ head: { description: "parent-desc" }, matchId: "parent" },
			{ head: { title: "Child A" }, matchId: "child-a" },
		])

		applyPerRouteHeads([
			{ head: { keywords: "root-kw" }, matchId: "root" },
			{ head: { description: "parent-desc" }, matchId: "parent" },
			{ head: { title: "Child B" }, matchId: "child-b" },
		])

		expect(mockDoc.head.querySelector('meta[name="keywords"]')?.attrs.content).toBe("root-kw")
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe(
			"parent-desc",
		)
		expect(mockDoc.title).toBe("Child B")
	})

	it("navigate to completely different tree → all old tags removed", () => {
		initRouteHierarchy(["layout-a", "page-a"])
		applyPerRouteHeads([
			{ head: { keywords: "a-kw" }, matchId: "layout-a" },
			{ head: { description: "a-desc" }, matchId: "page-a" },
		])

		applyPerRouteHeads([
			{ head: { keywords: "b-kw" }, matchId: "layout-b" },
			{ head: { description: "b-desc" }, matchId: "page-b" },
		])

		expect(mockDoc.head.querySelector('meta[name="keywords"]')?.attrs.content).toBe("b-kw")
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("b-desc")
	})

	it("empty hierarchy → baseTitle restored", () => {
		initRouteHierarchy(["root"], "Base Title")
		applyPerRouteHeads([{ head: { title: "Custom" }, matchId: "root" }])
		expect(mockDoc.title).toBe("Custom")

		applyPerRouteHeads([])
		expect(mockDoc.title).toBe("Base Title")
	})

	it("rapid successive applyPerRouteHeads calls → final state correct", () => {
		initRouteHierarchy(["root"])
		applyPerRouteHeads([{ head: { description: "D1", title: "V1" }, matchId: "root" }])
		applyPerRouteHeads([{ head: { description: "D2", title: "V2" }, matchId: "root" }])
		applyPerRouteHeads([{ head: { description: "D3", title: "V3" }, matchId: "root" }])
		expect(mockDoc.title).toBe("V3")
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("D3")
	})

	it("route with zero head config → no DOM mutations", () => {
		initRouteHierarchy(["root", "empty"])
		const elementsBefore = mockDoc.elements.size
		applyPerRouteHeads([
			{ head: {}, matchId: "root" },
			{ head: {}, matchId: "empty" },
		])
		expect(mockDoc.elements.size).toBe(elementsBefore)
	})
})

/* ── 3.5 Cleanup & reset ─────────────────────────────────────────────── */

describe("cleanup & reset", () => {
	it("clearRouteTracking → subsequent applyPerRouteHeads starts fresh", () => {
		initRouteHierarchy(["root"])
		applyPerRouteHeads([{ head: { description: "old" }, matchId: "root" }])
		clearRouteTracking()
		/* After clear, apply should not try to remove old tags */
		applyPerRouteHeads([{ head: { keywords: "new-kw" }, matchId: "page" }])
		expect(mockDoc.head.querySelector('meta[name="keywords"]')?.attrs.content).toBe("new-kw")
	})

	it("duplicate initRouteHierarchy calls → resets cleanly", () => {
		initRouteHierarchy(["root", "page1"])
		applyPerRouteHeads([
			{ head: { keywords: "kw" }, matchId: "root" },
			{ head: { description: "p1" }, matchId: "page1" },
		])

		initRouteHierarchy(["root", "page2"])
		applyPerRouteHeads([
			{ head: { keywords: "kw" }, matchId: "root" },
			{ head: { description: "p2" }, matchId: "page2" },
		])
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("p2")
	})

	it("clearRouteTracking followed by initRouteHierarchy works correctly", () => {
		initRouteHierarchy(["a"])
		applyPerRouteHeads([{ head: { title: "A" }, matchId: "a" }])
		clearRouteTracking()
		initRouteHierarchy(["b"], "Default")
		applyPerRouteHeads([{ head: { title: "B" }, matchId: "b" }])
		expect(mockDoc.title).toBe("B")
	})
})

/* ── 3.6 Hreflang edge cases ─────────────────────────────────────────── */

describe("hreflang edge cases", () => {
	it("x-default language code", () => {
		applyHeadConfig({ languages: { "x-default": "/default" } })
		const el = mockDoc.head.querySelector('link[hreflang="x-default"]')
		expect(el?.attrs.href).toBe("/default")
	})

	it("switching from 3 languages to 1 → stale links removed", () => {
		applyHeadConfig({ languages: { de: "/de", en: "/en", fr: "/fr" } })
		expect(mockDoc.head.querySelector('link[hreflang="fr"]')).not.toBeNull()

		applyHeadConfig({ languages: { en: "/en" } })
		expect(mockDoc.head.querySelector('link[hreflang="en"]')?.attrs.href).toBe("/en")
		expect(mockDoc.head.querySelector('link[hreflang="de"]')).toBeNull()
		expect(mockDoc.head.querySelector('link[hreflang="fr"]')).toBeNull()
	})

	it("hreflang with query string in URL", () => {
		applyHeadConfig({
			languages: { en: "/en/page?ref=seo&utm=test" },
		})
		const el = mockDoc.head.querySelector('link[hreflang="en"]')
		expect(el?.attrs.href).toBe("/en/page?ref=seo&utm=test")
	})
})
