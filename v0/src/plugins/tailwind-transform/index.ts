/**
 * Vite Plugin: Tailwind Transform
 *
 * Transforms tw="..." to css="..." + class="..." at build time using Tailwind CSS v4.
 * Zero runtime cost - all resolution happens during compilation.
 *
 * Static:  tw="p-4 bg-red-500" → css="padding:1rem;background-color:..."
 * Marker:  tw="group inline-flex" → class="group" css="display:inline-flex"
 * Dynamic: tw={a ? "x" : "y"} → css={({"x":"...","y":"..."})[a ? "x" : "y"] ?? ""}
 * Merge:   tw="p-4" css="color:red" → css="padding:1rem;color:red"
 *
 * Supports Tailwind v4 CSS-first configuration via @theme directive.
 */

import { readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { compile } from "tailwindcss"
import type { Plugin } from "vite"

export interface TailwindTransformOptions {
	/** Path to CSS file containing @import "tailwindcss" and @theme config */
	css?: string
	/** Error on unresolvable dynamic expressions @default false */
	strict?: boolean
}

/** Cache resolved classes to avoid repeated Tailwind calls. Values are JSON-serialized `{ markers, css }`. */
const resolveCache = new Map<string, string>()

/** Tailwind compiler instance */
let compiler: Awaited<ReturnType<typeof compile>> | null = null

/** CSS file path for HMR (absolute) */
let cssPath: string | null = null

/** Vite root directory */
let viteRoot: string = process.cwd()

/** Set of files that use tw= for HMR invalidation */
const twFiles = new Set<string>()

/**
 * Initialize Tailwind compiler with CSS config
 */
async function getCompiler(
	options: TailwindTransformOptions,
): Promise<NonNullable<typeof compiler>> {
	if (!compiler) {
		let cssContent = '@import "tailwindcss";'
		let basePath = viteRoot

		if (options.css) {
			/* Resolve relative paths against Vite root */
			const resolvedPath = isAbsolute(options.css) ? options.css : resolve(viteRoot, options.css)
			try {
				cssContent = readFileSync(resolvedPath, "utf-8")
				cssPath = resolvedPath
				basePath = dirname(resolvedPath)
			} catch {
				console.warn(`[tailwind] Could not read CSS file: ${resolvedPath}, using defaults`)
			}
		}

		compiler = await compile(cssContent, {
			loadStylesheet: (id, base) => {
				/* Resolve the import path */
				let resolvedId: string
				if (id === "tailwindcss" || id.startsWith("tailwindcss/")) {
					/* Handle tailwindcss imports - try multiple resolution strategies */
					/* Bare "tailwindcss" resolves to package's style field: index.css */
					const cssPath = id === "tailwindcss" ? "tailwindcss/index.css" : id
					const possiblePaths = [
						/* Try import.meta.resolve style lookup */
						resolve(viteRoot, "node_modules", cssPath),
						/* Try from base path */
						resolve(basePath, "node_modules", cssPath),
						/* Walk up to find node_modules (monorepo support) */
						resolve(viteRoot, "..", "node_modules", cssPath),
						resolve(viteRoot, "..", "..", "node_modules", cssPath),
						resolve(viteRoot, "..", "..", "..", "node_modules", cssPath),
						resolve(viteRoot, "..", "..", "..", "..", "node_modules", cssPath),
						resolve(viteRoot, "..", "..", "..", "..", "..", "node_modules", cssPath),
						resolve(viteRoot, "..", "..", "..", "..", "..", "..", "node_modules", cssPath),
					]

					resolvedId = ""
					for (const p of possiblePaths) {
						try {
							readFileSync(p, "utf-8")
							resolvedId = p
							break
						} catch {
							/* Try next path */
						}
					}

					if (!resolvedId) {
						/* Last resort: require.resolve */
						try {
							resolvedId = require.resolve(id, { paths: [basePath, viteRoot] })
						} catch {
							const firstPath = possiblePaths[0]
							resolvedId = firstPath ?? resolve(viteRoot, "node_modules", cssPath)
						}
					}
				} else if (id.startsWith(".") || id.startsWith("/")) {
					resolvedId = resolve(base, id)
				} else {
					resolvedId = resolve(basePath, id)
				}

				try {
					const content = readFileSync(resolvedId, "utf-8")
					return { base: dirname(resolvedId), content, path: resolvedId }
				} catch {
					console.warn(`[tailwind] Could not load stylesheet: ${id} (resolved: ${resolvedId})`)
					return { base: basePath, content: "", path: resolvedId }
				}
			},
		})
	}
	return compiler
}

/**
 * Invalidate compiler cache (called on CSS file change)
 */
function invalidateCompiler(): void {
	compiler = null
	resolveCache.clear()
}

/** Tokens Tailwind expresses as literal class selectors (not declarations). */
const MARKER_TOKEN = /^(?:group|peer)(?:\/[\w-]+)?$/

/**
 * Split tw tokens into marker classes (must land on DOM as `class=`) vs
 * compilable utilities (go through Tailwind → scoped CSS).
 *
 * Returns { markers: ["group", "peer/foo"], utilities: "hover:bg-red p-4" }
 */
export function splitTokens(classes: string): { markers: string[]; utilities: string } {
	const markers: string[] = []
	const utilities: string[] = []
	for (const tok of classes.split(/\s+/).filter(Boolean)) {
		if (MARKER_TOKEN.test(tok)) markers.push(tok)
		else utilities.push(tok)
	}
	return { markers, utilities: utilities.join(" ") }
}

/**
 * Parse Tailwind v4 compiled output into scoped CSS.
 *
 * Walks each top-level `.cls { ... }` rule (skipping `:root`, `:host`, `@keyframes`,
 * `@property`, etc.), keeps the rule body verbatim including nested `&`-rules,
 * and concatenates all bodies into a single CSS fragment.
 *
 * The fragment is then consumable by `scopeCSSWithName` in styles/registry.ts,
 * which handles `&` nesting, `@media`, etc.
 *
 * Intentionally does NOT resolve var(--*) refs — they flow through to the DOM
 * so theme.css HMR works.
 *
 * Called recursively for @layer utilities { ... } blocks.
 * @layer theme / base / components are skipped.
 * @media / @supports / @container inside a utility body are preserved verbatim.
 */
export function parseTailwindOutput(css: string): string {
	const bodies: string[] = []
	let i = 0
	while (i < css.length) {
		/* Skip whitespace */
		while (i < css.length && /\s/.test(css[i] ?? "")) i++
		if (i >= css.length) break

		if (css[i] === "@") {
			/* Find where the at-rule keyword ends (before whitespace or block) */
			let kEnd = i + 1
			while (kEnd < css.length && css[kEnd] !== "{" && css[kEnd] !== ";" && !/\s/.test(css[kEnd] ?? "")) kEnd++
			const keyword = css.slice(i, kEnd)

			/* @layer utilities — recurse into its block content */
			if (keyword === "@layer") {
				/* Read the layer name(s) that follow */
				let nameStart = kEnd
				while (nameStart < css.length && /\s/.test(css[nameStart] ?? "")) nameStart++
				let nameEnd = nameStart
				while (nameEnd < css.length && css[nameEnd] !== "{" && css[nameEnd] !== ";") nameEnd++
				const names = css.slice(nameStart, nameEnd).trim()

				if (css[nameEnd] === ";") {
					/* @layer decl-only: @layer theme, base, components, utilities; — skip */
					i = nameEnd + 1
					continue
				}

				/* Block form: @layer utilities { ... } */
				const blockStart = nameEnd + 1
				const blockEnd = findClosingBraceParser(css, blockStart)
				if (blockEnd === -1) break

				if (names === "utilities" || names === "components") {
					/* Recurse: extract utility class bodies from this block */
					const inner = parseTailwindOutput(css.slice(blockStart, blockEnd))
					if (inner) bodies.push(inner)
				}
				/* theme / base / anything else → skip */
				i = blockEnd + 1
				continue
			}

			/* @media / @supports / @container at top level — recurse to find .cls rules inside.
			 * This handles synthetic/partial CSS inputs and ensures real Tailwind output
			 * where responsive rules may appear at top level in some compiler modes. */
			if (keyword === "@media" || keyword === "@supports" || keyword === "@container") {
				const atEnd = findAtRuleEnd(css, i)
				const atRule = css.slice(i, atEnd)
				/* Preserve verbatim — the @media wrapper itself is the scoped body we want */
				bodies.push(atRule)
				i = atEnd
				continue
			}

			/* Any other @-rule at this level (e.g. @charset, @import, @keyframes) — skip */
			const atEnd = findAtRuleEnd(css, i)
			i = atEnd
			continue
		}

		/* Skip :root, :host, ::*, or any selector not starting with . */
		if (css[i] !== ".") {
			i = skipRule(css, i)
			continue
		}

		/* Read class selector up to `{` or `,` */
		const selStart = i
		while (i < css.length && css[i] !== "{" && css[i] !== ",") i++
		if (css[i] !== "{") {
			/* Comma-separated selector list — skip entire rule */
			i = skipRule(css, selStart)
			continue
		}

		/* Found `.cls {` — read brace-balanced body verbatim (preserves &:hover, @media, etc.) */
		const bodyStart = i + 1
		const bodyEnd = findClosingBraceParser(css, bodyStart)
		if (bodyEnd === -1) break

		const body = css.slice(bodyStart, bodyEnd).trim()
		if (body) bodies.push(body)
		i = bodyEnd + 1
	}

	return bodies.join(";")
}

/** Find matching `}` for `{` at position `start` (after the opening brace). Returns index of `}` or -1. */
function findClosingBraceParser(css: string, start: number): number {
	let depth = 1
	let inString: string | null = null
	for (let i = start; i < css.length; i++) {
		const ch = css[i] ?? ""
		const prev = i > 0 ? css[i - 1] : ""
		if ((ch === '"' || ch === "'") && prev !== "\\") {
			if (inString === ch) inString = null
			else if (!inString) inString = ch
			continue
		}
		if (inString) continue
		if (ch === "{") depth++
		else if (ch === "}") {
			depth--
			if (depth === 0) return i
		}
	}
	return -1
}

/** Skip an entire rule (selector + body). Returns index after closing `}`. */
function skipRule(css: string, start: number): number {
	let i = start
	while (i < css.length && css[i] !== "{") i++
	if (i >= css.length) return css.length
	const close = findClosingBraceParser(css, i + 1)
	return close === -1 ? css.length : close + 1
}

/** Find end of `@rule` — either end of its brace block, or `;` if no block. */
function findAtRuleEnd(css: string, start: number): number {
	let i = start
	while (i < css.length && css[i] !== "{" && css[i] !== ";") i++
	if (i >= css.length) return css.length
	if (css[i] === ";") return i + 1
	const close = findClosingBraceParser(css, i + 1)
	return close === -1 ? css.length : close + 1
}

/**
 * Resolve Tailwind classes to { markers, css }.
 * markers: tokens that must land as literal class= on the DOM element.
 * css: scoped CSS fragment ready for registerCSS / scopeCSSWithName.
 */
async function resolveClasses(
	classes: string,
	options: TailwindTransformOptions,
): Promise<{ markers: string[]; css: string }> {
	const cached = resolveCache.get(classes)
	if (cached !== undefined) return JSON.parse(cached) as { markers: string[]; css: string }

	const { markers, utilities } = splitTokens(classes)

	let css = ""
	if (utilities) {
		const tw = await getCompiler(options)
		const built = tw.build(utilities.split(/\s+/))
		css = parseTailwindOutput(built)
	}

	const result = { css, markers }
	resolveCache.set(classes, JSON.stringify(result))
	return result
}

/**
 * Extract string literals from a JavaScript expression
 * Handles: ternaries, logical operators, simple strings
 *
 * @example
 * extractStringLiterals('active ? "bg-blue" : "bg-gray"') → ["bg-blue", "bg-gray"]
 * extractStringLiterals('`text-${size}`') → [] (unresolvable)
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
 * Async string replace helper
 */
async function replaceAsync(
	str: string,
	regex: RegExp,
	asyncFn: (match: string, ...args: string[]) => Promise<string>,
): Promise<string> {
	const promises: Promise<string>[] = []
	const matches: { start: number; end: number; index: number }[] = []

	let index = 0

	/* Reset regex state */
	regex.lastIndex = 0

	let match = regex.exec(str)
	while (match !== null) {
		matches.push({
			end: match.index + match[0].length,
			index,
			start: match.index,
		})
		promises.push(asyncFn(match[0], ...match.slice(1)))
		index++
		match = regex.exec(str)
	}

	const replacements = await Promise.all(promises)

	/* Build result string */
	let result = ""
	let lastEnd = 0

	for (let i = 0; i < matches.length; i++) {
		const m = matches[i]
		const r = replacements[i]
		if (m && r !== undefined) {
			result += str.slice(lastEnd, m.start)
			result += r
			lastEnd = m.end
		}
	}

	result += str.slice(lastEnd)

	return result
}

/**
 * Check if a string contains tw= attribute or tw: property
 */
function hasTwAttribute(code: string): boolean {
	return /\btw\s*=/.test(code) || /\btw\s*:/.test(code)
}

/**
 * Transform tw attributes to css attributes
 */
export async function transformTw(
	code: string,
	id: string,
	options: TailwindTransformOptions,
): Promise<string> {
	/* Skip if no tw= found */
	if (!hasTwAttribute(code)) {
		return code
	}

	let result = code

	/* Handle tw="..." (static strings) → css="..." + class="..." for markers */
	result = await replaceAsync(result, /\btw="([^"]+)"/g, async (_, classes) => {
		const { markers, css } = await resolveClasses(classes, options)
		const cssAttr = css ? `css="${css}"` : ""
		const classAttr = markers.length ? `class="${markers.join(" ")}"` : ""
		return [cssAttr, classAttr].filter(Boolean).join(" ")
	})

	/* Handle tw='...' (single-quoted static strings) → css="..." + class="..." for markers */
	result = await replaceAsync(result, /\btw='([^']+)'/g, async (_, classes) => {
		const { markers, css } = await resolveClasses(classes, options)
		const cssAttr = css ? `css="${css}"` : ""
		const classAttr = markers.length ? `class="${markers.join(" ")}"` : ""
		return [cssAttr, classAttr].filter(Boolean).join(" ")
	})

	/* Handle tw={...} (dynamic expressions) */
	result = await replaceAsync(result, /\btw=\{([^}]+)\}/g, async (_, expr) => {
		const possibleClasses = extractStringLiterals(expr)

		if (possibleClasses.length === 0) {
			/* Unresolvable dynamic expression */
			if (options.strict) {
				throw new Error(
					`[tailwind] Cannot resolve dynamic expression in ${id}: tw={${expr}}\nUse css= for truly dynamic styles.`,
				)
			}
			console.warn(`[tailwind] Cannot resolve dynamic expression in ${id}: tw={${expr}}`)
			return `css=""`
		}

		/* Build inline map; union markers across all branches */
		const allMarkers = new Set<string>()
		const map: Record<string, string> = {}
		for (const cls of possibleClasses) {
			const { markers, css } = await resolveClasses(cls, options)
			for (const m of markers) allMarkers.add(m)
			map[cls] = css
		}

		const classAttr = allMarkers.size ? `class="${[...allMarkers].join(" ")}"` : ""
		return `css={(${JSON.stringify(map)})[${expr}] ?? ""} ${classAttr}`.trim()
	})

	/* Handle elements with both tw= and css= */
	/* tw="p-4" css="color:red" → css="padding:1rem;color:red" */
	result = mergeTwAndCss(result)

	/* Merge adjacent class= attrs produced when user also wrote class="..." */
	result = mergeClassAttributes(result)

	/* Handle tw: "...", tw: '...', tw: `...` inside styles() calls.
	 * Markers can't be hoisted to class= here — warn and drop them. */
	const resolveStylesProperty = async (_: string, classes: string): Promise<string> => {
		const { markers, css } = await resolveClasses(classes, options)
		if (markers.length) {
			console.warn(
				`[tailwind] styles({ tw: "${classes}" }) contains marker tokens (${markers.join(", ")}) — these only work on JSX elements via tw=. Use class="${markers.join(" ")}" on the element instead.`,
			)
		}
		return `tw: "${css}"`
	}
	result = await replaceAsync(result, /\btw\s*:\s*"([^"]+)"/g, resolveStylesProperty)
	result = await replaceAsync(result, /\btw\s*:\s*'([^']+)'/g, resolveStylesProperty)
	result = await replaceAsync(result, /\btw\s*:\s*`([^`]+)`/g, resolveStylesProperty)

	return result
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

/**
 * Merge adjacent class= attributes on same element.
 * Handles: class="a" class="b" → class="a b"
 * Produced when user wrote class="custom" and tw="group ..." on same element.
 */
export function mergeClassAttributes(code: string): string {
	const PLACEHOLDER = "__FLARE_CLASS_PLACEHOLDER__"
	const PLACEHOLDER_RE = new RegExp(PLACEHOLDER, "g")
	/* Within each element opening tag, collect all class="..." attrs and merge into one.
	 * Handles adjacent and non-adjacent cases (e.g. class="a" css="..." class="b"). */
	return code.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
		const values: string[] = []
		/* Collect all class attr values, replace each with a placeholder */
		const tagged = tag.replace(/\bclass="([^"]*)"/g, (_, v) => {
			values.push((v as string).trim())
			return PLACEHOLDER
		})
		if (values.length <= 1) {
			/* No merge needed — restore the single placeholder */
			return tagged.replace(PLACEHOLDER_RE, `class="${values[0] ?? ""}"`)
		}
		/* Merge all values into the first placeholder, remove the rest */
		const merged = values.filter(Boolean).join(" ")
		let first = true
		const result = tagged.replace(PLACEHOLDER_RE, () => {
			if (first) {
				first = false
				return `class="${merged}"`
			}
			return ""
		})
		/* Collapse double-spaces and trim stray space immediately before tag close (> or />) */
		return result.replace(/\s{2,}/g, " ").replace(/\s+(\/?>)/g, "$1")
	})
}

/**
 * Vite plugin for tw= to css= transformation using Tailwind CSS v4
 */
export function tailwindTransform(options: TailwindTransformOptions = {}): Plugin {
	return {
		configResolved(config) {
			viteRoot = config.root
		},
		configureServer(devServer) {
			/* Watch CSS file for HMR */
			if (cssPath) {
				devServer.watcher.add(cssPath)
			}
		},
		enforce: "pre",
		handleHotUpdate({ file, server: s }) {
			/* If CSS config file changed, invalidate compiler and all tw files */
			/* Use resolve() on both sides to survive symlinked monorepos and relative-path drift */
			if (cssPath && resolve(file) === cssPath) {
				invalidateCompiler()

				/* Invalidate all modules that use tw= */
				const modulesToReload = []
				for (const twFile of twFiles) {
					const mod = s.moduleGraph.getModuleById(twFile)
					if (mod) {
						s.moduleGraph.invalidateModule(mod)
						modulesToReload.push(mod)
					}
				}

				if (modulesToReload.length > 0) {
					console.log(`[tailwind] CSS config changed, reloading ${modulesToReload.length} files`)
					return modulesToReload
				}
			}
			return undefined
		},
		async load(id) {
			/* Only process .tsx files */
			if (!id.endsWith(".tsx")) {
				return null
			}

			/* Read original file */
			let code: string
			try {
				code = readFileSync(id, "utf-8")
			} catch {
				return null
			}

			/* Skip if no tw= attributes */
			if (!hasTwAttribute(code)) {
				return null
			}

			/* Track file for HMR */
			twFiles.add(id)

			/* Transform tw= to css= */
			const transformed = await transformTw(code, id, options)

			return transformed
		},
		name: "flare:tailwind-transform",
	}
}

/**
 * Clear the resolve cache (useful for testing)
 */
export function clearTailwindCache(): void {
	resolveCache.clear()
	invalidateCompiler()
}
