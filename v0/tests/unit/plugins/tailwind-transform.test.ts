/**
 * Tailwind Transform Plugin Tests
 *
 * Tests tw= to css= transformation logic.
 * Pure functions re-implemented for testing without Tailwind compiler.
 * Real parseTailwindOutput / splitTokens / mergeClassAttributes imported from source.
 */

import { describe, expect, it } from "vitest"
import {
	mergeClassAttributes,
	parseTailwindOutput,
	splitTokens,
} from "../../../src/plugins/tailwind-transform/index"

/* Re-export check: ensure we are exercising the real production functions */

/* ============================================================================
 * parseTailwindOutput Tests (real implementation)
 * ============================================================================ */

describe("parseTailwindOutput", () => {
	it("preserves &:hover nested rules", () => {
		const css = ".hover\\:bg-red-500 { &:hover { background-color: #ef4444; } }"
		const result = parseTailwindOutput(css)
		expect(result).toContain("&:hover")
		expect(result).toContain("background-color: #ef4444")
	})

	it("preserves &:focus-visible nested rules", () => {
		const css = ".focus-visible\\:ring { &:focus-visible { outline: 2px solid blue; } }"
		const result = parseTailwindOutput(css)
		expect(result).toContain("&:focus-visible")
		expect(result).toContain("outline")
	})

	it("preserves &[data-open] attribute-variant nesting", () => {
		const css = ".data-\\[open\\]\\:flex { &[data-open] { display: flex; } }"
		const result = parseTailwindOutput(css)
		expect(result).toContain("&[data-open]")
		expect(result).toContain("display: flex")
	})

	it("preserves @media wrappers verbatim", () => {
		const css = "@media (min-width: 768px) { .md\\:flex { display: flex; } }"
		const result = parseTailwindOutput(css)
		expect(result).toContain("@media (min-width: 768px)")
	})

	it("drops empty-body rules (group, peer) with no stray semicolons", () => {
		const css = ".group { } .p-4 { padding: 1rem; }"
		const result = parseTailwindOutput(css)
		/* group body is empty — not included */
		expect(result).toBe("padding: 1rem;")
		/* no stray ;; from dropped empty rule */
		expect(result).not.toContain(";;")
	})

	it("preserves var() refs without resolving them", () => {
		const css = ".bg-accent { background-color: var(--color-accent); }"
		const result = parseTailwindOutput(css)
		expect(result).toContain("var(--color-accent)")
		/* must NOT have inlined any literal hex value */
		expect(result).not.toMatch(/#[0-9a-fA-F]{3,6}/)
	})

	it("handles deeply nested &:hover { &[data-open] { ... } }", () => {
		const css = ".x { color: red; &:hover { &[data-open] { color: blue; } } }"
		const result = parseTailwindOutput(css)
		expect(result).toContain("&:hover")
		expect(result).toContain("&[data-open]")
	})

	it("returns empty string for input with only empty-body rules", () => {
		const css = ".group { } .peer { }"
		const result = parseTailwindOutput(css)
		expect(result).toBe("")
	})

	it("skips :root block declarations", () => {
		const css = ":root { --color: red; } .p-4 { padding: 1rem; }"
		const result = parseTailwindOutput(css)
		/* :root is not a . rule, must be skipped */
		expect(result).not.toContain("--color")
		expect(result).toContain("padding: 1rem")
	})

	it("returns empty string for empty input", () => {
		expect(parseTailwindOutput("")).toBe("")
	})
})

/* ============================================================================
 * splitTokens Tests (real implementation)
 * ============================================================================ */

describe("splitTokens", () => {
	it("classifies group as marker", () => {
		const { markers, utilities } = splitTokens("group p-4 hover:bg-red")
		expect(markers).toEqual(["group"])
		expect(utilities).toBe("p-4 hover:bg-red")
	})

	it("classifies peer as marker", () => {
		const { markers, utilities } = splitTokens("peer flex")
		expect(markers).toEqual(["peer"])
		expect(utilities).toBe("flex")
	})

	it("classifies named group/name and peer/name as markers", () => {
		const { markers } = splitTokens("group/item peer/sibling p-4")
		expect(markers).toContain("group/item")
		expect(markers).toContain("peer/sibling")
	})

	it("does NOT classify group-hover:X as marker (descendant variant, not self-marker)", () => {
		const { markers, utilities } = splitTokens("group-hover:opacity-100")
		expect(markers).toEqual([])
		expect(utilities).toBe("group-hover:opacity-100")
	})

	it("does NOT classify peer-focus:X as marker", () => {
		const { markers, utilities } = splitTokens("peer-focus:ring")
		expect(markers).toEqual([])
		expect(utilities).toBe("peer-focus:ring")
	})

	it("returns empty markers for pure utility input", () => {
		const { markers, utilities } = splitTokens("p-4 m-2 flex items-center")
		expect(markers).toEqual([])
		expect(utilities).toBe("p-4 m-2 flex items-center")
	})

	it("handles empty string", () => {
		const { markers, utilities } = splitTokens("")
		expect(markers).toEqual([])
		expect(utilities).toBe("")
	})

	it("handles only markers", () => {
		const { markers, utilities } = splitTokens("group peer")
		expect(markers).toEqual(["group", "peer"])
		expect(utilities).toBe("")
	})
})

/* ============================================================================
 * mergeClassAttributes Tests (real implementation)
 * ============================================================================ */

describe("mergeClassAttributes", () => {
	it("merges two adjacent class= attrs on an element", () => {
		expect(mergeClassAttributes('<div class="a" class="b">')).toBe('<div class="a b">')
	})

	it("leaves a singleton class= unchanged", () => {
		expect(mergeClassAttributes('<div class="a">')).toBe('<div class="a">')
	})

	it("filters empty first value, keeps second", () => {
		expect(mergeClassAttributes('<div class="" class="b">')).toBe('<div class="b">')
	})

	it("filters empty second value, keeps first", () => {
		expect(mergeClassAttributes('<div class="a" class="">')).toBe('<div class="a">')
	})

	it("returns empty class when both values empty", () => {
		expect(mergeClassAttributes('<div class="" class="">')).toBe('<div class="">')
	})

	it("leaves non-class attrs untouched around the merge", () => {
		const input = '<a class="foo" class="group" href="/">'
		expect(mergeClassAttributes(input)).toBe('<a class="foo group" href="/">')
	})

	it("merges class= attrs separated by another attr (css=)", () => {
		const input = '<a class="foo" css="display:flex" class="group">'
		const out = mergeClassAttributes(input)
		expect(out).toContain('class="foo group"')
		expect(out).not.toMatch(/class="[^"]*"\s*class=/)
	})
})

/* ============================================================================
 * Legacy local-implementation tests (kept for regression coverage)
 * ============================================================================ */

/* ============================================================================
 * Re-implemented Pure Functions for Testing
 * ============================================================================ */

/**
 * Extract CSS declarations from Tailwind v4 output
 * - Parses :root/:host variable definitions
 * - Extracts only utility class declarations
 * - Resolves var() references to actual values
 * - Skips @property, @supports, @keyframes, etc.
 */
function extractDeclarations(css: string): string {
	/* Step 1: Extract CSS variable definitions from :root/:host blocks */
	const cssVars = new Map<string, string>()
	const rootRegex = /:root\s*,?\s*:host\s*\{([^}]+)\}/g
	let rootMatch = rootRegex.exec(css)
	while (rootMatch !== null) {
		const content = rootMatch[1]
		if (content) {
			/* Parse variable declarations: --name: value */
			const varRegex = /--([\w-]+)\s*:\s*([^;]+)/g
			let varMatch = varRegex.exec(content)
			while (varMatch !== null) {
				const varName = varMatch[1]
				const varValue = varMatch[2]
				if (varName && varValue) {
					const name = `--${varName}`
					const value = varValue.trim()
					cssVars.set(name, value)
				}
				varMatch = varRegex.exec(content)
			}
		}
		rootMatch = rootRegex.exec(css)
	}

	/* Step 2: Extract declarations from utility class rules only */
	/* Match .class-name { declarations } - skip :root, @rules, etc. */
	const declarations: string[] = []
	const classRegex = /\.([\w-]+)\s*\{([^}]+)\}/g
	let classMatch = classRegex.exec(css)
	while (classMatch !== null) {
		const decl = classMatch[2]
		if (decl) {
			const trimmed = decl.trim()
			if (trimmed) {
				declarations.push(trimmed)
			}
		}
		classMatch = classRegex.exec(css)
	}

	/* Step 3: Join declarations */
	let result = declarations.join(";")

	/* Step 4: Resolve var() references with fallbacks */
	/* Handle: var(--name), var(--name, fallback), nested var() */
	const resolveVars = (str: string, depth = 0): string => {
		if (depth > 10) return str /* Prevent infinite recursion */
		return str.replace(/var\(([^()]+(?:\([^()]*\))?[^()]*)\)/g, (_, content) => {
			/* Parse var name and optional fallback */
			const commaIdx = content.indexOf(",")
			let varName: string
			let fallback: string | undefined
			if (commaIdx !== -1) {
				varName = content.slice(0, commaIdx).trim()
				fallback = content.slice(commaIdx + 1).trim()
			} else {
				varName = content.trim()
			}
			/* Look up value */
			const value = cssVars.get(varName)
			if (value !== undefined) {
				/* Recursively resolve if value contains var() */
				return resolveVars(value, depth + 1)
			}
			/* Use fallback if available */
			if (fallback !== undefined) {
				return resolveVars(fallback, depth + 1)
			}
			/* Keep original var() if unresolvable */
			return `var(${content})`
		})
	}
	result = resolveVars(result)

	/* Step 5: Resolve calc() expressions where possible */
	result = result.replace(/calc\(([^)]+)\)/g, (match, expr) => {
		/* Simple calc with numbers: calc(0.25rem * 4) → 1rem */
		const simpleCalc = expr.match(/^([\d.]+)(rem|px|em|%)\s*\*\s*([\d.]+)$/)
		if (simpleCalc) {
			const num = parseFloat(simpleCalc[1]) * parseFloat(simpleCalc[3])
			return `${num}${simpleCalc[2]}`
		}
		const reverseCalc = expr.match(/^([\d.]+)\s*\*\s*([\d.]+)(rem|px|em|%)$/)
		if (reverseCalc) {
			const num = parseFloat(reverseCalc[1]) * parseFloat(reverseCalc[2])
			return `${num}${reverseCalc[3]}`
		}
		/* Division: calc(1.75 / 1.25) → 1.4 */
		const divCalc = expr.match(/^([\d.]+)\s*\/\s*([\d.]+)$/)
		if (divCalc) {
			const num = parseFloat(divCalc[1]) / parseFloat(divCalc[2])
			return String(Math.round(num * 1000) / 1000)
		}
		return match
	})

	/* Step 6: Minify */
	result = result
		.replace(/\s*\n\s*/g, "")
		.replace(/\s*:\s*/g, ":")
		.replace(/\s*;\s*/g, ";")
		.replace(/;+/g, ";")
		.replace(/^;|;$/g, "")

	return result
}

/**
 * Extract string literals from a JavaScript expression
 * Handles: ternaries, logical operators, simple strings
 */
function extractStringLiterals(expr: string): string[] {
	const literals: string[] = []

	/* Match double-quoted strings */
	const doubleQuoted = expr.match(/"([^"\\]|\\.)*"/g)
	if (doubleQuoted) {
		for (const match of doubleQuoted) {
			literals.push(match.slice(1, -1))
		}
	}

	/* Match single-quoted strings */
	const singleQuoted = expr.match(/'([^'\\]|\\.)*'/g)
	if (singleQuoted) {
		for (const match of singleQuoted) {
			literals.push(match.slice(1, -1))
		}
	}

	/* Filter empty strings */
	return literals.filter((s) => s.length > 0)
}

/**
 * Check if a string contains tw= attribute or tw: property
 */
function hasTwAttribute(code: string): boolean {
	return /\btw\s*=/.test(code) || /\btw\s*:/.test(code)
}

/**
 * Merge adjacent tw= and css= on same element
 * The css= value takes precedence (appended after tw=)
 */
function mergeTwAndCss(code: string): string {
	/* Pattern: css="tw-resolved" css="user-css" on same element */
	/* This happens after tw→css transform, so we have two css= attrs */

	/* Find elements with multiple css= */
	/* Regex matches: first css="..." followed by whitespace and another css="..." */
	/* Use [^"]* (zero or more) not [^"]+ to handle empty css="" from unresolved tw */
	const multiCssRegex = /css="([^"]*)"\s+css="([^"]*)"/g

	return code.replace(multiCssRegex, (_, first, second) => {
		/* Merge: first (from tw) + second (original css) */
		let merged = first
		if (!merged.endsWith(";")) {
			merged += ";"
		}
		merged += second
		/* Clean up trailing semicolon */
		merged = merged.replace(/;+/g, ";").replace(/;$/, "")
		return `css="${merged}"`
	})
}

/* ============================================================================
 * extractDeclarations Tests
 * ============================================================================ */

describe("extractDeclarations", () => {
	describe("basic extraction", () => {
		it("extracts declarations from simple class", () => {
			const css = ".p-4 { padding: 1rem; }"
			const result = extractDeclarations(css)

			expect(result).toBe("padding:1rem")
		})

		it("extracts declarations from multiple classes", () => {
			const css = ".p-4 { padding: 1rem; } .m-2 { margin: 0.5rem; }"
			const result = extractDeclarations(css)

			expect(result).toBe("padding:1rem;margin:0.5rem")
		})

		it("removes whitespace and newlines", () => {
			const css = `.flex {
				display: flex;
			}`
			const result = extractDeclarations(css)

			expect(result).toBe("display:flex")
		})

		it("handles complex selectors", () => {
			const css = ".bg-red-500 { background-color: #ef4444; }"
			const result = extractDeclarations(css)

			expect(result).toBe("background-color:#ef4444")
		})
	})

	describe("CSS variable resolution", () => {
		it("resolves var() references from :root", () => {
			const css = `:root, :host { --spacing-4: 1rem; }
				.p-4 { padding: var(--spacing-4); }`
			const result = extractDeclarations(css)

			expect(result).toBe("padding:1rem")
		})

		it("resolves nested var() references", () => {
			const css = `:root, :host {
				--base: 0.25rem;
				--spacing-4: var(--base);
			}
			.p-4 { padding: var(--spacing-4); }`
			const result = extractDeclarations(css)

			expect(result).toBe("padding:0.25rem")
		})

		it("uses fallback when variable not defined", () => {
			const css = ".p-4 { padding: var(--undefined, 1rem); }"
			const result = extractDeclarations(css)

			expect(result).toBe("padding:1rem")
		})

		it("keeps var() when no value or fallback", () => {
			const css = ".p-4 { padding: var(--undefined); }"
			const result = extractDeclarations(css)

			expect(result).toBe("padding:var(--undefined)")
		})

		it("handles multiple variables in one declaration", () => {
			const css = `:root, :host { --x: 1rem; --y: 2rem; }
				.m { margin: var(--x) var(--y); }`
			const result = extractDeclarations(css)

			expect(result).toBe("margin:1rem 2rem")
		})
	})

	describe("calc() resolution", () => {
		it("resolves simple multiplication with unit first", () => {
			const css = ".p { padding: calc(0.25rem * 4); }"
			const result = extractDeclarations(css)

			expect(result).toBe("padding:1rem")
		})

		it("resolves multiplication with unit last", () => {
			const css = ".p { padding: calc(4 * 0.25rem); }"
			const result = extractDeclarations(css)

			expect(result).toBe("padding:1rem")
		})

		it("resolves division", () => {
			const css = ".lh { line-height: calc(1.75 / 1.25); }"
			const result = extractDeclarations(css)

			expect(result).toBe("line-height:1.4")
		})

		it("keeps complex calc() expressions", () => {
			const css = ".w { width: calc(100% - 2rem); }"
			const result = extractDeclarations(css)

			expect(result).toBe("width:calc(100% - 2rem)")
		})
	})

	describe("edge cases", () => {
		it("returns empty string for empty input", () => {
			const result = extractDeclarations("")
			expect(result).toBe("")
		})

		it("skips @rules", () => {
			const css =
				"@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }"
			const result = extractDeclarations(css)

			/* @keyframes content matches .class-name pattern but we don't want it */
			expect(result).not.toContain("keyframes")
		})

		it("handles duplicate semicolons", () => {
			const css = ".p { padding: 1rem;; margin: 0;; }"
			const result = extractDeclarations(css)

			expect(result).not.toContain(";;")
		})

		it("handles :root without :host", () => {
			const css = ":root { --x: 10px; } .p { padding: var(--x); }"
			const result = extractDeclarations(css)

			/* Won't match the :root, :host pattern - var stays unresolved */
			expect(result).toBe("padding:var(--x)")
		})
	})
})

/* ============================================================================
 * extractStringLiterals Tests
 * ============================================================================ */

describe("extractStringLiterals", () => {
	describe("double-quoted strings", () => {
		it("extracts simple double-quoted string", () => {
			const result = extractStringLiterals('"bg-blue"')
			expect(result).toEqual(["bg-blue"])
		})

		it("extracts multiple double-quoted strings", () => {
			const result = extractStringLiterals('active ? "bg-blue" : "bg-gray"')
			expect(result).toEqual(["bg-blue", "bg-gray"])
		})

		it("handles escaped quotes", () => {
			const result = extractStringLiterals('"hello \\"world\\""')
			expect(result).toEqual(['hello \\"world\\"'])
		})
	})

	describe("single-quoted strings", () => {
		it("extracts simple single-quoted string", () => {
			const result = extractStringLiterals("'bg-red'")
			expect(result).toEqual(["bg-red"])
		})

		it("extracts multiple single-quoted strings", () => {
			const result = extractStringLiterals("active ? 'text-lg' : 'text-sm'")
			expect(result).toEqual(["text-lg", "text-sm"])
		})

		it("handles escaped quotes", () => {
			const result = extractStringLiterals("'it\\'s a test'")
			expect(result).toEqual(["it\\'s a test"])
		})
	})

	describe("mixed quotes", () => {
		it("extracts both single and double quoted strings", () => {
			const result = extractStringLiterals(`active ? "bg-blue" : 'bg-gray'`)
			expect(result).toEqual(["bg-blue", "bg-gray"])
		})

		it("extracts from complex ternary", () => {
			const result = extractStringLiterals(`a ? "x" : b ? "y" : "z"`)
			expect(result).toEqual(["x", "y", "z"])
		})

		it("extracts from logical OR", () => {
			const result = extractStringLiterals(`myClass || "default"`)
			expect(result).toEqual(["default"])
		})
	})

	describe("edge cases", () => {
		it("returns empty array for template literal", () => {
			const result = extractStringLiterals("`text-${size}`")
			expect(result).toEqual([])
		})

		it("returns empty array for no strings", () => {
			const result = extractStringLiterals("myVariable")
			expect(result).toEqual([])
		})

		it("filters empty strings", () => {
			const result = extractStringLiterals('"" || "fallback"')
			expect(result).toEqual(["fallback"])
		})

		it("handles strings with spaces", () => {
			const result = extractStringLiterals('"p-4 m-2 text-lg"')
			expect(result).toEqual(["p-4 m-2 text-lg"])
		})
	})
})

/* ============================================================================
 * hasTwAttribute Tests
 * ============================================================================ */

describe("hasTwAttribute", () => {
	describe("JSX attributes", () => {
		it("detects tw= attribute", () => {
			expect(hasTwAttribute('<div tw="p-4">')).toBe(true)
		})

		it("detects tw = with space", () => {
			expect(hasTwAttribute('<div tw = "p-4">')).toBe(true)
		})

		it("detects tw={}", () => {
			expect(hasTwAttribute("<div tw={classes}>")).toBe(true)
		})

		it("returns false for no tw attribute", () => {
			expect(hasTwAttribute('<div class="p-4">')).toBe(false)
		})

		it("returns false for css attribute", () => {
			expect(hasTwAttribute('<div css="color:red">')).toBe(false)
		})
	})

	describe("object properties", () => {
		it("detects tw: in styles() call", () => {
			expect(hasTwAttribute('styles("btn", { tw: "flex" })')).toBe(true)
		})

		it("detects tw : with space", () => {
			expect(hasTwAttribute('{ tw : "flex" }')).toBe(true)
		})

		it("returns false for other properties", () => {
			expect(hasTwAttribute('{ css: "flex" }')).toBe(false)
		})
	})

	describe("edge cases", () => {
		it("returns false for partial match (tw-)", () => {
			expect(hasTwAttribute('<div tw-something="x">')).toBe(false)
		})

		it("returns false for suffix match (-tw)", () => {
			expect(hasTwAttribute('const notw = "x"')).toBe(false)
		})

		it("detects tw in mixed content", () => {
			const code = `
				<div class="x">
					<span tw="p-4">
				</div>
			`
			expect(hasTwAttribute(code)).toBe(true)
		})
	})
})

/* ============================================================================
 * mergeTwAndCss Tests
 * ============================================================================ */

describe("mergeTwAndCss", () => {
	describe("basic merging", () => {
		it("merges two css attributes", () => {
			const input = 'css="padding:1rem" css="color:red"'
			const result = mergeTwAndCss(input)

			expect(result).toBe('css="padding:1rem;color:red"')
		})

		it("handles first value without trailing semicolon", () => {
			const input = 'css="padding:1rem" css="color:red"'
			const result = mergeTwAndCss(input)

			expect(result).toContain("padding:1rem;color:red")
		})

		it("handles first value with trailing semicolon", () => {
			const input = 'css="padding:1rem;" css="color:red"'
			const result = mergeTwAndCss(input)

			expect(result).toBe('css="padding:1rem;color:red"')
		})

		it("cleans up multiple semicolons", () => {
			const input = 'css="padding:1rem;;" css="color:red;"'
			const result = mergeTwAndCss(input)

			expect(result).not.toContain(";;")
			expect(result).not.toMatch(/;$/g)
		})
	})

	describe("empty values", () => {
		it("handles empty first value", () => {
			const input = 'css="" css="color:red"'
			const result = mergeTwAndCss(input)

			/* Empty first + second = ;second - semicolon handling leaves leading ; */
			expect(result).toBe('css=";color:red"')
		})

		it("handles empty second value", () => {
			const input = 'css="padding:1rem" css=""'
			const result = mergeTwAndCss(input)

			/* First + empty = first; - trailing semicolon cleaned */
			expect(result).toBe('css="padding:1rem"')
		})

		it("handles both empty", () => {
			const input = 'css="" css=""'
			const result = mergeTwAndCss(input)

			/* Empty + empty = "" after trailing semicolon cleanup */
			expect(result).toBe('css=""')
		})
	})

	describe("full element context", () => {
		it("works within JSX element", () => {
			const input = '<div css="padding:1rem" css="color:red" className="x">'
			const result = mergeTwAndCss(input)

			expect(result).toBe('<div css="padding:1rem;color:red" className="x">')
		})

		it("handles multiple elements", () => {
			const input = `
				<div css="p:1rem" css="c:red">
				<span css="m:0" css="d:flex">
			`
			const result = mergeTwAndCss(input)

			expect(result).toContain('css="p:1rem;c:red"')
			expect(result).toContain('css="m:0;d:flex"')
		})

		it("leaves single css attributes unchanged", () => {
			const input = '<div css="padding:1rem" className="x">'
			const result = mergeTwAndCss(input)

			expect(result).toBe(input)
		})
	})

	describe("edge cases", () => {
		it("handles no css attributes", () => {
			const input = '<div className="x">'
			const result = mergeTwAndCss(input)

			expect(result).toBe(input)
		})

		it("handles newlines between attributes", () => {
			/* Regex uses \s+ which includes newlines */
			const input = 'css="padding:1rem"\ncss="color:red"'
			const result = mergeTwAndCss(input)

			expect(result).toBe('css="padding:1rem;color:red"')
		})

		it("handles tabs between attributes", () => {
			const input = 'css="padding:1rem"\t\tcss="color:red"'
			const result = mergeTwAndCss(input)

			expect(result).toBe('css="padding:1rem;color:red"')
		})
	})
})
