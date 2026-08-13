/* ── Types ───────────────────────────────────────────────────────────── */

export type ConsoleMethod = "debug" | "info" | "log" | "warn"

export interface PurgeConfig {
	console?: ConsoleMethod[] | boolean
	debugger?: boolean
	testIds?: boolean | string[]
}

export interface ResolvedPurgeConfig {
	console: ConsoleMethod[] | false
	debugger: boolean
	testIds: false | string[]
}

interface VitePurgePlugin {
	name: string
	transform?: (code: string, id: string) => { code: string; map: null } | null
}

/* ── Defaults ────────────────────────────────────────────────────────── */

const PURGE_TRUE_DEFAULTS: ResolvedPurgeConfig = {
	console: ["log", "debug"],
	debugger: true,
	testIds: ["data-testid"],
}

const PURGE_DISABLED: ResolvedPurgeConfig = {
	console: false,
	debugger: false,
	testIds: false,
}

/* ── Resolvers ───────────────────────────────────────────────────────── */

export function resolvePurgeConfig(raw?: PurgeConfig | boolean): ResolvedPurgeConfig {
	if (raw === undefined || raw === false) return { ...PURGE_DISABLED }
	if (raw === true) return { ...PURGE_TRUE_DEFAULTS }

	return {
		console: resolveConsole(raw.console),
		debugger: raw.debugger ?? false,
		testIds: resolveTestIds(raw.testIds),
	}
}

function resolveConsole(val?: ConsoleMethod[] | boolean): ConsoleMethod[] | false {
	if (val === true) return PURGE_TRUE_DEFAULTS.console as ConsoleMethod[]
	if (val === false || val === undefined) return false
	return val
}

function resolveTestIds(val?: boolean | string[]): false | string[] {
	if (val === true) return PURGE_TRUE_DEFAULTS.testIds as string[]
	if (val === false || val === undefined) return false
	return val
}

/* ── String-aware paren matcher ──────────────────────────────────────── */

function findClosingParen(code: string, start: number): number {
	let depth = 1
	for (let i = start + 1; i < code.length; i++) {
		const ch = code[i]
		if (ch === '"' || ch === "'") {
			const q = ch
			i++
			while (i < code.length && code[i] !== q) {
				if (code[i] === "\\") i++
				i++
			}
			continue
		}
		if (ch === "`") {
			i++
			while (i < code.length && code[i] !== "`") {
				if (code[i] === "\\") i++
				else if (code[i] === "$" && i + 1 < code.length && code[i + 1] === "{") {
					i += 2
					let td = 1
					while (i < code.length && td > 0) {
						if (code[i] === "{") td++
						else if (code[i] === "}") td--
						if (td > 0) i++
					}
				}
				i++
			}
			continue
		}
		if (ch === "/" && i + 1 < code.length && code[i + 1] === "*") {
			i += 2
			while (i < code.length - 1 && !(code[i] === "*" && code[i + 1] === "/")) i++
			i++
			continue
		}
		if (ch === "/" && i + 1 < code.length && code[i + 1] === "/") {
			i += 2
			while (i < code.length && code[i] !== "\n") i++
			continue
		}
		if (ch === "(") depth++
		else if (ch === ")") {
			depth--
			if (depth === 0) return i
		}
	}
	return -1
}

/* ── Purge Console / Debugger Plugin ──────────────────────────────────── */

/**
 * Strip console.METHOD(...) calls and debugger statements via transform.
 * Replaces esbuild.pure/drop which Oxc (Vite 8+) does not fully support.
 */
export function stripConsoleAndDebugger(
	code: string,
	methods: string[],
	stripDebugger: boolean,
): string {
	let result = code

	/* Strip debugger statements + trailing whitespace */
	if (stripDebugger && /\bdebugger\b/.test(result)) {
		result = result.replace(/\bdebugger\s*;?[ \t]*\n?/g, "")
	}

	/* Strip console.METHOD(...) calls */
	for (const method of methods) {
		const token = `console.${method}(`
		let cursor = 0
		let output = ""

		while (cursor < result.length) {
			const idx = result.indexOf(token, cursor)
			if (idx === -1) {
				output += result.slice(cursor)
				break
			}

			/* Verify not part of a larger identifier (e.g. myconsole.log) */
			if (idx > 0 && /\w/.test(result[idx - 1] ?? "")) {
				output += result.slice(cursor, idx + token.length)
				cursor = idx + token.length
				continue
			}

			/* Find matching closing paren */
			const parenStart = idx + token.length - 1
			const parenEnd = findClosingParen(result, parenStart)
			if (parenEnd === -1) {
				output += result.slice(cursor, idx + token.length)
				cursor = idx + token.length
				continue
			}

			/* Determine if the call is in expression position (operand of ||, &&, ??, ternary, etc.).
			   If so, replace with `void 0` to preserve valid syntax. Otherwise delete entirely. */
			const before = result.slice(0, idx)
			const trimmed = before.trimEnd()
			const lastChar = trimmed[trimmed.length - 1] ?? ""
			const inExpression =
				lastChar === "|" ||
				lastChar === "&" ||
				lastChar === "?" ||
				lastChar === ":" ||
				lastChar === "," ||
				lastChar === "=" ||
				lastChar === "(" ||
				lastChar === "["

			output += result.slice(cursor, idx)

			if (inExpression) {
				output += "void 0"
			}

			/* Consume optional trailing semicolon and whitespace */
			let end = parenEnd + 1
			while (end < result.length && (result[end] === " " || result[end] === "\t")) end++
			if (!inExpression && end < result.length && result[end] === ";") end++
			while (end < result.length && (result[end] === " " || result[end] === "\t")) end++
			if (end < result.length && result[end] === "\n") end++

			cursor = end
		}

		result = output
	}

	return result
}

export function createPurgePlugin(resolved: ResolvedPurgeConfig): VitePurgePlugin {
	const methods = resolved.console ? [...resolved.console] : []
	const stripDebugger = resolved.debugger

	return {
		name: "flare:purge",
		transform(
			this: { environment?: { config?: { mode?: string } } },
			code: string,
			id: string,
		): { code: string; map: null } | null {
			if (this.environment?.config?.mode !== "production") return null
			if (!/\.[jt]sx?$/.test(id)) return null
			if (id.includes("/node_modules/")) return null

			const hasConsole = methods.some((m) => code.includes(`console.${m}(`))
			const hasDebugger = stripDebugger && /\bdebugger\b/.test(code)
			if (!hasConsole && !hasDebugger) return null

			const result = stripConsoleAndDebugger(code, methods, stripDebugger)
			return result !== code ? { code: result, map: null } : null
		},
	}
}

/* ── Purge Test IDs Plugin ────────────────────────────────────────────── */

export function createPurgeTestIdsPlugin(attrs: string[]): VitePurgePlugin {
	const pattern = buildTestIdPattern(attrs)

	return {
		name: "flare:purge-test-ids",
		transform(code: string, id: string) {
			if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return null
			if (!pattern.test(code)) return null
			pattern.lastIndex = 0
			const transformed = code.replace(pattern, "")
			return { code: transformed, map: null }
		},
	}
}

function buildTestIdPattern(attrs: string[]): RegExp {
	const escaped = attrs.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
	const attrGroup = escaped.join("|")
	/* Match: space(s) + attr="value" or attr={expression with balanced braces}
	   The expression part handles nested braces like {`item-${id}`} by matching
	   non-brace chars, or nested {…} groups one level deep. */
	return new RegExp(`\\s+(?:${attrGroup})(?:="[^"]*"|=\\{(?:[^{}]|\\{[^}]*\\})*\\})`, "g")
}
