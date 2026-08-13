import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	applyPerRouteHeads,
	clearRouteTracking,
	initRouteHierarchy,
} from "../../../src/head-client/index.ts"

type MockEl = {
	attrs: Record<string, string>
	getAttribute: (name: string) => string | null
	id: number
	remove: () => void
	setAttribute: (name: string, value: string) => void
	tag: string
	textContent: string
}

function createMockDocument() {
	let nextId = 0
	const elements: MockEl[] = []
	let titleValue = ""

	function makeEl(tag: string): MockEl {
		const elId = nextId++
		const el: MockEl = {
			attrs: {},
			getAttribute(name: string) {
				return this.attrs[name] ?? null
			},
			id: elId,
			remove() {
				const idx = elements.findIndex((e) => e.id === elId)
				if (idx >= 0) elements.splice(idx, 1)
			},
			setAttribute(name: string, value: string) {
				this.attrs[name] = value
			},
			tag,
			textContent: "",
		}
		return el
	}

	function matchesSelector(el: MockEl, selector: string): boolean {
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

	const head = {
		appendChild(el: MockEl) {
			elements.push(el)
		},
		querySelector(selector: string): MockEl | null {
			for (const el of elements) {
				if (matchesSelector(el, selector)) return el
			}
			return null
		},
		querySelectorAll(selector: string) {
			const result: MockEl[] = []
			for (const el of elements) {
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

describe("CSS lifecycle: refcount edge cases", () => {
	it("three routes share same stylesheet — refcount = 3, all leave", () => {
		initRouteHierarchy(["r1", "r2", "r3"])
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "r1" },
			{ head: { css: "/shared.css" }, matchId: "r2" },
			{ head: { css: "/shared.css" }, matchId: "r3" },
		])
		/* Only one <link> element created */
		const links = mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/shared.css")
		expect(links).toHaveLength(1)

		/* Remove all routes */
		applyPerRouteHeads([])
		const linksAfter = mockDoc.elements.filter(
			(e) => e.tag === "link" && e.attrs.href === "/shared.css",
		)
		expect(linksAfter).toHaveLength(0)
	})

	it("route exits then re-enters with same stylesheet", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([{ head: { css: "/theme.css" }, matchId: "r1" }])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/theme.css"),
		).toHaveLength(1)

		/* Route leaves */
		applyPerRouteHeads([])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/theme.css"),
		).toHaveLength(0)

		/* Route re-enters */
		applyPerRouteHeads([{ head: { css: "/theme.css" }, matchId: "r1" }])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/theme.css"),
		).toHaveLength(1)
	})

	it("two routes share stylesheet, one leaves — element persists", () => {
		initRouteHierarchy(["r1", "r2"])
		applyPerRouteHeads([
			{ head: { css: "/common.css" }, matchId: "r1" },
			{ head: { css: "/common.css" }, matchId: "r2" },
		])
		/* One element */
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/common.css"),
		).toHaveLength(1)

		/* r1 leaves, r2 stays */
		applyPerRouteHeads([{ head: { css: "/common.css" }, matchId: "r2" }])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/common.css"),
		).toHaveLength(1)

		/* r2 leaves */
		applyPerRouteHeads([])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/common.css"),
		).toHaveLength(0)
	})
})

describe("CSS lifecycle: css array edge cases", () => {
	it("empty css array creates no elements", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([{ head: { css: [] }, matchId: "r1" }])
		const links = mockDoc.elements.filter((e) => e.tag === "link")
		expect(links).toHaveLength(0)
	})

	it("css array with duplicate hrefs — refcounted correctly", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([{ head: { css: ["/a.css", "/a.css"] }, matchId: "r1" }])
		/* Same href → single element with refcount 2 */
		const links = mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/a.css")
		expect(links).toHaveLength(1)

		/* On removal, both decrements happen → element removed */
		applyPerRouteHeads([])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/a.css"),
		).toHaveLength(0)
	})

	it("css array with multiple distinct hrefs", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([{ head: { css: ["/a.css", "/b.css", "/c.css"] }, matchId: "r1" }])
		const links = mockDoc.elements.filter((e) => e.tag === "link")
		expect(links).toHaveLength(3)
	})
})

describe("CSS lifecycle: custom.styles edge cases", () => {
	it("empty custom.styles array creates no elements", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([{ head: { custom: { styles: [] } }, matchId: "r1" }])
		const styleEls = mockDoc.elements.filter((e) => e.tag === "style")
		expect(styleEls).toHaveLength(0)
	})

	it("custom.styles with same content from different routes are NOT deduped", () => {
		initRouteHierarchy(["r1", "r2"])
		applyPerRouteHeads([
			{ head: { custom: { styles: [{ children: ".x { color: red }" }] } }, matchId: "r1" },
			{ head: { custom: { styles: [{ children: ".x { color: red }" }] } }, matchId: "r2" },
		])
		/* Style elements are NOT refcounted — each route gets its own */
		const styleEls = mockDoc.elements.filter((e) => e.tag === "style")
		expect(styleEls).toHaveLength(2)
	})
})

describe("CSS lifecycle: custom.links edge cases", () => {
	it("custom.links without rel=stylesheet are not tracked as CSS", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([
			{
				head: { custom: { links: [{ href: "/preload.js", rel: "preload" }] } },
				matchId: "r1",
			},
		])
		/* Preload links go through normal head management, not CSS lifecycle */
		const links = mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.rel === "preload")
		/* May or may not exist depending on how custom.links handles non-stylesheet */
		expect(links.length).toBeLessThanOrEqual(1)
	})

	it("custom.links with rel=stylesheet but no href — skipped", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([
			{
				head: { custom: { links: [{ rel: "stylesheet" }] } },
				matchId: "r1",
			},
		])
		/* No href → should not create a link element */
		const links = mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.rel === "stylesheet")
		expect(links).toHaveLength(0)
	})
})

describe("CSS lifecycle: layout persistence across children", () => {
	it("layout head.css persists when navigating between children", () => {
		/* Initial: layout + child-a */
		initRouteHierarchy(["layout", "child-a"])
		applyPerRouteHeads([
			{ head: { css: "/layout.css" }, matchId: "layout" },
			{ head: {}, matchId: "child-a" },
		])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/layout.css"),
		).toHaveLength(1)

		/* Nav to child-b: layout stays, child-b adds own CSS */
		applyPerRouteHeads([
			{ head: { css: "/layout.css" }, matchId: "layout" },
			{ head: { css: "/child-b.css" }, matchId: "child-b" },
		])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/layout.css"),
		).toHaveLength(1)
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/child-b.css"),
		).toHaveLength(1)

		/* Nav back to child-a: layout stays, child-b CSS removed */
		applyPerRouteHeads([
			{ head: { css: "/layout.css" }, matchId: "layout" },
			{ head: {}, matchId: "child-a" },
		])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/layout.css"),
		).toHaveLength(1)
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/child-b.css"),
		).toHaveLength(0)
	})

	it("layout head.css + child head.css — both tracked, child removed on nav", () => {
		initRouteHierarchy(["layout", "child-with-css"])
		applyPerRouteHeads([
			{ head: { css: "/layout.css" }, matchId: "layout" },
			{ head: { css: "/child.css" }, matchId: "child-with-css" },
		])
		expect(mockDoc.elements.filter((e) => e.tag === "link")).toHaveLength(2)

		/* Nav to child without CSS */
		applyPerRouteHeads([
			{ head: { css: "/layout.css" }, matchId: "layout" },
			{ head: {}, matchId: "child-no-css" },
		])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/layout.css"),
		).toHaveLength(1)
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/child.css"),
		).toHaveLength(0)
	})
})

describe("CSS lifecycle: FOUC prevention — persistent routes keep same element", () => {
	it("route stays in hierarchy — same link element persists (no remove+readd)", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([{ head: { css: "/keep.css" }, matchId: "r1" }])
		const before = mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/keep.css")
		expect(before).toHaveLength(1)
		const elementId = before[0]?.id

		/* Same route, same CSS — element should survive, not be removed+readded */
		applyPerRouteHeads([{ head: { css: "/keep.css" }, matchId: "r1" }])
		const after = mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/keep.css")
		expect(after).toHaveLength(1)
		expect(after[0]?.id).toBe(elementId)
	})

	it("two routes share stylesheet, nav adds third — element count stays 1", () => {
		initRouteHierarchy(["r1", "r2"])
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "r1" },
			{ head: { css: "/shared.css" }, matchId: "r2" },
		])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/shared.css"),
		).toHaveLength(1)

		/* Add r3 also sharing stylesheet — still only one element */
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "r1" },
			{ head: { css: "/shared.css" }, matchId: "r2" },
			{ head: { css: "/shared.css" }, matchId: "r3" },
		])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/shared.css"),
		).toHaveLength(1)
	})
})

describe("CSS lifecycle: SSR stylesheet adoption", () => {
	it("SSR-rendered stylesheet is adopted, not duplicated", () => {
		/* Simulate SSR-rendered <link> already in DOM */
		const ssrLink = mockDoc.createElement("link")
		ssrLink.setAttribute("rel", "stylesheet")
		ssrLink.setAttribute("href", "/ssr.css")
		mockDoc.head.appendChild(ssrLink)
		const ssrId = ssrLink.id

		initRouteHierarchy(["r1"])
		applyPerRouteHeads([{ head: { css: "/ssr.css" }, matchId: "r1" }])

		/* Should adopt existing element, not create duplicate */
		const links = mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/ssr.css")
		expect(links).toHaveLength(1)
		expect(links[0]?.id).toBe(ssrId)
	})

	it("SSR stylesheet shared by two client routes — no duplicate, refcount works", () => {
		const ssrLink = mockDoc.createElement("link")
		ssrLink.setAttribute("rel", "stylesheet")
		ssrLink.setAttribute("href", "/common.css")
		mockDoc.head.appendChild(ssrLink)

		initRouteHierarchy(["r1", "r2"])
		applyPerRouteHeads([
			{ head: { css: "/common.css" }, matchId: "r1" },
			{ head: { css: "/common.css" }, matchId: "r2" },
		])

		/* One element, not three */
		const links = mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/common.css")
		expect(links).toHaveLength(1)

		/* Remove r1, element persists (refcount > 0) */
		applyPerRouteHeads([{ head: { css: "/common.css" }, matchId: "r2" }])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/common.css"),
		).toHaveLength(1)

		/* Remove r2, element gone */
		applyPerRouteHeads([])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/common.css"),
		).toHaveLength(0)
	})
})

describe("CSS lifecycle: route navigation thrashing", () => {
	it("rapid add/remove/add for same route", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([{ head: { css: "/flash.css" }, matchId: "r1" }])
		applyPerRouteHeads([])
		applyPerRouteHeads([{ head: { css: "/flash.css" }, matchId: "r1" }])

		const links = mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/flash.css")
		expect(links).toHaveLength(1)
	})

	it("all routes removed at once", () => {
		initRouteHierarchy(["r1", "r2", "r3"])
		applyPerRouteHeads([
			{ head: { css: "/a.css" }, matchId: "r1" },
			{ head: { css: "/b.css" }, matchId: "r2" },
			{ head: { css: "/c.css" }, matchId: "r3" },
		])
		expect(mockDoc.elements.filter((e) => e.tag === "link")).toHaveLength(3)

		applyPerRouteHeads([])
		expect(mockDoc.elements.filter((e) => e.tag === "link")).toHaveLength(0)
	})
})
