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

/* ── Refcount invariants ────────────────────────────────────────────── */

describe("CSS refcount — invariant: never negative refcount", () => {
	it("removing route that never had CSS does not corrupt state", () => {
		initRouteHierarchy(["r1", "r2"])
		applyPerRouteHeads([
			{ head: { css: "/only-r1.css" }, matchId: "r1" },
			{ head: {}, matchId: "r2" },
		])

		/* Remove r2 (has no CSS), then r1 */
		applyPerRouteHeads([{ head: { css: "/only-r1.css" }, matchId: "r1" }])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/only-r1.css"),
		).toHaveLength(1)

		applyPerRouteHeads([])
		expect(mockDoc.elements.filter((e) => e.tag === "link")).toHaveLength(0)
	})
})

describe("CSS refcount — route CSS swap", () => {
	it("route changes from /a.css to /b.css — old removed, new added", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([{ head: { css: "/a.css" }, matchId: "r1" }])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/a.css"),
		).toHaveLength(1)
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/b.css"),
		).toHaveLength(0)

		/* Swap CSS */
		applyPerRouteHeads([{ head: { css: "/b.css" }, matchId: "r1" }])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/a.css"),
		).toHaveLength(0)
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/b.css"),
		).toHaveLength(1)
	})

	it("shared CSS swap: r1 swaps /shared→/new, r2 keeps /shared — shared persists", () => {
		initRouteHierarchy(["r1", "r2"])
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "r1" },
			{ head: { css: "/shared.css" }, matchId: "r2" },
		])
		const linksBefore = mockDoc.elements.filter(
			(e) => e.tag === "link" && e.attrs.href === "/shared.css",
		)
		expect(linksBefore).toHaveLength(1)

		/* r1 swaps to new.css, r2 keeps shared.css */
		applyPerRouteHeads([
			{ head: { css: "/new.css" }, matchId: "r1" },
			{ head: { css: "/shared.css" }, matchId: "r2" },
		])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/shared.css"),
		).toHaveLength(1)
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/new.css"),
		).toHaveLength(1)
	})
})

describe("CSS refcount — mixed CSS types in same route", () => {
	it("link + custom.styles in same route — link refcounted, style direct", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([
			{
				head: {
					css: "/link.css",
					custom: { styles: [{ children: ".x { color: red }" }] },
				},
				matchId: "r1",
			},
		])

		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/link.css"),
		).toHaveLength(1)
		expect(mockDoc.elements.filter((e) => e.tag === "style")).toHaveLength(1)

		/* Remove route */
		applyPerRouteHeads([])
		expect(mockDoc.elements.filter((e) => e.tag === "link")).toHaveLength(0)
		expect(mockDoc.elements.filter((e) => e.tag === "style")).toHaveLength(0)
	})

	it("css array + custom.links stylesheet in same route", () => {
		initRouteHierarchy(["r1"])
		applyPerRouteHeads([
			{
				head: {
					css: ["/a.css"],
					custom: { links: [{ href: "/b.css", rel: "stylesheet" }] },
				},
				matchId: "r1",
			},
		])

		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.rel === "stylesheet"),
		).toHaveLength(2)

		applyPerRouteHeads([])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.rel === "stylesheet"),
		).toHaveLength(0)
	})
})

describe("CSS refcount — clearRouteTracking resets all state", () => {
	it("after clear, CSS state is fully reset", () => {
		initRouteHierarchy(["r1", "r2"])
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "r1" },
			{ head: { css: "/shared.css" }, matchId: "r2" },
		])

		clearRouteTracking()

		/* After clear, hierarchy is empty — applyPerRouteHeads with new routes works fresh */
		initRouteHierarchy(["r3"])
		applyPerRouteHeads([{ head: { css: "/fresh.css" }, matchId: "r3" }])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/fresh.css"),
		).toHaveLength(1)
	})
})

describe("CSS refcount — navigation A→B→A→C", () => {
	it("shared CSS survives A→B, removed at C", () => {
		/* A: r1(shared) + r2(shared) */
		initRouteHierarchy(["r1", "r2"])
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "r1" },
			{ head: { css: "/shared.css" }, matchId: "r2" },
		])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/shared.css"),
		).toHaveLength(1)

		/* B: r1(shared) + r3(own) — r2 removed but shared survives via r1 */
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "r1" },
			{ head: { css: "/own.css" }, matchId: "r3" },
		])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/shared.css"),
		).toHaveLength(1)
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/own.css"),
		).toHaveLength(1)

		/* A again: r1(shared) + r2(shared) — own.css removed */
		applyPerRouteHeads([
			{ head: { css: "/shared.css" }, matchId: "r1" },
			{ head: { css: "/shared.css" }, matchId: "r2" },
		])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/shared.css"),
		).toHaveLength(1)
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/own.css"),
		).toHaveLength(0)

		/* C: completely different route — shared removed */
		applyPerRouteHeads([{ head: { css: "/c.css" }, matchId: "r4" }])
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/shared.css"),
		).toHaveLength(0)
		expect(
			mockDoc.elements.filter((e) => e.tag === "link" && e.attrs.href === "/c.css"),
		).toHaveLength(1)
	})
})
