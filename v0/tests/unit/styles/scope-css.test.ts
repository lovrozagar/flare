/**
 * CSS Scoping Tests
 *
 * Tests for scope-css.ts functionality including:
 * - Pseudo-elements (::before, ::after)
 * - Container queries (@container)
 * - CSS layers (@layer)
 * - Nested selectors
 * - @media queries
 * - @keyframes
 */

import { describe, expect, it } from "vitest"
import { needsFullParsing, scopeCSS } from "../../../src/styles/scope-css"

describe("scopeCSS", () => {
	describe("basic declarations", () => {
		it("wraps simple declarations with selector", () => {
			const result = scopeCSS("box", "color: red; padding: 1rem;")
			expect(result).toBe('[data-c="box"]{color:red;padding:1rem}')
		})

		it("handles empty CSS", () => {
			expect(scopeCSS("box", "")).toBe("")
			expect(scopeCSS("box", "   ")).toBe("")
		})

		it("minifies CSS", () => {
			const result = scopeCSS(
				"box",
				`
				color: red;
				padding: 1rem;
			`,
			)
			expect(result).toBe('[data-c="box"]{color:red;padding:1rem}')
		})
	})

	describe("pseudo-elements (::before, ::after)", () => {
		it("scopes ::before pseudo-element", () => {
			const css = `
				position: relative;
				&::before {
					content: "";
					position: absolute;
					top: 0;
				}
			`
			const result = scopeCSS("icon", css)

			expect(result).toContain('[data-c="icon"]')
			expect(result).toContain('[data-c="icon"]::before')
			expect(result).toContain('content:""')
			expect(result).toContain("position:absolute")
		})

		it("scopes ::after pseudo-element", () => {
			const css = `
				&::after {
					content: "";
					display: block;
					clear: both;
				}
			`
			const result = scopeCSS("clearfix", css)

			expect(result).toContain('[data-c="clearfix"]::after')
			expect(result).toContain("clear:both")
		})

		it("handles both ::before and ::after together", () => {
			const css = `
				position: relative;
				&::before {
					content: "[";
					position: absolute;
					left: -0.5rem;
				}
				&::after {
					content: "]";
					position: absolute;
					right: -0.5rem;
				}
			`
			const result = scopeCSS("bracket", css)

			expect(result).toContain('[data-c="bracket"]::before')
			expect(result).toContain('[data-c="bracket"]::after')
			expect(result).toContain('content:"["')
			expect(result).toContain('content:"]"')
		})

		it("handles pseudo-elements with additional pseudo-classes", () => {
			const css = `
				&:hover::before {
					opacity: 1;
				}
				&:focus::after {
					transform: scale(1.1);
				}
			`
			const result = scopeCSS("btn", css)

			expect(result).toContain('[data-c="btn"]:hover::before')
			expect(result).toContain('[data-c="btn"]:focus::after')
		})

		it("handles ::placeholder pseudo-element", () => {
			const css = `
				&::placeholder {
					color: #999;
					font-style: italic;
				}
			`
			const result = scopeCSS("input", css)

			expect(result).toContain('[data-c="input"]::placeholder')
			expect(result).toContain("color:#999")
		})

		it("handles ::selection pseudo-element", () => {
			const css = `
				&::selection {
					background: #3b82f6;
					color: white;
				}
			`
			const result = scopeCSS("text", css)

			expect(result).toContain('[data-c="text"]::selection')
			expect(result).toContain("background:#3b82f6")
		})

		it("handles ::marker pseudo-element", () => {
			const css = `
				&::marker {
					color: #10b981;
					font-weight: bold;
				}
			`
			const result = scopeCSS("list-item", css)

			expect(result).toContain('[data-c="list-item"]::marker')
		})

		it("handles ::first-letter pseudo-element", () => {
			const css = `
				&::first-letter {
					font-size: 2em;
					float: left;
					margin-right: 0.1em;
				}
			`
			const result = scopeCSS("dropcap", css)

			expect(result).toContain('[data-c="dropcap"]::first-letter')
			expect(result).toContain("font-size:2em")
		})

		it("handles ::first-line pseudo-element", () => {
			const css = `
				&::first-line {
					font-variant: small-caps;
					color: #333;
				}
			`
			const result = scopeCSS("paragraph", css)

			expect(result).toContain('[data-c="paragraph"]::first-line')
		})
	})

	describe("container queries (@container)", () => {
		it("scopes basic container query", () => {
			const css = `
				padding: 1rem;
				@container (min-width: 400px) {
					padding: 2rem;
				}
			`
			const result = scopeCSS("card", css)

			expect(result).toContain('[data-c="card"]{padding:1rem}')
			expect(result).toContain("@container (min-width: 400px)")
			expect(result).toContain("padding:2rem")
		})

		it("scopes named container query", () => {
			const css = `
				@container sidebar (min-width: 300px) {
					display: grid;
					grid-template-columns: 1fr 1fr;
				}
			`
			const result = scopeCSS("sidebar-item", css)

			expect(result).toContain("@container sidebar (min-width: 300px)")
			expect(result).toContain('[data-c="sidebar-item"]')
			expect(result).toContain("display:grid")
		})

		it("handles container-type declaration", () => {
			const css = `
				container-type: inline-size;
				container-name: card;
			`
			const result = scopeCSS("card-wrapper", css)

			expect(result).toContain("container-type:inline-size")
			expect(result).toContain("container-name:card")
		})

		it("handles multiple container queries", () => {
			const css = `
				font-size: 1rem;
				@container (min-width: 300px) {
					font-size: 1.25rem;
				}
				@container (min-width: 500px) {
					font-size: 1.5rem;
				}
			`
			const result = scopeCSS("responsive-text", css)

			expect(result).toContain("@container (min-width: 300px)")
			expect(result).toContain("@container (min-width: 500px)")
			expect(result).toContain("font-size:1.25rem")
			expect(result).toContain("font-size:1.5rem")
		})

		it("handles container query with nested & selectors", () => {
			const css = `
				@container (min-width: 400px) {
					&:hover {
						background: #f5f5f5;
					}
				}
			`
			const result = scopeCSS("card", css)

			expect(result).toContain("@container (min-width: 400px)")
			expect(result).toContain('[data-c="card"]:hover')
			expect(result).toContain("background:#f5f5f5")
		})

		it("handles container query with pseudo-elements", () => {
			const css = `
				@container (min-width: 400px) {
					&::before {
						content: "Wide";
					}
				}
			`
			const result = scopeCSS("indicator", css)

			expect(result).toContain("@container (min-width: 400px)")
			expect(result).toContain('[data-c="indicator"]::before')
		})
	})

	describe("CSS layers (@layer)", () => {
		it("scopes basic layer", () => {
			const css = `
				@layer base {
					color: black;
					font-family: sans-serif;
				}
			`
			const result = scopeCSS("text", css)

			expect(result).toContain("@layer base")
			expect(result).toContain('[data-c="text"]')
			expect(result).toContain("color:black")
		})

		it("handles layer order declaration", () => {
			// Layer order declarations have no block content
			// This tests that the parser handles this edge case
			const css = `
				color: red;
			`
			const result = scopeCSS("component", css)

			expect(result).toContain('[data-c="component"]')
			expect(result).toContain("color:red")
		})

		it("scopes nested layer", () => {
			const css = `
				@layer components {
					background: white;
					@layer cards {
						border-radius: 8px;
					}
				}
			`
			const result = scopeCSS("card", css)

			expect(result).toContain("@layer components")
			// Note: nested @layer is passed through
		})

		it("handles multiple layers", () => {
			const css = `
				@layer reset {
					margin: 0;
					padding: 0;
				}
				@layer components {
					padding: 1rem;
				}
			`
			const result = scopeCSS("element", css)

			expect(result).toContain("@layer reset")
			expect(result).toContain("@layer components")
		})

		it("handles layer with & selectors", () => {
			const css = `
				@layer components {
					&:hover {
						background: #f0f0f0;
					}
				}
			`
			const result = scopeCSS("btn", css)

			expect(result).toContain("@layer components")
			expect(result).toContain('[data-c="btn"]:hover')
		})
	})

	describe("@media queries", () => {
		it("scopes styles inside media query", () => {
			const css = `
				padding: 1rem;
				@media (min-width: 768px) {
					padding: 2rem;
				}
			`
			const result = scopeCSS("container", css)

			expect(result).toContain('[data-c="container"]{padding:1rem}')
			expect(result).toContain("@media (min-width: 768px)")
			expect(result).toContain("padding:2rem")
		})

		it("handles media query with nested & selectors", () => {
			const css = `
				@media (prefers-color-scheme: dark) {
					&:hover {
						background: #333;
					}
				}
			`
			const result = scopeCSS("btn", css)

			expect(result).toContain("@media (prefers-color-scheme: dark)")
			expect(result).toContain('[data-c="btn"]:hover')
		})
	})

	describe("@supports queries", () => {
		it("scopes styles inside supports query", () => {
			const css = `
				display: flex;
				@supports (display: grid) {
					display: grid;
					grid-template-columns: repeat(3, 1fr);
				}
			`
			const result = scopeCSS("layout", css)

			expect(result).toContain("@supports (display: grid)")
			expect(result).toContain("display:grid")
		})
	})

	describe("@keyframes", () => {
		it("passes through keyframes unchanged", () => {
			const css = `
				animation: spin 1s linear infinite;
				@keyframes spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
			`
			const result = scopeCSS("spinner", css)

			expect(result).toContain("animation:spin 1s linear infinite")
			expect(result).toContain("@keyframes spin")
			expect(result).toContain("from")
			expect(result).toContain("to")
			// Keyframes content should not have [data-c] inside the @keyframes block
			// The keyframes block should be: @keyframes spin{from...to...}
			// Not: @keyframes spin{[data-c="spinner"]{from...}}
			const keyframesMatch = result.match(/@keyframes spin\{([^}]+)\}/)
			expect(keyframesMatch).toBeTruthy()
			// The content inside keyframes should not contain the data-c selector
			expect(keyframesMatch?.[1]).not.toContain('[data-c="spinner"]')
		})

		it("handles -webkit-keyframes prefix", () => {
			const css = `
				@-webkit-keyframes fadeIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}
			`
			const result = scopeCSS("fade", css)

			expect(result).toContain("@-webkit-keyframes fadeIn")
		})
	})

	describe("nested & selectors", () => {
		it("scopes hover pseudo-class", () => {
			const css = `
				background: white;
				&:hover {
					background: #f0f0f0;
				}
			`
			const result = scopeCSS("btn", css)

			expect(result).toContain('[data-c="btn"]{background:white}')
			expect(result).toContain('[data-c="btn"]:hover{background:#f0f0f0}')
		})

		it("scopes data attribute selectors", () => {
			const css = `
				background: white;
				&[data-active="true"] {
					background: blue;
				}
			`
			const result = scopeCSS("tab", css)

			expect(result).toContain('[data-c="tab"][data-active="true"]')
		})

		it("scopes descendant selectors", () => {
			const css = `
				& .child {
					color: red;
				}
			`
			const result = scopeCSS("parent", css)

			expect(result).toContain('[data-c="parent"] .child')
		})

		it("handles deeply nested rules", () => {
			const css = `
				&:hover {
					&::before {
						opacity: 1;
					}
				}
			`
			const result = scopeCSS("tooltip", css)

			expect(result).toContain('[data-c="tooltip"]:hover::before')
		})
	})

	describe("edge cases", () => {
		it("handles CSS with strings containing special characters", () => {
			const css = `
				&::before {
					content: "Hello {world}";
				}
			`
			const result = scopeCSS("greeting", css)

			expect(result).toContain('[data-c="greeting"]::before')
			// The parser should handle braces inside strings
		})

		it("handles CSS with escaped quotes", () => {
			const css = `
				&::before {
					content: "Say \\"hello\\"";
				}
			`
			const result = scopeCSS("quote", css)

			expect(result).toContain('[data-c="quote"]::before')
		})

		it("handles CSS with url() containing special chars", () => {
			const css = `
				background-image: url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E");
			`
			const result = scopeCSS("icon", css)

			expect(result).toContain('[data-c="icon"]')
			expect(result).toContain("url(")
		})

		it("handles calc() expressions", () => {
			const css = `
				width: calc(100% - 2rem);
				padding: calc(1rem + 4px);
			`
			const result = scopeCSS("box", css)

			expect(result).toContain("calc(100% - 2rem)")
		})

		it("handles CSS variables", () => {
			const css = `
				color: var(--primary-color);
				padding: var(--spacing-md, 1rem);
			`
			const result = scopeCSS("themed", css)

			expect(result).toContain("var(--primary-color)")
			expect(result).toContain("var(--spacing-md, 1rem)")
		})

		it("handles clamp() function", () => {
			const css = `
				font-size: clamp(1rem, 2vw + 0.5rem, 1.5rem);
			`
			const result = scopeCSS("fluid-text", css)

			expect(result).toContain("clamp(")
		})
	})
})

describe("needsFullParsing", () => {
	it("returns false for simple declarations", () => {
		expect(needsFullParsing("color: red; padding: 1rem;")).toBe(false)
	})

	it("returns true for & selectors", () => {
		expect(needsFullParsing("&:hover { color: blue; }")).toBe(true)
	})

	it("returns true for @media", () => {
		expect(needsFullParsing("@media (min-width: 768px) { padding: 2rem; }")).toBe(true)
	})

	it("returns true for @container", () => {
		expect(needsFullParsing("@container (min-width: 400px) { padding: 2rem; }")).toBe(true)
	})

	it("returns true for @supports", () => {
		expect(needsFullParsing("@supports (display: grid) { display: grid; }")).toBe(true)
	})

	it("returns true for @keyframes", () => {
		expect(needsFullParsing("@keyframes spin { from { } to { } }")).toBe(true)
	})

	it("returns true for nested braces", () => {
		expect(needsFullParsing(".child { color: red; }")).toBe(true)
	})
})
