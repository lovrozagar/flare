import { defined } from "../errors/index.ts"

// One stylesheet as ordered statements (bits/11). Rules keep their declarations as written and their nested rules
// as children. A grouping at-rule (`@media`, `@supports`, `@container`, `@layer`, ...) holds statements. Any other
// at-rule (`@font-face`, `@keyframes`, `@property`, ...) keeps its body as written. Comments are dropped. `@import`
// and `@charset` throw: the built stylesheet is one file, and its encoding is the server's.
export type Rule = { kind: "rule"; selector: string; declarations: string; children: Statement[] }

export type AtRule = { kind: "at"; name: string; prelude: string; body?: string; children?: Statement[] }

export type Statement = Rule | AtRule

const GROUPS = new Set(["media", "supports", "container", "layer", "scope", "starting-style", "document"])

// Why each refused at-rule throws. A Google Fonts `@import` is the common case, so its message says what to use.
const REFUSED = new Map([
	[
		"import",
		"css: @import is not supported in the app stylesheet; use createFont, or a <link> in the root layout head",
	],
	["charset", "css: @charset is not allowed in the built stylesheet"],
])

export function parseCss(css: string): Statement[] {
	return statements(stripComments(css))
}

export function printCss(list: readonly Statement[]): string {
	return list.map(print).join("")
}

function print(statement: Statement): string {
	if (statement.kind === "rule") {
		const parts = [statement.declarations, ...statement.children.map(print)].filter((part) => part !== "")
		return `${statement.selector}{${parts.join(";")}}`
	}
	const head = statement.prelude === "" ? `@${statement.name}` : `@${statement.name} ${statement.prelude}`
	if (statement.children !== undefined) return `${head}{${printCss(statement.children)}}`
	return statement.body === undefined ? `${head};` : `${head}{${statement.body}}`
}

function stripComments(css: string): string {
	let out = ""
	let at = 0
	while (at < css.length) {
		const char = css.charAt(at)
		if (char === "\\") {
			// A backslash escapes the next character anywhere in CSS, as Tailwind's `\{` does.
			out += css.slice(at, at + 2)
			at += 2
		} else if (char === '"' || char === "'") {
			const end = stringEnd(css, at)
			out += css.slice(at, end)
			at = end
		} else if (char === "/" && css.charAt(at + 1) === "*") {
			const end = css.indexOf("*/", at + 2)
			if (end === -1) throw new Error("css: unclosed comment")
			at = end + 2
		} else {
			out += char
			at += 1
		}
	}
	return out
}

// The index just past the string that opens at `start`. A backslash escapes the next character.
function stringEnd(text: string, start: number): number {
	const quote = text.charAt(start)
	for (let at = start + 1; at < text.length; at += 1) {
		if (text.charAt(at) === "\\") at += 1
		else if (text.charAt(at) === quote) return at + 1
	}
	throw new Error("css: unclosed string")
}

// The first of `stops` outside strings, parentheses, and escapes, or -1. Braces in `url(x{y})` and in `.a\{b` are
// not structure.
function scan(text: string, start: number, stops: string): number {
	let depth = 0
	for (let at = start; at < text.length; at += 1) {
		const char = text.charAt(at)
		if (char === "\\") at += 1
		else if (char === '"' || char === "'") at = stringEnd(text, at) - 1
		else if (char === "(") depth += 1
		else if (char === ")") depth -= 1
		else if (depth === 0 && stops.includes(char)) return at
	}
	return -1
}

// The brace that closes the one at `open`.
function closing(text: string, open: number): number {
	let braces = 0
	for (let at = open; ; at = scan(text, at + 1, "{}")) {
		if (at === -1) throw new Error("css: unclosed block")
		braces += text.charAt(at) === "{" ? 1 : -1
		if (braces === 0) return at
	}
}

function skipSpace(text: string, start: number): number {
	let at = start
	while (at < text.length && /\s/.test(text.charAt(at))) at += 1
	return at
}

// Top-level or grouping-rule statements: rules and at-rules. A declaration here is not CSS.
function statements(text: string): Statement[] {
	const out: Statement[] = []
	for (let at = skipSpace(text, 0); at < text.length; at = skipSpace(text, at)) {
		const stop = scan(text, at, "{;")
		if (stop === -1) throw new Error(`css: unclosed statement ${text.slice(at, at + 40)}`)
		const head = text.slice(at, stop).trim()
		if (text.charAt(stop) === ";") {
			out.push(atRule(head, undefined, false))
			at = stop + 1
			continue
		}
		const end = closing(text, stop)
		const inner = text.slice(stop + 1, end)
		out.push(head.startsWith("@") ? atRule(head, inner, false) : rule(head, inner))
		at = end + 1
	}
	return out
}

// An at-rule nested in a rule wraps declarations, so it keeps its body as written.
function atRule(head: string, inner: string | undefined, nested: boolean): AtRule {
	const match = /^@([\w-]+)\s*([\s\S]*)$/.exec(head)
	if (match === null) throw new Error(`css: a declaration outside a rule: ${head}`)
	const name = defined(match[1], "the at-rule name").toLowerCase()
	const prelude = defined(match[2], "the at-rule prelude").trim()
	const refused = REFUSED.get(name)
	if (refused !== undefined) throw new Error(refused)
	if (inner === undefined) return { kind: "at", name, prelude }
	if (GROUPS.has(name) && !nested) return { kind: "at", name, prelude, children: statements(inner) }
	return { kind: "at", name, prelude, body: inner.trim() }
}

// A rule's body: declarations up to `;`, and nested rules or at-rules up to their closing brace.
function rule(selector: string, inner: string): Rule {
	const declarations: string[] = []
	const children: Statement[] = []
	for (let at = skipSpace(inner, 0); at < inner.length; at = skipSpace(inner, at)) {
		const stop = scan(inner, at, "{;")
		if (stop === -1 || inner.charAt(stop) === ";") {
			const end = stop === -1 ? inner.length : stop
			declarations.push(inner.slice(at, end).trim())
			at = end + 1
			continue
		}
		const end = closing(inner, stop)
		const head = inner.slice(at, stop).trim()
		const body = inner.slice(stop + 1, end)
		children.push(head.startsWith("@") ? atRule(head, body, true) : rule(head, body))
		at = end + 1
	}
	return { kind: "rule", selector, declarations: declarations.filter((item) => item !== "").join(";"), children }
}
