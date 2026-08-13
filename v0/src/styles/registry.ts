/**
 * Flare Scoped Styles - Internal Registry
 *
 * Internal functions for CSS registration and scoping.
 * Not part of public API.
 */

/* Style registry key and style tag ID */
const REGISTRY_KEY = "__FLARE_STYLES__"
export const STYLE_TAG_ID = "__FLARE_SCOPED__"

/* Check if running in browser */
const isBrowser = typeof document !== "undefined"

/* Get the global style registry (ensures single instance across chunks) */
function getRegistry(): Map<string, string> {
	const g = globalThis as Record<string, unknown>
	if (!g[REGISTRY_KEY]) {
		g[REGISTRY_KEY] = new Map<string, string>()
	}
	return g[REGISTRY_KEY] as Map<string, string>
}

/* Simple hash function for CSS strings (djb2 variant) */
function hash(str: string): string {
	let h = 0
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) - h + str.charCodeAt(i)) | 0
	}
	return (h >>> 0).toString(36)
}

/* Minify CSS declarations */
function minify(css: string): string {
	return css
		.replace(/\s*\n\s*/g, "") /* Remove newlines */
		.replace(/\s*:\s*/g, ":") /* Remove space around colons */
		.replace(/\s*;\s*/g, ";") /* Remove space around semicolons */
		.replace(/;+/g, ";") /* Collapse multiple semicolons */
		.replace(/^;|;$/g, "") /* Remove leading/trailing semicolons */
}

/* Track if we've synced with SSR styles */
let hydratedFromSSR = false

/* Get or create the scoped style tag in the DOM */
function getStyleTag(): HTMLStyleElement | null {
	if (!isBrowser) return null

	let styleTag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null
	if (!styleTag) {
		styleTag = document.createElement("style")
		styleTag.id = STYLE_TAG_ID
		document.head.appendChild(styleTag)
	}
	return styleTag
}

/* Sync registry with existing SSR styles on first client access */
function hydrateFromSSR(): void {
	if (hydratedFromSSR || !isBrowser) return
	hydratedFromSSR = true

	const styleTag = document.getElementById(STYLE_TAG_ID)
	if (!styleTag) return

	/* Parse existing rules from SSR: [data-c="xyz"]{...} */
	const content = styleTag.textContent ?? ""
	const regex = /\[data-c="([^"]+)"\]\{([^}]+)\}/g
	const registry = getRegistry()

	let match = regex.exec(content)
	while (match !== null) {
		const id = match[1]
		const rule = match[0]
		if (id && rule) {
			registry.set(id, rule)
		}
		match = regex.exec(content)
	}
}

/* Inject CSS rule into the DOM style tag */
function injectCSS(rule: string): void {
	const styleTag = getStyleTag()
	if (styleTag) {
		styleTag.textContent += rule
	}
}

/**
 * Register CSS and return the scoped ID
 *
 * On SSR: Adds rule to registry for collection
 * On client: Also injects CSS into DOM for lazy-loaded components
 *
 * When the CSS contains nested rules (`&`, `@media`, etc.) it routes through
 * `scopeCSSWithName_toString` which handles `&` → `[data-c="id"]` expansion.
 * Plain declaration-only CSS is wrapped directly without parsing overhead.
 */
export function registerCSS(css: string): string {
	/* Skip empty CSS - return empty string to signal "no scoping needed" */
	if (!css || css.trim() === "") {
		return ""
	}

	/* Sync with SSR styles on first call in browser */
	if (isBrowser && !hydratedFromSSR) {
		hydrateFromSSR()
	}

	const minified = minify(css)
	const id = hash(minified)
	const registry = getRegistry()

	if (!registry.has(id)) {
		/* If CSS contains nested rules (`&`, `@media`, etc.), route through scopeCSSWithName_toString
		 * which properly scopes `&` → `[data-c="id"]` and flattens `@media` wrappers. */
		const needsNesting = /[&@]/.test(minified)
		const rule = needsNesting
			? scopeCSSWithName_toString(id, css)
			: `[data-c="${id}"]{${minified}}`
		registry.set(id, rule)

		/* Inject into DOM for client-side lazy loads */
		if (isBrowser) {
			injectCSS(rule)
		}
	}

	return id
}

/**
 * Register CSS with explicit name (for styles() function)
 *
 * Scopes CSS with [data-c="name"] selector and registers it.
 * Used by the styles() function to register component styles.
 *
 * @param name - Component name (becomes data-c value)
 * @param css - Raw CSS (can include &, nesting, @rules)
 */
export function registerCSSByName(name: string, css: string): void {
	if (!css?.trim()) return

	/* Sync with SSR styles on first call in browser */
	if (isBrowser && !hydratedFromSSR) {
		hydrateFromSSR()
	}

	const registry = getRegistry()

	/* Skip if already registered (same name = same CSS) */
	if (registry.has(name)) return

	/* Scope the CSS with the component name */
	const scopedCSS = scopeCSSWithName_toString(name, css)
	registry.set(name, scopedCSS)

	/* Inject into DOM for client-side renders */
	if (isBrowser) {
		injectCSS(scopedCSS)
	}
}

/**
 * Pure transform: scope CSS with [data-c="name"] selector.
 * Handles &, nesting, @rules. Returns scoped rule string without registering.
 */
function scopeCSSWithName_toString(name: string, css: string): string {
	const selector = `[data-c="${name}"]`

	/* Parse CSS into segments */
	const segments = parseCSSSegments(css)

	if (segments.length === 0) {
		const min = minify(css)
		return min ? `${selector}{${min}}` : ""
	}

	return processSegments(segments, selector)
}

interface CSSSegment {
	type: "declarations" | "rule" | "atrule"
	selector?: string
	atRule?: string
	content: string
}

function findClosingBrace(css: string, start: number): number {
	let depth = 1
	let inString: string | null = null
	let i = start

	while (i < css.length && depth > 0) {
		const char = css[i] ?? ""
		const prev = i > 0 ? css[i - 1] : ""

		if ((char === '"' || char === "'") && prev !== "\\") {
			if (inString === char) inString = null
			else if (!inString) inString = char
		}

		if (!inString) {
			if (char === "{") depth++
			if (char === "}") depth--
		}
		i++
	}

	return i - 1
}

function parseCSSSegments(css: string): CSSSegment[] {
	const segments: CSSSegment[] = []
	let i = 0
	let buffer = ""

	while (i < css.length) {
		const char = css[i] ?? ""

		if (/\s/.test(char) && !buffer.trim()) {
			i++
			continue
		}

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
				const scoped = (seg.selector ?? "").replace(/&/g, selector)
				const nested = parseCSSSegments(seg.content)

				if (nested.length === 1 && nested[0]?.type === "declarations") {
					const min = minify(seg.content)
					if (min) output.push(`${scoped}{${min}}`)
				} else {
					output.push(processSegments(nested, scoped))
				}
				break
			}

			case "atrule": {
				const atRule = seg.atRule ?? ""

				if (atRule.startsWith("@keyframes") || atRule.startsWith("@-webkit-keyframes")) {
					output.push(`${atRule}{${seg.content}}`)
					break
				}

				const nested = parseCSSSegments(seg.content)
				const inner = processSegments(nested, selector)
				if (inner) output.push(`${atRule}{${inner}}`)
				break
			}
		}
	}

	return output.join("")
}

/**
 * Get all collected scoped CSS rules as a single string
 * Used during SSR to inject into <style id="__FLARE_SCOPED__">
 */
export function getScopedStyles(): string {
	return [...getRegistry().values()].join("")
}

/**
 * Clear the style registry
 * Call before each SSR render to ensure clean state
 */
export function clearScopedStyles(): void {
	getRegistry().clear()
}

/**
 * Reset client-side hydration state
 * Useful for testing
 */
export function resetHydrationState(): void {
	hydratedFromSSR = false
}
