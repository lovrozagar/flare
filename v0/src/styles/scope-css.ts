/**
 * CSS Scoper - Transform raw CSS to scoped CSS with [data-c="id"] selector
 *
 * Handles:
 * - Root declarations → [data-c="x"] { declarations }
 * - & references → [data-c="x"]:hover, [data-c="x"][data-active="true"]
 * - & descendants → [data-c="x"] .child
 * - @media/@container → selector moved inside
 * - @keyframes → passed through unchanged
 */

interface CSSSegment {
	type: "declarations" | "rule" | "atrule"
	selector?: string
	atRule?: string
	content: string
}

/**
 * Find matching closing brace, handling nesting and strings
 */
function findClosingBrace(css: string, start: number): number {
	let depth = 1
	let inString: string | null = null
	let i = start

	while (i < css.length && depth > 0) {
			const char = css[i]!
		const prev = i > 0 ? css[i - 1] : ""

		// Handle strings
		if ((char === '"' || char === "'") && prev !== "\\") {
			if (inString === char) inString = null
			else if (!inString) inString = char
		}

		// Track braces outside strings
		if (!inString) {
			if (char === "{") depth++
			if (char === "}") depth--
		}
		i++
	}

	return i - 1
}

/**
 * Parse CSS into segments
 */
function parseCSS(css: string): CSSSegment[] {
	const segments: CSSSegment[] = []
	let i = 0
	let buffer = ""

	while (i < css.length) {
			const char = css[i]!

		// Skip leading whitespace
		if (/\s/.test(char) && !buffer.trim()) {
			i++
			continue
		}

		// @rule
		if (char === "@") {
			if (buffer.trim()) {
				segments.push({ content: buffer, type: "declarations" })
				buffer = ""
			}

			let end = i
			while (end < css.length && css[end] !== "{") end++
			const atRule = css.slice(i, end).trim()

			const openBrace = end
			const closeBrace = findClosingBrace(css, openBrace + 1)
			const content = css.slice(openBrace + 1, closeBrace).trim()

			segments.push({ atRule, content, type: "atrule" })
			i = closeBrace + 1
			continue
		}

		// & rule
		if (char === "&") {
			if (buffer.trim()) {
				segments.push({ content: buffer, type: "declarations" })
				buffer = ""
			}

			let end = i
			while (end < css.length && css[end] !== "{") end++
			const selector = css.slice(i, end).trim()

			const openBrace = end
			const closeBrace = findClosingBrace(css, openBrace + 1)
			const content = css.slice(openBrace + 1, closeBrace).trim()

			segments.push({ content, selector, type: "rule" })
			i = closeBrace + 1
			continue
		}

		buffer += char
		i++
	}

	if (buffer.trim()) {
		segments.push({ content: buffer, type: "declarations" })
	}

	return segments
}

/**
 * Minify CSS declarations
 */
function minify(css: string): string {
	return css
		.replace(/\/\*[\s\S]*?\*\//g, "") // Remove comments
		.replace(/\s*\n\s*/g, "") // Remove newlines
		.replace(/\s*:\s*/g, ":") // Trim around colons
		.replace(/\s*;\s*/g, ";") // Trim around semicolons
		.replace(/\s*\{\s*/g, "{") // Trim around braces
		.replace(/\s*\}\s*/g, "}") // Trim around braces
		.replace(/;+/g, ";") // Collapse semicolons
		.replace(/^;|;$/g, "") // Remove leading/trailing
		.trim()
}

/**
 * Process segments and generate scoped CSS
 */
function processSegments(segments: CSSSegment[], selector: string): string {
	const output: string[] = []

	for (const seg of segments) {
		switch (seg.type) {
			case "declarations": {
				const min = minify(seg.content)
				if (min) output.push(`${selector}{${min}}`)
				break
			}

			case "rule": {
				const scoped = seg.selector!.replace(/&/g, selector)
				const nested = parseCSS(seg.content)

				if (nested.length === 1 && nested[0]?.type === "declarations") {
					const min = minify(seg.content)
					if (min) output.push(`${scoped}{${min}}`)
				} else {
					output.push(processSegments(nested, scoped))
				}
				break
			}

			case "atrule": {
				const atRule = seg.atRule!

				// @keyframes - pass through
				if (atRule.startsWith("@keyframes") || atRule.startsWith("@-webkit-keyframes")) {
					output.push(`${atRule}{${seg.content}}`)
					break
				}

				// @media, @container, @supports - scope inner
				const nested = parseCSS(seg.content)
				const inner = processSegments(nested, selector)
				if (inner) output.push(`${atRule}{${inner}}`)
				break
			}
		}
	}

	return output.join("")
}

/**
 * Scope raw CSS with [data-c="id"] selector
 *
 * @param id - Component identifier
 * @param css - Raw CSS (can include &, nesting, @rules)
 * @returns Scoped CSS string
 */
export function scopeCSS(id: string, css: string): string {
	if (!css?.trim()) return ""

	const selector = `[data-c="${id}"]`
	const segments = parseCSS(css)

	if (segments.length === 0) {
		const min = minify(css)
		return min ? `${selector}{${min}}` : ""
	}

	return processSegments(segments, selector)
}

/**
 * Check if CSS needs full parsing (vs simple declarations)
 */
export function needsFullParsing(css: string): boolean {
	return (
		css.includes("&") || /@(media|container|supports|keyframes)/i.test(css) || css.includes("{")
	)
}
