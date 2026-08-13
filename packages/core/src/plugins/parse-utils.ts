/** String-aware brace matcher for JS/TS object literals */
export function findMatchingBraceSimple(str: string, start: number): number {
	let depth = 0
	for (let i = start; i < str.length; i++) {
		const ch = str[i]
		/* Skip string literals */
		if (ch === '"' || ch === "'") {
			const q = ch
			i++
			while (i < str.length && str[i] !== q) {
				if (str[i] === "\\") i++
				i++
			}
			continue
		}
		/* Skip template literals */
		if (ch === "`") {
			i++
			while (i < str.length && str[i] !== "`") {
				if (str[i] === "\\") i++
				else if (str[i] === "$" && i + 1 < str.length && str[i + 1] === "{") {
					i += 2
					let tDepth = 1
					while (i < str.length && tDepth > 0) {
						if (str[i] === "{") tDepth++
						else if (str[i] === "}") tDepth--
						if (tDepth > 0) i++
					}
				}
				i++
			}
			continue
		}
		if (ch === "{") depth++
		else if (ch === "}") {
			depth--
			if (depth === 0) return i
		}
	}
	return str.length - 1
}

/**
 * Extract the content inside the outermost parens starting at `start`.
 * Returns [innerContent, endIndex] where endIndex points to the closing `)`.
 */
export function extractParenContent(code: string, start: number): [string, number] | null {
	if (code[start] !== "(") return null
	let depth = 1
	let i = start + 1
	for (; i < code.length; i++) {
		if (code[i] === "(") depth++
		else if (code[i] === ")") {
			depth--
			if (depth === 0) return [code.slice(start + 1, i), i]
		}
	}
	return null
}
