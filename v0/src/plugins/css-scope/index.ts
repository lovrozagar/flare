/**
 * Vite Plugin: CSS Scope Transform
 *
 * Transforms css="..." to data-c={registerCSS("...")} at build time.
 * Works with Solid's JSX compilation - registerCSS is called at render time.
 *
 * Input:  <div css="color: red; font-size: 2rem">
 * Output: <div data-c={registerCSS("color: red; font-size: 2rem")}>
 *
 * The registerCSS function:
 * - Registers CSS in a global registry
 * - Returns a unique hash ID for the scoped selector
 * - On SSR: styles are collected and inlined in <style id="__FLARE_SCOPED__">
 * - On client: styles are injected for lazy-loaded components
 */

import type { Plugin } from "vite"

const REGISTER_CSS_IMPORT =
	'import { registerCSS as __flare_registerCSS__ } from "@flare/v0/styles"'

/**
 * Find the matching closing brace for css={...} expressions
 * Handles nested braces from tailwind transform output like:
 * css={({"class":"css"})[expr] ?? ""}
 */
function findMatchingBrace(code: string, start: number): number {
	let depth = 0
	let inString: string | null = null
	let escaped = false

	for (let i = start; i < code.length; i++) {
		const char = code[i]

		if (escaped) {
			escaped = false
			continue
		}

		if (char === "\\") {
			escaped = true
			continue
		}

		/* Track string context */
		if (inString) {
			if (char === inString) {
				inString = null
			}
			continue
		}

		if (char === '"' || char === "'" || char === "`") {
			inString = char
			continue
		}

		/* Track brace depth */
		if (char === "{") {
			depth++
		} else if (char === "}") {
			depth--
			if (depth === 0) {
				return i
			}
		}
	}

	return -1 /* No match found */
}

/**
 * Transform css={...} expressions with nested braces
 */
function transformCssDynamicExpressions(code: string, onTransform: () => void): string {
	const CSS_EXPR_START = /\bcss=\{/g
	let result = ""
	let lastIndex = 0
	let match: RegExpExecArray | null

	while ((match = CSS_EXPR_START.exec(code)) !== null) {
		const startIndex = match.index
		const exprStart = startIndex + match[0].length - 1 /* Position of opening { */
		const exprEnd = findMatchingBrace(code, exprStart)

		if (exprEnd === -1) {
			/* No matching brace found, skip this match */
			continue
		}

		/* Extract the expression (without outer braces) */
		const expr = code.slice(exprStart + 1, exprEnd)

		/* Skip if already transformed */
		if (expr.includes("__flare_registerCSS__")) {
			continue
		}

		/* Get trailing whitespace */
		let trailingSpace = ""
		const nextChar = code[exprEnd + 1]
		if (nextChar !== undefined && /\s/.test(nextChar)) {
			const wsMatch = code.slice(exprEnd + 1).match(/^\s+/)
			trailingSpace = wsMatch ? wsMatch[0] : ""
		}

		/* Build replacement */
		result += code.slice(lastIndex, startIndex)
		result += `data-c={__flare_registerCSS__(${expr})}${trailingSpace || " "}`
		lastIndex = exprEnd + 1 + trailingSpace.length

		onTransform()
	}

	/* Append remaining code */
	result += code.slice(lastIndex)

	return result
}

/**
 * Check if code contains css= attribute (but not as part of other words)
 */
function hasCssAttribute(code: string): boolean {
	return /\bcss\s*=/.test(code)
}

/**
 * Transform css="..." to data-c={registerCSS("...")}
 */
function transformCss(code: string): string {
	let result = code
	let needsImport = false

	/* Handle multiline css={`...`} template literals first (most specific) */
	result = result.replace(/\bcss=\{(`[\s\S]*?`)\}(\s*)/g, (_, templateLiteral, trailingSpace) => {
		needsImport = true
		return `data-c={__flare_registerCSS__(${templateLiteral})}${trailingSpace || " "}`
	})

	/* Handle css="..." (double-quoted strings, including multiline) */
	result = result.replace(/\bcss="([\s\S]*?)"(\s*)/g, (_, cssValue, trailingSpace) => {
		/* Skip empty css="" - remove attribute entirely */
		if (!cssValue.trim()) return ""
		needsImport = true
		/* Escape for JSON string */
		const escaped = JSON.stringify(cssValue)
		/* Preserve trailing space or add one if followed by another attribute */
		return `data-c={__flare_registerCSS__(${escaped})}${trailingSpace || " "}`
	})

	/* Handle css='...' (single-quoted strings, including multiline) */
	result = result.replace(/\bcss='([\s\S]*?)'(\s*)/g, (_, cssValue, trailingSpace) => {
		/* Skip empty css='' - remove attribute entirely */
		if (!cssValue.trim()) return ""
		needsImport = true
		/* Escape for JSON string */
		const escaped = JSON.stringify(cssValue)
		/* Preserve trailing space or add one if followed by another attribute */
		return `data-c={__flare_registerCSS__(${escaped})}${trailingSpace || " "}`
	})

	/* Handle css={...} (dynamic expressions including nested braces from tailwind transform) */
	result = transformCssDynamicExpressions(result, () => {
		needsImport = true
	})

	/* Add import if we transformed any css attributes */
	if (needsImport && !result.includes(REGISTER_CSS_IMPORT)) {
		/* Find a good place to insert the import */
		/* Insert after existing imports or at top */
		const importRegex =
			/^((?:import\s+[\s\S]*?(?:from\s+["'][^"']+["']|["'][^"']+["'])\s*;?\s*\n?)+)/m
		const importMatch = result.match(importRegex)
		if (importMatch) {
			const insertPos = importMatch.index! + importMatch[0].length
			result = `${result.slice(0, insertPos) + REGISTER_CSS_IMPORT}\n${result.slice(insertPos)}`
		} else {
			/* No imports found, add at the beginning */
			result = `${REGISTER_CSS_IMPORT}\n${result}`
		}
	}

	return result
}

/**
 * Check if file is TSX/JSX (handles Vite query strings like ?v=123)
 */
function isTsxOrJsx(id: string): boolean {
	const cleanId = id.split("?")[0] ?? ""
	return cleanId.endsWith(".tsx") || cleanId.endsWith(".jsx")
}

/**
 * Vite plugin for css= to data-c= transformation
 * Uses transform hook - runs after tw-transform's load hook
 */
export function cssScope(): Plugin {
	return {
		enforce: "pre",
		name: "flare:css-scope",

		transform(code, id) {
			/* Only process TSX/JSX files */
			if (!isTsxOrJsx(id)) {
				return null
			}

			/* Skip if no css= attributes */
			if (!hasCssAttribute(code)) {
				return null
			}

			/* Transform css= to data-c= */
			const transformed = transformCss(code)

			if (transformed === code) {
				return null
			}

			return {
				code: transformed,
				map: null,
			}
		},
	}
}
