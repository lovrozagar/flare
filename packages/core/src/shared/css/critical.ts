import { defined } from "../errors/defined.ts"
import { matchesSelector, nestedSelector, selectorKeys } from "./match.ts"
import { parseCss, printCss, type AtRule, type Rule, type Statement } from "./parse.ts"
import { shellTree, type ShellElement } from "./shell.ts"

// The attributes the theme and direction scripts set before paint (bit 13). A rule that needs one is kept though the
// shell HTML does not carry it yet.
export type CriticalContext = { themeAttribute?: string | undefined; directionAttribute?: string | undefined }

// A rule with its selector resolved against its parents.
type Entry = { rule: Rule; selector: string }

// `kept` is the critical CSS each shell structure got, the latest KEPT structures (plan 21 15.1).
type Sheet = { statements: Statement[]; byKey: Map<string, Entry[]>; unkeyed: Entry[]; kept: Map<string, string> }

const KEPT = 64

// per-process-constant: the parsed and indexed built stylesheet, by its text
const sheets = new Map<string, Sheet>()

// The properties whose values name a `@keyframes` or a `@font-face`. A custom property may carry either, as
// Tailwind's `--animate-spin` and `--font-sans` do.
const NAMING = new Set(["animation", "animation-name", "font", "font-family"])

// The rules of the built stylesheet that match the shell, in source order (B15). Conditional wraps that keep a rule,
// and the `@keyframes` and `@font-face` a kept rule names, stay. Every other at-rule, such as a bare `@layer` or
// `@property`, stays too. Only the rules the shell's classes, ids, and tags can reach, and unkeyed ones, are tested.
export function criticalCss(html: string, css: string, ctx: CriticalContext = {}): string {
	if (css === "") return ""
	const sheet = sheetOf(css)
	const tree = shellTree(html)
	// The direction script sets `dir` beside its own attribute.
	const direction = ctx.directionAttribute === undefined ? [] : ["dir", ctx.directionAttribute]
	const present = [...(ctx.themeAttribute === undefined ? [] : [ctx.themeAttribute]), ...direction]
	// A selector reads an element's tag, attributes, parent, and previous sibling, never text, so a shell of a structure
	// already seen, the same page with other data, keeps what that one kept, and the matching does not run again.
	const key = `${present.join(" ")}\n${structureOf(tree)}`
	const known = sheet.kept.get(key)
	if (known !== undefined) {
		sheet.kept.delete(key)
		sheet.kept.set(key, known)
		return known
	}
	const critical = matchedCss(sheet, tree, present)
	sheet.kept.set(key, critical)
	if (sheet.kept.size > KEPT) sheet.kept.delete(defined(sheet.kept.keys().next().value, "the oldest kept shell"))
	return critical
}

function matchedCss(sheet: Sheet, tree: readonly ShellElement[], present: readonly string[]): string {
	const candidates = new Set([...sheet.unkeyed, ...shellKeys(tree).flatMap((key) => sheet.byKey.get(key) ?? [])])
	const matched = new Set<Rule>()
	for (const entry of candidates) if (matchesSelector(entry.selector, tree, { present })) matched.add(entry.rule)
	const kept = keep(sheet.statements, { matched, values: namingValues(matched) })
	// A `</style` in a string would end the inline style element. `\/` is the same character to CSS.
	return printCss(kept).replaceAll(/<\/style/gi, "<\\/style")
}

function sheetOf(css: string): Sheet {
	const known = sheets.get(css)
	if (known !== undefined) return known
	const statements = parseCss(css)
	const sheet: Sheet = { statements, byKey: new Map(), unkeyed: [], kept: new Map() }
	index(statements, { sheet, parent: undefined })
	sheets.set(css, sheet)
	return sheet
}

function index(list: readonly Statement[], at: { sheet: Sheet; parent: string | undefined }): void {
	for (const statement of list) {
		if (statement.kind === "at") {
			if (statement.children !== undefined) index(statement.children, at)
			continue
		}
		const selector = at.parent === undefined ? statement.selector : nestedSelector(at.parent, statement.selector)
		const entry = { rule: statement, selector }
		const keys = selectorKeys(selector)
		if (keys === undefined) at.sheet.unkeyed.push(entry)
		for (const key of keys ?? []) at.sheet.byKey.set(key, [...(at.sheet.byKey.get(key) ?? []), entry])
		index(statement.children, { ...at, parent: selector })
	}
}

// Each element's tag, attributes in order, parent, and previous sibling, by their places in the tree.
function structureOf(tree: readonly ShellElement[]): string {
	const at = new Map(tree.map((element, index) => [element, index]))
	return tree
		.map((element) => {
			const attributes = [...element.attributes].map(([name, value]) => `${name}=${JSON.stringify(value)}`).join(" ")
			const parent = element.parent === undefined ? -1 : at.get(element.parent)
			const previous = element.previous === undefined ? -1 : at.get(element.previous)
			return `${element.tag} ${parent} ${previous} ${attributes}`
		})
		.join("\n")
}

function shellKeys(tree: readonly ShellElement[]): string[] {
	const keys = new Set<string>()
	for (const element of tree) {
		keys.add(element.tag)
		for (const name of element.classes) keys.add(`.${name}`)
		const id = element.attributes.get("id")
		if (id !== undefined) keys.add(`#${id}`)
	}
	return [...keys]
}

type Keeping = { matched: ReadonlySet<Rule>; values: readonly string[] }

// A rule stays with its declarations when it matched, and without them when only a nested rule did. An at-rule nested
// in a rule wraps that rule's declarations, so it stays with them.
function keep(list: readonly Statement[], at: Keeping): Statement[] {
	return list.flatMap((statement): Statement[] => {
		if (statement.kind === "rule") {
			const own = at.matched.has(statement)
			const children = statement.children.flatMap((child) =>
				child.kind === "at" ? (own ? [child] : []) : keep([child], at),
			)
			if (!own && children.length === 0) return []
			return [{ ...statement, declarations: own ? statement.declarations : "", children }]
		}
		if (statement.children !== undefined) {
			const children = keep(statement.children, at)
			return children.length === 0 ? [] : [{ ...statement, children }]
		}
		return keepAtRule(statement, at.values) ? [statement] : []
	})
}

function keepAtRule(statement: AtRule, values: readonly string[]): boolean {
	if (statement.body === undefined) return true
	if (statement.name === "keyframes") {
		const name = unquoted(statement.prelude)
		return values.some((value) => value.split(/[\s,"']+/).includes(name))
	}
	if (statement.name === "font-face") {
		return declarationsOf(statement.body).some(
			([property, value]) => property === "font-family" && usesFamily(values, unquoted(value)),
		)
	}
	return true
}

// The lowercased values of the kept rules' naming declarations.
function namingValues(matched: ReadonlySet<Rule>): string[] {
	return [...matched].flatMap((rule) =>
		declarationsOf(rule.declarations)
			.filter(([property]) => NAMING.has(property) || property.startsWith("--"))
			.map(([, value]) => value.toLowerCase()),
	)
}

function declarationsOf(body: string): Array<[property: string, value: string]> {
	return body.split(";").map((declaration) => {
		const colon = declaration.indexOf(":")
		return [declaration.slice(0, colon).trim().toLowerCase(), declaration.slice(colon + 1).trim()]
	})
}

// A family in a font stack, quoted or not. A `font` shorthand's first item carries the style, weight, and size before
// the family, and a minifier may drop the space before a quoted family, as in `16px/1.5"Bea Sans"`.
function usesFamily(values: readonly string[], family: string): boolean {
	return values.some((value) =>
		value
			.replaceAll(/["']/g, " ")
			.split(",")
			.some((item) => item.trim() === family || item.trim().endsWith(` ${family}`)),
	)
}

function unquoted(text: string): string {
	return text.replaceAll(/["']/g, " ").trim().toLowerCase()
}
