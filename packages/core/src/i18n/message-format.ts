/**
 * Minimal ICU MessageFormat parser
 * Handles: {var}, {var, plural, ...}, {var, select, ...}, {var, number}
 */

type PluralCategory = "few" | "many" | "one" | "other" | "two" | "zero"

function getPluralCategory(n: number, _locale?: string): PluralCategory {
	if (n === 1) return "one"
	return "other"
}

interface ParsedBlock {
	branches: Record<string, string>
	type: "plural" | "select"
	varName: string
}

interface ParsedNumber {
	type: "number"
	varName: string
}

interface ParsedSimple {
	type: "simple"
	varName: string
}

type ParsedToken = ParsedBlock | ParsedNumber | ParsedSimple | string

function findMatchingBrace(str: string, start: number): number {
	let depth = 0
	for (let i = start; i < str.length; i++) {
		if (str[i] === "{") depth++
		else if (str[i] === "}") {
			depth--
			if (depth === 0) return i
		}
	}
	return -1
}

function parseBranches(content: string): Record<string, string> {
	const branches: Record<string, string> = {}
	let i = 0
	while (i < content.length) {
		/* skip whitespace */
		while (i < content.length && /\s/.test(content[i] ?? "")) i++
		if (i >= content.length) break

		/* read category name (e.g. "one", "other", "=0") */
		let category = ""
		while (i < content.length && content[i] !== "{" && !/\s/.test(content[i] ?? "")) {
			category += content[i]
			i++
		}
		if (!category) break

		/* skip whitespace before { */
		while (i < content.length && /\s/.test(content[i] ?? "")) i++
		if (i >= content.length || content[i] !== "{") break

		/* find matching } */
		const end = findMatchingBrace(content, i)
		if (end === -1) break

		branches[category] = content.slice(i + 1, end)
		i = end + 1
	}
	return branches
}

function tokenize(message: string): ParsedToken[] {
	const tokens: ParsedToken[] = []
	let i = 0

	while (i < message.length) {
		const braceIdx = message.indexOf("{", i)
		if (braceIdx === -1) {
			tokens.push(message.slice(i))
			break
		}

		if (braceIdx > i) {
			tokens.push(message.slice(i, braceIdx))
		}

		const endBrace = findMatchingBrace(message, braceIdx)
		if (endBrace === -1) {
			tokens.push(message.slice(braceIdx))
			break
		}

		const inner = message.slice(braceIdx + 1, endBrace)
		const commaIdx = inner.indexOf(",")

		if (commaIdx === -1) {
			/* simple interpolation: {varName} */
			tokens.push({ type: "simple", varName: inner.trim() })
		} else {
			const varName = inner.slice(0, commaIdx).trim()
			const rest = inner.slice(commaIdx + 1).trim()
			const secondComma = rest.indexOf(",")

			if (secondComma === -1) {
				/* {var, number} or similar */
				const formatType = rest.trim()
				if (formatType === "number") {
					tokens.push({ type: "number", varName })
				} else {
					tokens.push({ type: "simple", varName })
				}
			} else {
				/* {var, plural/select, branches} */
				const formatType = rest.slice(0, secondComma).trim()
				const branchContent = rest.slice(secondComma + 1).trim()
				const branches = parseBranches(branchContent)

				if (formatType === "plural" || formatType === "select") {
					tokens.push({ branches, type: formatType, varName })
				} else {
					tokens.push({ type: "simple", varName })
				}
			}
		}

		i = endBrace + 1
	}

	return tokens
}

function resolveToken(
	token: ParsedToken,
	values: Record<string, unknown>,
	locale?: string,
): string {
	if (typeof token === "string") return token

	if (token.type === "simple") {
		const val = values[token.varName]
		return val !== undefined && val !== null ? String(val) : `{${token.varName}}`
	}

	if (token.type === "number") {
		const val = values[token.varName]
		if (val === undefined || val === null) return `{${token.varName}}`
		try {
			return new Intl.NumberFormat(locale).format(Number(val))
		} catch {
			return String(val)
		}
	}

	/* plural or select */
	const val = values[token.varName]

	if (token.type === "plural") {
		const num = Number(val ?? 0)
		const exactKey = `=${num}`
		const category = getPluralCategory(num, locale)
		const template =
			token.branches[exactKey] ?? token.branches[category] ?? token.branches.other ?? ""
		const resolved = template.replace(/#/g, String(num))
		return formatMessage(resolved, values, locale)
	}

	/* select */
	const strVal = val !== undefined && val !== null ? String(val) : ""
	const template = token.branches[strVal] ?? token.branches.other ?? ""
	return formatMessage(template, values, locale)
}

export function formatMessage(
	message: string,
	values?: Record<string, unknown>,
	locale?: string,
): string {
	if (!message) return message
	const safeValues = values ?? {}
	const tokens = tokenize(message)
	return tokens.map((t) => resolveToken(t, safeValues, locale)).join("")
}
