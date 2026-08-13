/**
 * styles() Function Tests
 *
 * Tests for the main styles() API including:
 * - Simple string CSS
 * - Config object with state/vars
 * - State selectors
 * - CSS variables
 * - outerCss merging
 * - style prop merging
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { styles } from "../../../src/styles/index"
import {
	clearScopedStyles,
	getScopedStyles,
	resetHydrationState,
} from "../../../src/styles/registry"

describe("styles()", () => {
	beforeEach(() => {
		clearScopedStyles()
		resetHydrationState()
	})

	afterEach(() => {
		clearScopedStyles()
		resetHydrationState()
	})

	describe("simple string CSS", () => {
		it("returns data-c attribute with component name", () => {
			const result = styles("box", "color: red")
			expect(result["data-c"]).toBe("box")
		})

		it("registers CSS in registry", () => {
			styles("my-component", "padding: 1rem")
			const css = getScopedStyles()
			expect(css).toContain('[data-c="my-component"]')
			expect(css).toContain("padding:1rem")
		})

		it("does not add style attribute for simple CSS", () => {
			const result = styles("box", "color: red")
			expect(result.style).toBeUndefined()
		})
	})

	describe("config object with state", () => {
		it("adds data-* attributes for state", () => {
			const result = styles("btn", {
				css: "background: white",
				state: { active: true, size: "lg" },
			})

			expect(result["data-c"]).toBe("btn")
			expect(result["data-active"]).toBe("true")
			expect(result["data-size"]).toBe("lg")
		})

		it("converts boolean state to string", () => {
			const result = styles("toggle", {
				css: "opacity: 0.5",
				state: { on: false },
			})

			expect(result["data-on"]).toBe("false")
		})

		it("converts number state to string", () => {
			const result = styles("item", {
				css: "color: red",
				state: { index: 0 },
			})

			expect(result["data-index"]).toBe("0")
		})
	})

	describe("state selectors", () => {
		it("provides s.stateName() function for selectors", () => {
			styles("tab", {
				css: (s) => `
					background: white;
					${s.active(true)} { background: blue; }
				`,
				state: { active: true },
			})

			const css = getScopedStyles()
			expect(css).toContain('[data-c="tab"][data-active="true"]')
		})

		it("handles multiple state values", () => {
			styles("btn", {
				css: (s) => `
					${s.size("sm")} { padding: 0.5rem; }
					${s.size("md")} { padding: 1rem; }
					${s.size("lg")} { padding: 2rem; }
				`,
				state: { size: "md" },
			})

			const css = getScopedStyles()
			expect(css).toContain('[data-c="btn"][data-size="sm"]')
			expect(css).toContain('[data-c="btn"][data-size="md"]')
			expect(css).toContain('[data-c="btn"][data-size="lg"]')
		})

		it("combines state with pseudo-classes", () => {
			styles("link", {
				css: (s) => `
					${s.active(false)}:hover { color: blue; }
				`,
				state: { active: false },
			})

			const css = getScopedStyles()
			expect(css).toContain('[data-c="link"][data-active="false"]:hover')
		})

		it("combines state with pseudo-elements", () => {
			styles("badge", {
				css: (s) => `
					${s.unread(true)}::after {
						content: "!";
						color: red;
					}
				`,
				state: { unread: true },
			})

			const css = getScopedStyles()
			expect(css).toContain('[data-c="badge"][data-unread="true"]::after')
		})
	})

	describe("CSS variables via vars", () => {
		it("adds CSS variables to style attribute", () => {
			const result = styles("box", {
				css: (_, v) => `
					background: ${v.bg};
					padding: ${v.padding};
				`,
				vars: { bg: "#ff0000", padding: "1rem" },
			})

			expect(result.style).toBeDefined()
			// Variables are indexed --_0, --_1, etc.
			expect(result.style).toHaveProperty("--_0", "#ff0000")
			expect(result.style).toHaveProperty("--_1", "1rem")
		})

		it("injects var() references in CSS", () => {
			styles("themed", {
				css: (_, v) => `color: ${v.color}`,
				vars: { color: "red" },
			})

			const css = getScopedStyles()
			expect(css).toContain("var(--_0)")
		})

		it("handles empty vars object", () => {
			const result = styles("simple", {
				css: "color: red",
				vars: {},
			})

			expect(result.style).toBeUndefined()
		})

		it("only includes vars that are used in CSS", () => {
			const result = styles("partial", {
				css: (_, v) => `color: ${v.used}`,
				vars: { unused: "blue", used: "red" },
			})

			expect(result.style).toHaveProperty("--_0", "red")
			// unused var should not be in style
			const styleKeys = Object.keys(result.style ?? {})
			expect(styleKeys.length).toBe(1)
		})
	})

	describe("state and vars together", () => {
		it("combines state selectors with CSS variables", () => {
			const result = styles("item", {
				css: (s, v) => `
					background: white;
					${s.active(true)} {
						background: ${v.highlight};
					}
				`,
				state: { active: true },
				vars: { highlight: "#3b82f6" },
			})

			expect(result["data-c"]).toBe("item")
			expect(result["data-active"]).toBe("true")
			expect(result.style).toHaveProperty("--_0", "#3b82f6")

			const css = getScopedStyles()
			expect(css).toContain('[data-c="item"][data-active="true"]')
			expect(css).toContain("var(--_0)")
		})
	})

	describe("outerCss", () => {
		it("generates unique name with hash when outerCss provided", () => {
			const result = styles("card", {
				css: "padding: 1rem",
				outerCss: "background: blue",
			})

			expect(result["data-c"]).toMatch(/^card-[a-z0-9]+$/)
		})

		it("appends outerCss after inner CSS", () => {
			styles("card", {
				css: "padding: 1rem",
				outerCss: "background: blue",
			})

			const css = getScopedStyles()
			// Both should be present
			expect(css).toContain("padding:1rem")
			expect(css).toContain("background:blue")
		})

		it("uses exact name when no outerCss", () => {
			const result = styles("card", {
				css: "padding: 1rem",
			})

			expect(result["data-c"]).toBe("card")
		})

		it("different outerCss produces different names", () => {
			const result1 = styles("card", {
				css: "padding: 1rem",
				outerCss: "background: red",
			})
			const result2 = styles("card", {
				css: "padding: 1rem",
				outerCss: "background: blue",
			})

			expect(result1["data-c"]).not.toBe(result2["data-c"])
		})
	})

	describe("style prop", () => {
		it("merges style prop with CSS variables", () => {
			const result = styles("box", {
				css: (_, v) => `background: ${v.bg}`,
				style: { opacity: 0.5 },
				vars: { bg: "red" },
			})

			expect(result.style).toHaveProperty("--_0", "red")
			expect(result.style).toHaveProperty("opacity", 0.5)
		})

		it("style prop takes priority over vars with same key", () => {
			const result = styles("box", {
				css: (_, v) => `background: ${v.bg}`,
				style: { "--_0": "blue" as unknown }, // Intentionally conflict
				vars: { bg: "red" },
			})

			// style prop should override
			expect(result.style?.["--_0"]).toBe("blue")
		})

		it("works with style prop only (no vars)", () => {
			const result = styles("box", {
				css: "padding: 1rem",
				style: { transform: "scale(1.1)" },
			})

			expect(result.style).toEqual({ transform: "scale(1.1)" })
		})
	})

	describe("CSS string in config", () => {
		it("accepts string CSS in config object", () => {
			const result = styles("box", {
				css: "color: red; padding: 1rem",
			})

			expect(result["data-c"]).toBe("box")
			const css = getScopedStyles()
			expect(css).toContain("color:red")
		})
	})

	describe("tw option (Tailwind integration)", () => {
		it("accepts tw option with pre-transformed CSS", () => {
			// Note: At runtime, tw value is already raw CSS (transformed by build plugin)
			const result = styles("box", {
				tw: "display:flex;gap:1rem",
			})

			expect(result["data-c"]).toBe("box")
			const css = getScopedStyles()
			expect(css).toContain("display:flex")
			expect(css).toContain("gap:1rem")
		})

		it("combines tw with css string", () => {
			styles("card", {
				css: "color:red",
				tw: "display:flex;gap:1rem",
			})

			const css = getScopedStyles()
			expect(css).toContain("display:flex")
			expect(css).toContain("color:red")
		})

		it("combines tw with css function", () => {
			styles("item", {
				css: (s) => `${s.active(true)} { background: blue }`,
				state: { active: true },
				tw: "padding:1rem",
			})

			const css = getScopedStyles()
			expect(css).toContain("padding:1rem")
			expect(css).toContain('[data-c="item"][data-active="true"]')
		})

		it("combines tw with vars", () => {
			const result = styles("themed", {
				css: (_, v) => `color: ${v.color}`,
				tw: "display:flex",
				vars: { color: "red" },
			})

			expect(result.style).toHaveProperty("--_0", "red")
			const css = getScopedStyles()
			expect(css).toContain("display:flex")
			expect(css).toContain("var(--_0)")
		})

		it("css overrides tw (css comes after)", () => {
			styles("override", {
				css: "color:red",
				tw: "color:blue",
			})

			const css = getScopedStyles()
			// Both should be in the CSS, but red comes after
			expect(css).toContain("color:blue")
			expect(css).toContain("color:red")
			// CSS order: tw first, then css
			const colorBlueIndex = css.indexOf("color:blue")
			const colorRedIndex = css.indexOf("color:red")
			expect(colorRedIndex).toBeGreaterThan(colorBlueIndex)
		})

		it("works with outerCss", () => {
			const result = styles("card", {
				css: "margin:0",
				outerCss: "border:1px solid black",
				tw: "padding:1rem",
			})

			// outerCss generates hashed name
			expect(result["data-c"]).toMatch(/^card-[a-z0-9]+$/)

			const css = getScopedStyles()
			expect(css).toContain("padding:1rem")
			expect(css).toContain("margin:0")
			expect(css).toContain("border:1px solid black")
		})

		it("works with state and tw", () => {
			const result = styles("button", {
				css: (s) => `
					${s.loading(true)} { opacity: 0.5 }
					${s.size("lg")} { padding: 1rem }
				`,
				state: { loading: false, size: "md" },
				tw: "padding:0.5rem;background:white",
			})

			expect(result["data-loading"]).toBe("false")
			expect(result["data-size"]).toBe("md")

			const css = getScopedStyles()
			expect(css).toContain("padding:0.5rem")
			expect(css).toContain("background:white")
			expect(css).toContain('[data-c="button"][data-loading="true"]')
			expect(css).toContain('[data-c="button"][data-size="lg"]')
		})

		it("handles tw with pseudo-classes in pre-transformed CSS", () => {
			// Build plugin transforms hover: classes to &:hover{...} syntax
			styles("link", {
				tw: "color:blue;&:hover{color:red}",
			})

			const css = getScopedStyles()
			expect(css).toContain("color:blue")
			expect(css).toContain('[data-c="link"]:hover')
		})

		it("handles empty tw", () => {
			const result = styles("empty", {
				css: "color:red",
				tw: "",
			})

			expect(result["data-c"]).toBe("empty")
			const css = getScopedStyles()
			expect(css).toContain("color:red")
		})

		it("handles tw-only (no css)", () => {
			const result = styles("tw-only", {
				tw: "display:grid;gap:2rem",
			})

			expect(result["data-c"]).toBe("tw-only")
			const css = getScopedStyles()
			expect(css).toContain("display:grid")
			expect(css).toContain("gap:2rem")
		})
	})

	describe("edge cases", () => {
		it("handles empty state object", () => {
			const result = styles("box", {
				css: "color: red",
				state: {},
			})

			// Should only have data-c, no other data-* attributes
			const dataKeys = Object.keys(result).filter((k) => k.startsWith("data-"))
			expect(dataKeys).toEqual(["data-c"])
		})

		it("handles undefined state/vars gracefully", () => {
			const result = styles("box", {
				css: "color: red",
			})

			expect(result["data-c"]).toBe("box")
			expect(result.style).toBeUndefined()
		})

		it("handles complex CSS with multiple features", () => {
			styles("complex", {
				css: (s, v) => `
					color: ${v.accent};
					transition: opacity 0.2s;

					${s.loading(true)} {
						opacity: 0.5;
						pointer-events: none;
					}

					&:hover {
						background: #f0f0f0;
					}

					&::before {
						content: "";
						position: absolute;
					}

					@media (min-width: 768px) {
						padding: 2rem;
					}
				`,
				state: { loading: false },
				vars: { accent: "#10b981" },
			})

			const css = getScopedStyles()
			expect(css).toContain("var(--_0)")
			expect(css).toContain('[data-c="complex"][data-loading="true"]')
			expect(css).toContain('[data-c="complex"]:hover')
			expect(css).toContain('[data-c="complex"]::before')
			expect(css).toContain("@media (min-width: 768px)")
		})
	})
})
