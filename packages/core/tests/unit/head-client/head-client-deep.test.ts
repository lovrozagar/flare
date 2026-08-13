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

/* ------------------------------------------------------------------ */
/*  Multi-image OpenGraph                                             */
/* ------------------------------------------------------------------ */
describe("multi-image OpenGraph", () => {
	it("2 images produce og:image + dimension meta for each", () => {
		applyHeadConfig({
			openGraph: {
				images: [
					{ height: 600, url: "https://a.png", width: 1200 },
					{ height: 300, url: "https://b.png", width: 600 },
				],
			},
		})
		const ogImage = mockDoc.head.querySelector('meta[property="og:image"]')
		expect(ogImage).not.toBeNull()

		const width = mockDoc.head.querySelector('meta[property="og:image:width"]')
		const height = mockDoc.head.querySelector('meta[property="og:image:height"]')
		expect(width).not.toBeNull()
		expect(height).not.toBeNull()
	})

	it("shrinking from 2 to 1 image cleans stale image meta", () => {
		applyHeadConfig({
			openGraph: {
				images: [
					{ height: 600, url: "https://a.png", width: 1200 },
					{ height: 300, url: "https://b.png", width: 600 },
				],
			},
		})
		applyHeadConfig({
			openGraph: {
				images: [{ height: 400, url: "https://c.png", width: 800 }],
			},
		})
		const img = mockDoc.head.querySelector('meta[property="og:image"]')
		expect(img?.attrs.content).toBe("https://c.png")
		const width = mockDoc.head.querySelector('meta[property="og:image:width"]')
		expect(width?.attrs.content).toBe("800")
	})

	it("image with only url omits width/height/alt meta", () => {
		applyHeadConfig({
			openGraph: {
				images: [{ url: "https://plain.png" }],
			},
		})
		const img = mockDoc.head.querySelector('meta[property="og:image"]')
		expect(img?.attrs.content).toBe("https://plain.png")
		const width = mockDoc.head.querySelector('meta[property="og:image:width"]')
		const alt = mockDoc.head.querySelector('meta[property="og:image:alt"]')
		expect(width).toBeNull()
		expect(alt).toBeNull()
	})
})

/* ------------------------------------------------------------------ */
/*  Twitter deep fields                                               */
/* ------------------------------------------------------------------ */
describe("twitter deep fields", () => {
	it("description, site, creator all applied", () => {
		applyHeadConfig({
			twitter: {
				creator: "@jane",
				description: "A tweet",
				site: "@example",
			},
		})
		expect(mockDoc.head.querySelector('meta[name="twitter:description"]')?.attrs.content).toBe(
			"A tweet",
		)
		expect(mockDoc.head.querySelector('meta[name="twitter:site"]')?.attrs.content).toBe("@example")
		expect(mockDoc.head.querySelector('meta[name="twitter:creator"]')?.attrs.content).toBe("@jane")
	})

	it("updating twitter fields updates in place without duplication", () => {
		applyHeadConfig({
			twitter: { creator: "@old", description: "old desc", site: "@old-site" },
		})
		applyHeadConfig({
			twitter: { creator: "@new", description: "new desc", site: "@new-site" },
		})
		const desc = mockDoc.head.querySelector('meta[name="twitter:description"]')
		expect(desc?.attrs.content).toBe("new desc")
		const site = mockDoc.head.querySelector('meta[name="twitter:site"]')
		expect(site?.attrs.content).toBe("@new-site")
		const creator = mockDoc.head.querySelector('meta[name="twitter:creator"]')
		expect(creator?.attrs.content).toBe("@new")
	})
})

/* ------------------------------------------------------------------ */
/*  Per-route head walk-up                                            */
/* ------------------------------------------------------------------ */
describe("per-route head walk-up", () => {
	it("3-route hierarchy, remove middle route cleans only its tags", () => {
		initRouteHierarchy(["root", "mid", "leaf"])
		applyPerRouteHeads([
			{ head: { keywords: "root-kw" }, matchId: "root" },
			{ head: { description: "mid-desc" }, matchId: "mid" },
			{ head: { title: "Leaf" }, matchId: "leaf" },
		])
		/* navigate: root + leaf remain, mid removed */
		applyPerRouteHeads([
			{ head: { keywords: "root-kw" }, matchId: "root" },
			{ head: { title: "Leaf2" }, matchId: "leaf" },
		])
		expect(mockDoc.head.querySelector('meta[name="keywords"]')?.attrs.content).toBe("root-kw")
		expect(mockDoc.head.querySelector('meta[name="description"]')).toBeNull()
		expect(mockDoc.title).toBe("Leaf2")
	})

	it("adding new route to hierarchy adds tags without affecting parent", () => {
		initRouteHierarchy(["root"])
		applyPerRouteHeads([{ head: { keywords: "root-kw" }, matchId: "root" }])
		applyPerRouteHeads([
			{ head: { keywords: "root-kw" }, matchId: "root" },
			{ head: { description: "child-desc" }, matchId: "child" },
			{ head: { title: "Grandchild" }, matchId: "grandchild" },
		])
		expect(mockDoc.head.querySelector('meta[name="keywords"]')?.attrs.content).toBe("root-kw")
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("child-desc")
		expect(mockDoc.title).toBe("Grandchild")
	})

	it("full hierarchy replacement removes old tags and adds new", () => {
		initRouteHierarchy(["layout-a", "page-a"])
		applyPerRouteHeads([
			{ head: { keywords: "a-kw" }, matchId: "layout-a" },
			{ head: { description: "a-desc" }, matchId: "page-a" },
		])
		/* complete swap */
		applyPerRouteHeads([
			{ head: { keywords: "b-kw" }, matchId: "layout-b" },
			{ head: { description: "b-desc" }, matchId: "page-b" },
		])
		expect(mockDoc.head.querySelector('meta[name="keywords"]')?.attrs.content).toBe("b-kw")
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("b-desc")
	})
})

/* ------------------------------------------------------------------ */
/*  Favicons                                                          */
/* ------------------------------------------------------------------ */
describe("favicon deep", () => {
	it("ico + svg + appleTouchIcon all created with correct selectors", () => {
		applyHeadConfig({
			favicons: {
				appleTouchIcon: "/apple.png",
				ico: "/favicon.ico",
				svg: "/icon.svg",
			},
		})
		const ico = mockDoc.head.querySelector('link[rel="icon"][sizes="any"]')
		expect(ico?.attrs.href).toBe("/favicon.ico")
		const svg = mockDoc.head.querySelector('link[type="image/svg+xml"]')
		expect(svg?.attrs.href).toBe("/icon.svg")
		const apple = mockDoc.head.querySelector('link[rel="apple-touch-icon"]')
		expect(apple?.attrs.href).toBe("/apple.png")
	})

	it("updating favicon href updates in place without duplication", () => {
		applyHeadConfig({ favicons: { ico: "/old.ico" } })
		applyHeadConfig({ favicons: { ico: "/new.ico" } })
		const ico = mockDoc.head.querySelector('link[rel="icon"][sizes="any"]')
		expect(ico?.attrs.href).toBe("/new.ico")
	})
})

/* ------------------------------------------------------------------ */
/*  JSON-LD                                                           */
/* ------------------------------------------------------------------ */
describe("JSON-LD deep", () => {
	it("single item produces single object (not array) in script", () => {
		applyHeadConfig({ jsonLd: [{ "@type": "WebPage", name: "Home" }] })
		const el = mockDoc.head.querySelector('script[type="application/ld+json"]')
		expect(el).not.toBeNull()
		const parsed: unknown = JSON.parse(el?.textContent ?? "")
		expect(Array.isArray(parsed)).toBe(false)
		expect((parsed as Record<string, unknown>)["@type"]).toBe("WebPage")
	})

	it("2 items produce JSON array in script", () => {
		applyHeadConfig({
			jsonLd: [
				{ "@type": "WebPage", name: "Home" },
				{ "@type": "Organization", name: "Acme" },
			],
		})
		const el = mockDoc.head.querySelector('script[type="application/ld+json"]')
		const parsed: unknown = JSON.parse(el?.textContent ?? "")
		expect(Array.isArray(parsed)).toBe(true)
		expect((parsed as Array<Record<string, unknown>>).length).toBe(2)
	})

	it("updating JSON-LD replaces existing script content", () => {
		applyHeadConfig({ jsonLd: [{ "@type": "WebPage", name: "V1" }] })
		applyHeadConfig({ jsonLd: [{ "@type": "WebPage", name: "V2" }] })
		const el = mockDoc.head.querySelector('script[type="application/ld+json"]')
		const parsed: unknown = JSON.parse(el?.textContent ?? "")
		expect((parsed as Record<string, unknown>).name).toBe("V2")
	})
})

/* ------------------------------------------------------------------ */
/*  Hreflang                                                          */
/* ------------------------------------------------------------------ */
describe("hreflang deep", () => {
	it("multiple languages create all hreflang links", () => {
		applyHeadConfig({ languages: { de: "/de", en: "/en", fr: "/fr" } })
		expect(mockDoc.head.querySelector('link[hreflang="de"]')?.attrs.href).toBe("/de")
		expect(mockDoc.head.querySelector('link[hreflang="en"]')?.attrs.href).toBe("/en")
		expect(mockDoc.head.querySelector('link[hreflang="fr"]')?.attrs.href).toBe("/fr")
	})

	it("switching languages removes stale and adds new", () => {
		applyHeadConfig({ languages: { de: "/de", en: "/en" } })
		applyHeadConfig({ languages: { es: "/es", fr: "/fr" } })
		expect(mockDoc.head.querySelector('link[hreflang="de"]')).toBeNull()
		expect(mockDoc.head.querySelector('link[hreflang="en"]')).toBeNull()
		expect(mockDoc.head.querySelector('link[hreflang="fr"]')?.attrs.href).toBe("/fr")
		expect(mockDoc.head.querySelector('link[hreflang="es"]')?.attrs.href).toBe("/es")
	})
})

/* ------------------------------------------------------------------ */
/*  clearRouteTracking                                                */
/* ------------------------------------------------------------------ */
describe("clearRouteTracking", () => {
	it("fully resets internal state so next apply starts fresh", () => {
		applyHeadConfig({ description: "tracked", keywords: "kw" })
		clearRouteTracking()
		/*
		 * After clearing, managedMetaTags is empty. A new config without keywords
		 * should NOT attempt to remove keywords (it has no record of them).
		 * The keywords meta stays in the DOM because the cleanup loop has nothing
		 * to iterate over.
		 */
		applyHeadConfig({ description: "fresh" })
		expect(mockDoc.head.querySelector('meta[name="description"]')?.attrs.content).toBe("fresh")
		/*
		 * keywords still present because managedMetaTags was cleared,
		 * so the stale-removal loop did not see it
		 */
		expect(mockDoc.head.querySelector('meta[name="keywords"]')).not.toBeNull()
	})
})
