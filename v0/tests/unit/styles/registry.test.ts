/**
 * CSS Registry Tests
 *
 * Tests for registry.ts functionality including:
 * - registerCSS (hash-based)
 * - registerCSSByName (name-based)
 * - getScopedStyles
 * - clearScopedStyles
 * - resetHydrationState
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	clearScopedStyles,
	getScopedStyles,
	registerCSS,
	registerCSSByName,
	resetHydrationState,
	STYLE_TAG_ID,
} from "../../../src/styles/registry"

describe("registry", () => {
	beforeEach(() => {
		clearScopedStyles()
		resetHydrationState()
	})

	afterEach(() => {
		clearScopedStyles()
		resetHydrationState()
	})

	describe("registerCSS", () => {
		it("returns empty string for empty CSS", () => {
			expect(registerCSS("")).toBe("")
			expect(registerCSS("   ")).toBe("")
		})

		it("returns hash ID for valid CSS", () => {
			const id = registerCSS("color: red")
			expect(id).toBeTruthy()
			expect(typeof id).toBe("string")
		})

		it("returns same ID for same CSS", () => {
			const id1 = registerCSS("color: red")
			const id2 = registerCSS("color: red")
			expect(id1).toBe(id2)
		})

		it("returns different IDs for different CSS", () => {
			const id1 = registerCSS("color: red")
			const id2 = registerCSS("color: blue")
			expect(id1).not.toBe(id2)
		})

		it("minifies CSS before hashing (spaces around colons)", () => {
			const id1 = registerCSS("color: red")
			const id2 = registerCSS("color:red")
			// Both should produce same hash since minify removes space around colons
			expect(id1).toBe(id2)
		})

		it("minifies CSS before hashing (newlines)", () => {
			const id1 = registerCSS("color:red")
			const id2 = registerCSS("color:red\n")
			const id3 = registerCSS("\ncolor:red\n")
			// Newlines should be stripped
			expect(id1).toBe(id2)
			expect(id2).toBe(id3)
		})

		it("adds rule to registry", () => {
			registerCSS("color: red")
			const styles = getScopedStyles()
			expect(styles).toContain("color:red")
			expect(styles).toContain("[data-c=")
		})
	})

	describe("registerCSSByName", () => {
		it("does nothing for empty CSS", () => {
			registerCSSByName("box", "")
			registerCSSByName("box", "   ")
			const styles = getScopedStyles()
			expect(styles).toBe("")
		})

		it("registers CSS with given name", () => {
			registerCSSByName("my-box", "color: red")
			const styles = getScopedStyles()
			expect(styles).toContain('[data-c="my-box"]')
			expect(styles).toContain("color:red")
		})

		it("skips if already registered with same name", () => {
			registerCSSByName("box", "color: red")
			registerCSSByName("box", "color: blue") // Should be ignored
			const styles = getScopedStyles()

			// Count occurrences of the selector
			const matches = styles.match(/\[data-c="box"\]/g)
			expect(matches?.length).toBe(1)
			expect(styles).toContain("color:red")
			expect(styles).not.toContain("color:blue")
		})

		it("allows different names with same CSS", () => {
			registerCSSByName("box1", "color: red")
			registerCSSByName("box2", "color: red")
			const styles = getScopedStyles()
			expect(styles).toContain('[data-c="box1"]')
			expect(styles).toContain('[data-c="box2"]')
		})

		it("scopes nested & selectors", () => {
			registerCSSByName(
				"btn",
				`
				background: white;
				&:hover {
					background: blue;
				}
			`,
			)
			const styles = getScopedStyles()
			expect(styles).toContain('[data-c="btn"]{background:white}')
			expect(styles).toContain('[data-c="btn"]:hover{background:blue}')
		})

		it("scopes data attribute selectors", () => {
			registerCSSByName(
				"tab",
				`
				&[data-active="true"] {
					background: blue;
				}
			`,
			)
			const styles = getScopedStyles()
			expect(styles).toContain('[data-c="tab"][data-active="true"]')
		})

		it("scopes pseudo-elements", () => {
			registerCSSByName(
				"icon",
				`
				&::before {
					content: "→";
				}
			`,
			)
			const styles = getScopedStyles()
			expect(styles).toContain('[data-c="icon"]::before')
		})

		it("scopes @media queries", () => {
			registerCSSByName(
				"responsive",
				`
				padding: 1rem;
				@media (min-width: 768px) {
					padding: 2rem;
				}
			`,
			)
			const styles = getScopedStyles()
			expect(styles).toContain("@media (min-width: 768px)")
			expect(styles).toContain('[data-c="responsive"]')
		})

		it("scopes @container queries", () => {
			registerCSSByName(
				"card",
				`
				@container (min-width: 400px) {
					display: grid;
				}
			`,
			)
			const styles = getScopedStyles()
			expect(styles).toContain("@container (min-width: 400px)")
			expect(styles).toContain('[data-c="card"]')
		})

		it("passes @keyframes through unchanged", () => {
			registerCSSByName(
				"spinner",
				`
				animation: spin 1s linear infinite;
				@keyframes spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
			`,
			)
			const styles = getScopedStyles()
			expect(styles).toContain("@keyframes spin")
			expect(styles).toContain("from")
			expect(styles).toContain("to")
		})
	})

	describe("getScopedStyles", () => {
		it("returns empty string when no styles registered", () => {
			expect(getScopedStyles()).toBe("")
		})

		it("returns all registered styles concatenated", () => {
			registerCSSByName("a", "color: red")
			registerCSSByName("b", "color: blue")
			const styles = getScopedStyles()

			expect(styles).toContain('[data-c="a"]')
			expect(styles).toContain('[data-c="b"]')
			expect(styles).toContain("color:red")
			expect(styles).toContain("color:blue")
		})
	})

	describe("clearScopedStyles", () => {
		it("clears all registered styles", () => {
			registerCSSByName("box", "color: red")
			expect(getScopedStyles()).toContain("color:red")

			clearScopedStyles()
			expect(getScopedStyles()).toBe("")
		})
	})

	describe("STYLE_TAG_ID", () => {
		it("exports the style tag ID constant", () => {
			expect(STYLE_TAG_ID).toBe("__FLARE_SCOPED__")
		})
	})

	describe("complex CSS patterns", () => {
		it("handles state-based selectors from styles()", () => {
			registerCSSByName(
				"product-item",
				`
				background: white;
				transition: background 0.2s;
				&[data-active="true"] {
					background: blue;
					color: white;
					font-weight: bold;
				}
				&[data-active="false"]:hover {
					background: #f5f5f5;
				}
			`,
			)
			const styles = getScopedStyles()

			expect(styles).toContain(
				'[data-c="product-item"]{background:white;transition:background 0.2s}',
			)
			expect(styles).toContain('[data-c="product-item"][data-active="true"]')
			expect(styles).toContain('[data-c="product-item"][data-active="false"]:hover')
		})

		it("handles deeply nested selectors", () => {
			registerCSSByName(
				"tooltip",
				`
				&:hover {
					&::after {
						opacity: 1;
						transform: translateY(0);
					}
				}
			`,
			)
			const styles = getScopedStyles()

			expect(styles).toContain('[data-c="tooltip"]:hover::after')
		})

		it("handles multiple @media queries", () => {
			registerCSSByName(
				"grid",
				`
				display: block;
				@media (min-width: 640px) {
					display: flex;
				}
				@media (min-width: 1024px) {
					display: grid;
				}
			`,
			)
			const styles = getScopedStyles()

			expect(styles).toContain("@media (min-width: 640px)")
			expect(styles).toContain("@media (min-width: 1024px)")
			expect(styles).toContain("display:flex")
			expect(styles).toContain("display:grid")
		})

		it("handles @layer with nested rules", () => {
			registerCSSByName(
				"btn",
				`
				@layer components {
					background: white;
					&:hover {
						background: #f0f0f0;
					}
				}
			`,
			)
			const styles = getScopedStyles()

			expect(styles).toContain("@layer components")
			expect(styles).toContain('[data-c="btn"]')
		})
	})
})
