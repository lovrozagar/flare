/**
 * Flare Styles - Type-safe scoped styles with state and variables
 *
 * @example
 * // Simple - just CSS
 * styles("box", `padding: 1rem; background: blue`)
 *
 * // With Tailwind (tw is transformed to CSS at build time)
 * styles("card", {
 *   tw: "flex gap-4 p-4 hover:bg-gray-100",
 * })
 *
 * // With Tailwind + custom CSS (css can override tw)
 * styles("card", {
 *   tw: "flex gap-4",
 *   css: "color: red; border: 1px solid black",
 * })
 *
 * // With state
 * styles("button", {
 *   state: { active: isActive },
 *   css: (s) => `
 *     background: gray;
 *     ${s.active(true)} { background: blue }
 *   `
 * })
 *
 * // With Tailwind, state and dynamic variables
 * styles("item", {
 *   tw: "flex gap-4",
 *   state: { active: isActive, size: "md" },
 *   vars: { highlight: highlightColor },
 *   css: (s, v) => `
 *     ${s.active(true)} { background: ${v.highlight} }
 *     ${s.size("lg")} { padding: 2rem }
 *   `
 * })
 *
 * // With outerCss from parent (takes priority on conflicts)
 * function Card(props: { outerCss?: string }) {
 *   return <div {...styles("card", {
 *     tw: "p-4 rounded",
 *     outerCss: props.outerCss
 *   })} />
 * }
 *
 * // With style prop (merges with vars)
 * styles("box", {
 *   vars: { bg: "blue" },
 *   style: { opacity: 0.5 },
 *   css: (_, v) => `background: ${v.bg}`
 * })
 */

import type { JSX } from "solid-js"

import { registerCSSByName } from "./registry"

/* Simple hash for generating unique names */
function hashString(str: string): string {
	let h = 0
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) - h + str.charCodeAt(i)) | 0
	}
	return (h >>> 0).toString(36)
}

/* Types */

type StateSelectors<S> = {
	[K in keyof S]: (value: S[K]) => string
}

type VarAccessors<V> = {
	[K in keyof V]: string
}

interface StylesResult {
	"data-c": string
	style?: JSX.CSSProperties
	[key: `data-${string}`]: string
}

interface StylesConfigFull<S extends Record<string, unknown>, V extends Record<string, unknown>> {
	state?: S
	vars?: V
	/**
	 * Tailwind classes - transformed to raw CSS at build time by tailwind-transform plugin.
	 * Prepended before css (so css can override tw styles).
	 *
	 * @example
	 * styles("box", { tw: "flex gap-4 p-4", css: "color: red" })
	 * // After build: tw becomes "display:flex;gap:1rem;padding:1rem"
	 * // Runtime combines: "display:flex;gap:1rem;padding:1rem;color:red"
	 */
	tw?: string
	/** CSS styles - string or function that receives state selectors and var accessors */
	css?: ((s: StateSelectors<S>, v: VarAccessors<V>) => string) | string
	/** External CSS string from parent - appended after inner styles (takes priority on conflicts) */
	outerCss?: string
	/** Additional inline styles - merged with CSS variable styles from vars */
	style?: JSX.CSSProperties
}

type StylesConfig<S extends Record<string, unknown>, V extends Record<string, unknown>> =
	| StylesConfigFull<S, V>
	| string

/* Implementation */

function createStateSelectors<S extends Record<string, unknown>>(_state: S): StateSelectors<S> {
	return new Proxy({} as StateSelectors<S>, {
		get: (_, key: string) => (value: unknown) => `&[data-${key}="${value}"]`,
	})
}

function createVarAccessors<V extends Record<string, unknown>>(
	_vars: V,
	varMap: Map<string, number>,
): VarAccessors<V> {
	return new Proxy({} as VarAccessors<V>, {
		get: (_, key: string) => {
			if (!varMap.has(key)) {
				varMap.set(key, varMap.size)
			}
			return `var(--_${varMap.get(key)})`
		},
	})
}

/**
 * Create scoped styles with optional state and variables
 *
 * Returns attributes to spread on element:
 * - data-c: component name for CSS selector
 * - data-*: state attributes
 * - style: CSS variables for dynamic values + any additional style props
 *
 * CSS is registered in the style registry (not returned on element)
 */
export function styles<
	S extends Record<string, unknown> = {},
	V extends Record<string, unknown> = {},
>(name: string, config: StylesConfig<S, V>): StylesResult {
	/* DEV-mode validation (never breaks, only warns) */
	if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
		if (!name || typeof name !== "string") {
			console.warn("[flare:styles] Name should be a non-empty string")
		}
	}

	/* Simple string case */
	if (typeof config === "string") {
		registerCSSByName(name, config)
		return { "data-c": name }
	}

	/* Config object case */
	const fullConfig = config as StylesConfigFull<S, V>
	const state = fullConfig.state ?? ({} as S)
	const vars = fullConfig.vars ?? ({} as V)

	/* DEV-mode state validation */
	if (typeof process !== "undefined" && process.env?.NODE_ENV === "development" && state) {
		for (const [key, value] of Object.entries(state)) {
			if (value !== null && typeof value === "object") {
				console.warn(`[flare:styles] State "${key}" should be primitive, got object`)
			}
		}
	}

	/* Calculate effective name (when outerCss is provided, generate unique name with hash) */
	const effectiveName = fullConfig.outerCss ? `${name}-${hashString(fullConfig.outerCss)}` : name

	/* Build result with effective name and state attributes */
	const result: StylesResult = { "data-c": effectiveName }

	/* Add state as data-* attributes */
	for (const [key, value] of Object.entries(state)) {
		const dataKey = `data-${key}` as `data-${string}`
		result[dataKey] = String(value)
	}

	/* Get inner CSS */
	let innerCSS = ""
	const varMap = new Map<string, number>()

	/* tw is already raw CSS from build-time transform - prepend it */
	if (fullConfig.tw) {
		innerCSS += fullConfig.tw
		/* Ensure semicolon separator before css */
		if (!innerCSS.endsWith(";")) {
			innerCSS += ";"
		}
	}

	/* Append css (can override tw styles) */
	if (fullConfig.css) {
		if (typeof fullConfig.css === "string") {
			innerCSS += fullConfig.css
		} else {
			/* Create typed accessors */
			const s = createStateSelectors(state)
			const v = createVarAccessors(vars, varMap)

			/* Generate CSS via callback */
			innerCSS += fullConfig.css(s, v)
		}
	}

	/* Combine inner + outer CSS (outer comes after, so it wins on conflicts) */
	const combinedCSS = fullConfig.outerCss ? `${innerCSS}\n${fullConfig.outerCss}` : innerCSS

	/* Register the combined CSS with effective name */
	registerCSSByName(effectiveName, combinedCSS)

	/* Build style object: CSS vars from varMap + additional style props */
	const styleObj: Record<string, unknown> = {}

	/* Add CSS variables from vars */
	for (const [key, index] of varMap) {
		if (key in vars) {
			styleObj[`--_${index}`] = vars[key]
		}
	}

	/* Merge with additional style props (style props take priority) */
	if (fullConfig.style) {
		Object.assign(styleObj, fullConfig.style)
	}

	/* Only set style if we have properties */
	if (Object.keys(styleObj).length > 0) {
		result.style = styleObj as JSX.CSSProperties
	}

	return result
}

export type { StylesResult, StylesConfig, StylesConfigFull, StateSelectors, VarAccessors }

/* Re-export registerCSS for the css= prop transform (used by css-scope plugin) */
export { registerCSS } from "./registry"
