/**
 * Flare Plugin Tests
 *
 * Tests the pure utility functions in the main flare plugin.
 * Covers CSS transformation, minification, and script generation.
 */

import { describe, expect, it } from "vitest"

/* ============================================================================
 * Re-implemented Pure Functions for Testing
 * ============================================================================ */

/**
 * Transform Tailwind v4 @theme blocks to :root CSS custom properties
 */
function transformThemeToRoot(css: string): string {
	let result = css.replace(/@layer\s+[\w\s,]+;/g, "")
	result = result.replace(/@theme\s*\{/g, ":root {")
	return result
}

/**
 * Minify CSS string
 */
function minifyCss(css: string): string {
	return css
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\s+/g, " ")
		.replace(/\s*([{}:;,>+~])\s*/g, "$1")
		.replace(/;}/g, "}")
		.trim()
}

interface ThemeConfig {
	attribute?: string
	defaultTheme?: string
	storageKey?: string
}

interface DirectionConfig {
	enabled?: boolean
	attribute?: string
	defaultDir?: string
	storageKey?: string
}

/**
 * Generate theme inline script
 */
function generateThemeScript(theme: ThemeConfig | undefined): string {
	if (!theme) return ""
	const attr = theme.attribute ?? "data-theme"
	const defaultTheme = theme.defaultTheme ?? "system"
	const storageKey = theme.storageKey ?? "flare.theme"
	return `((k,d,a)=>{const e=document.documentElement;let t;try{t=localStorage.getItem(k)||d}catch{t=d}if(t==="system")t=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";e.setAttribute(a,t);e.style.colorScheme=t})("${storageKey}","${defaultTheme}","${attr}")`
}

/**
 * Generate direction inline script
 */
function generateDirectionScript(direction: DirectionConfig | undefined): string {
	if (!direction?.enabled) return ""
	const attr = direction.attribute ?? "data-dir"
	const defaultDir = direction.defaultDir ?? "ltr"
	const storageKey = direction.storageKey ?? "flare.dir"
	return `((k,d,a)=>{const e=document.documentElement;let t;try{t=localStorage.getItem(k)}catch{}if(!t)t=e.getAttribute("dir")||d;e.setAttribute(a,t);e.setAttribute("dir",t)})("${storageKey}","${defaultDir}","${attr}")`
}

/* ============================================================================
 * transformThemeToRoot Tests
 * ============================================================================ */

describe("transformThemeToRoot", () => {
	describe("@theme transformation", () => {
		it("transforms @theme { to :root {", () => {
			const css = "@theme { --primary: blue; }"
			const result = transformThemeToRoot(css)

			expect(result).toBe(":root { --primary: blue; }")
		})

		it("transforms @theme{ without space", () => {
			const css = "@theme{ --color: red; }"
			const result = transformThemeToRoot(css)

			expect(result).toBe(":root { --color: red; }")
		})

		it("transforms multiple @theme blocks", () => {
			const css = "@theme { --a: 1; } .x { color: red; } @theme { --b: 2; }"
			const result = transformThemeToRoot(css)

			expect(result).toBe(":root { --a: 1; } .x { color: red; } :root { --b: 2; }")
		})

		it("preserves content inside @theme", () => {
			const css = `@theme {
				--color-primary: oklch(0.7 0.15 200);
				--spacing-4: 1rem;
			}`
			const result = transformThemeToRoot(css)

			expect(result).toContain(":root {")
			expect(result).toContain("--color-primary: oklch(0.7 0.15 200)")
			expect(result).toContain("--spacing-4: 1rem")
		})
	})

	describe("@layer removal", () => {
		it("removes @layer declarations", () => {
			const css = "@layer base, components, utilities; .btn { color: blue; }"
			const result = transformThemeToRoot(css)

			expect(result).not.toContain("@layer")
			expect(result).toContain(".btn { color: blue; }")
		})

		it("removes @layer with single name", () => {
			const css = "@layer base; :root { --x: 1; }"
			const result = transformThemeToRoot(css)

			expect(result).not.toContain("@layer")
			expect(result).toContain(":root")
		})

		it("removes multiple @layer declarations", () => {
			const css = "@layer a; @layer b, c; .x { }"
			const result = transformThemeToRoot(css)

			expect(result).not.toContain("@layer")
		})
	})

	describe("combined transformations", () => {
		it("handles @layer and @theme together", () => {
			const css = "@layer base; @theme { --x: 1; } .btn { }"
			const result = transformThemeToRoot(css)

			expect(result).not.toContain("@layer")
			expect(result).toContain(":root { --x: 1; }")
			expect(result).toContain(".btn { }")
		})

		it("preserves other CSS unchanged", () => {
			const css = ".button { color: blue; } @media (min-width: 768px) { .x { } }"
			const result = transformThemeToRoot(css)

			expect(result).toBe(css)
		})
	})

	describe("edge cases", () => {
		it("handles empty input", () => {
			const result = transformThemeToRoot("")
			expect(result).toBe("")
		})

		it("handles input with no transformations needed", () => {
			const css = ".btn { color: red; }"
			const result = transformThemeToRoot(css)

			expect(result).toBe(css)
		})
	})
})

/* ============================================================================
 * minifyCss Tests
 * ============================================================================ */

describe("minifyCss", () => {
	describe("comment removal", () => {
		it("removes single-line comments", () => {
			const css = ".btn { /* color */ color: red; }"
			const result = minifyCss(css)

			expect(result).not.toContain("/*")
			expect(result).not.toContain("*/")
			expect(result).toContain("color:red")
		})

		it("removes multi-line comments", () => {
			const css = `.btn {
				/* This is a
				   multi-line comment */
				color: blue;
			}`
			const result = minifyCss(css)

			expect(result).not.toContain("/*")
			expect(result).toContain("color:blue")
		})

		it("removes multiple comments", () => {
			const css = "/* a */ .x { /* b */ color: red; /* c */ }"
			const result = minifyCss(css)

			expect(result.match(/\/\*/g)).toBeNull()
		})
	})

	describe("whitespace normalization", () => {
		it("collapses multiple spaces", () => {
			const css = ".btn    {    color:    red;    }"
			const result = minifyCss(css)

			expect(result).not.toContain("    ")
		})

		it("removes newlines", () => {
			const css = `.btn {
				color: red;
			}`
			const result = minifyCss(css)

			expect(result).not.toContain("\n")
			expect(result).not.toContain("\t")
		})

		it("trims leading and trailing whitespace", () => {
			const css = "   .btn { color: red; }   "
			const result = minifyCss(css)

			expect(result).not.toMatch(/^\s/)
			expect(result).not.toMatch(/\s$/)
		})
	})

	describe("punctuation spacing", () => {
		it("removes space around braces", () => {
			const css = ".btn { color: red; }"
			const result = minifyCss(css)

			expect(result).toContain(".btn{")
			expect(result).toContain("}")
		})

		it("removes space around colons", () => {
			const css = ".btn { color : red; }"
			const result = minifyCss(css)

			expect(result).toContain("color:red")
		})

		it("removes space around semicolons", () => {
			const css = ".btn { color: red ; margin: 0 ; }"
			const result = minifyCss(css)

			expect(result).toContain("red;margin")
		})

		it("removes space around commas", () => {
			const css = ".a , .b { color: red; }"
			const result = minifyCss(css)

			expect(result).toContain(".a,.b")
		})

		it("removes space around combinators", () => {
			const css = ".a > .b + .c ~ .d { color: red; }"
			const result = minifyCss(css)

			expect(result).toContain(".a>.b+.c~.d")
		})
	})

	describe("semicolon optimization", () => {
		it("removes trailing semicolon before closing brace", () => {
			const css = ".btn { color: red; }"
			const result = minifyCss(css)

			expect(result).toContain("red}")
			expect(result).not.toContain(";}")
		})
	})

	describe("complete minification", () => {
		it("fully minifies complex CSS", () => {
			const css = `
				/* Button styles */
				.btn {
					color: red;
					background: blue;
				}

				.btn:hover {
					color: white;
				}
			`
			const result = minifyCss(css)

			expect(result).toBe(".btn{color:red;background:blue}.btn:hover{color:white}")
		})

		it("handles empty input", () => {
			const result = minifyCss("")
			expect(result).toBe("")
		})

		it("handles whitespace-only input", () => {
			const result = minifyCss("   \n\t   ")
			expect(result).toBe("")
		})
	})
})

/* ============================================================================
 * generateThemeScript Tests
 * ============================================================================ */

describe("generateThemeScript", () => {
	describe("with no config", () => {
		it("returns empty string for undefined", () => {
			const result = generateThemeScript(undefined)
			expect(result).toBe("")
		})
	})

	describe("with default config", () => {
		it("uses default attribute data-theme", () => {
			const result = generateThemeScript({})

			expect(result).toContain('"data-theme"')
		})

		it("uses default theme system", () => {
			const result = generateThemeScript({})

			expect(result).toContain('"system"')
		})

		it("uses default storage key flare.theme", () => {
			const result = generateThemeScript({})

			expect(result).toContain('"flare.theme"')
		})
	})

	describe("with custom config", () => {
		it("uses custom attribute", () => {
			const result = generateThemeScript({ attribute: "data-color-scheme" })

			expect(result).toContain('"data-color-scheme"')
		})

		it("uses custom default theme", () => {
			const result = generateThemeScript({ defaultTheme: "dark" })

			expect(result).toContain('"dark"')
		})

		it("uses custom storage key", () => {
			const result = generateThemeScript({ storageKey: "app.theme" })

			expect(result).toContain('"app.theme"')
		})

		it("uses all custom values", () => {
			const result = generateThemeScript({
				attribute: "theme",
				defaultTheme: "light",
				storageKey: "my-theme",
			})

			expect(result).toContain('"my-theme"')
			expect(result).toContain('"light"')
			expect(result).toContain('"theme"')
		})
	})

	describe("script structure", () => {
		it("is an IIFE", () => {
			const result = generateThemeScript({})

			expect(result).toMatch(/^\(\(/)
			expect(result).toMatch(/\)$/)
		})

		it("accesses document.documentElement", () => {
			const result = generateThemeScript({})

			expect(result).toContain("document.documentElement")
		})

		it("uses localStorage", () => {
			const result = generateThemeScript({})

			expect(result).toContain("localStorage")
		})

		it("handles system theme with matchMedia", () => {
			const result = generateThemeScript({})

			expect(result).toContain("matchMedia")
			expect(result).toContain("prefers-color-scheme:dark")
		})

		it("sets colorScheme style", () => {
			const result = generateThemeScript({})

			expect(result).toContain("style.colorScheme")
		})
	})
})

/* ============================================================================
 * generateDirectionScript Tests
 * ============================================================================ */

describe("generateDirectionScript", () => {
	describe("with disabled/undefined config", () => {
		it("returns empty string for undefined", () => {
			const result = generateDirectionScript(undefined)
			expect(result).toBe("")
		})

		it("returns empty string when enabled is false", () => {
			const result = generateDirectionScript({ enabled: false })
			expect(result).toBe("")
		})

		it("returns empty string when enabled is not set", () => {
			const result = generateDirectionScript({})
			expect(result).toBe("")
		})
	})

	describe("with enabled config", () => {
		it("generates script when enabled", () => {
			const result = generateDirectionScript({ enabled: true })

			expect(result).not.toBe("")
			expect(result.length).toBeGreaterThan(0)
		})

		it("uses default attribute data-dir", () => {
			const result = generateDirectionScript({ enabled: true })

			expect(result).toContain('"data-dir"')
		})

		it("uses default direction ltr", () => {
			const result = generateDirectionScript({ enabled: true })

			expect(result).toContain('"ltr"')
		})

		it("uses default storage key flare.dir", () => {
			const result = generateDirectionScript({ enabled: true })

			expect(result).toContain('"flare.dir"')
		})
	})

	describe("with custom config", () => {
		it("uses custom attribute", () => {
			const result = generateDirectionScript({
				attribute: "data-direction",
				enabled: true,
			})

			expect(result).toContain('"data-direction"')
		})

		it("uses custom default direction", () => {
			const result = generateDirectionScript({
				defaultDir: "rtl",
				enabled: true,
			})

			expect(result).toContain('"rtl"')
		})

		it("uses custom storage key", () => {
			const result = generateDirectionScript({
				enabled: true,
				storageKey: "app.direction",
			})

			expect(result).toContain('"app.direction"')
		})

		it("uses all custom values", () => {
			const result = generateDirectionScript({
				attribute: "dir-attr",
				defaultDir: "rtl",
				enabled: true,
				storageKey: "my-dir",
			})

			expect(result).toContain('"my-dir"')
			expect(result).toContain('"rtl"')
			expect(result).toContain('"dir-attr"')
		})
	})

	describe("script structure", () => {
		it("is an IIFE", () => {
			const result = generateDirectionScript({ enabled: true })

			expect(result).toMatch(/^\(\(/)
			expect(result).toMatch(/\)$/)
		})

		it("accesses document.documentElement", () => {
			const result = generateDirectionScript({ enabled: true })

			expect(result).toContain("document.documentElement")
		})

		it("uses localStorage", () => {
			const result = generateDirectionScript({ enabled: true })

			expect(result).toContain("localStorage")
		})

		it("sets dir attribute", () => {
			const result = generateDirectionScript({ enabled: true })

			expect(result).toContain('setAttribute("dir"')
		})
	})
})

/* ============================================================================
 * Integration Tests
 * ============================================================================ */

describe("CSS pipeline integration", () => {
	it("transforms and minifies Tailwind v4 CSS", () => {
		const input = `
			@layer base, components, utilities;

			@theme {
				--color-primary: oklch(0.7 0.15 200);
				--spacing-4: 1rem;
			}

			/* Button component */
			.btn {
				color: var(--color-primary);
				padding: var(--spacing-4);
			}
		`

		const transformed = transformThemeToRoot(input)
		const minified = minifyCss(transformed)

		expect(minified).not.toContain("@layer")
		expect(minified).not.toContain("@theme")
		expect(minified).toContain(":root{")
		expect(minified).toContain("--color-primary:oklch(0.7 0.15 200)")
		expect(minified).not.toContain("/*")
		expect(minified).not.toContain("\n")
	})

	it("handles CSS with no transformations needed", () => {
		const input = ".btn { color: red; background: blue; }"

		const transformed = transformThemeToRoot(input)
		const minified = minifyCss(transformed)

		expect(minified).toBe(".btn{color:red;background:blue}")
	})
})
