/**
 * Flare Theme - No-flash theme switching
 *
 * Uses inline script + localStorage for instant theme application.
 * CSS-based icon visibility for zero-flash toggle.
 */

/* ============================================================================
 * Types
 * ============================================================================ */

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export interface ThemeConfig {
	/** Attribute name on html element (default: "data-theme") */
	attribute?: string
	/** Default theme when no preference stored (default: "system") */
	defaultTheme?: Theme
	/** Disable CSS transitions during theme change (default: true) */
	disableTransitionOnChange?: boolean
	/** localStorage key (default: "flare.theme") */
	storageKey?: string
	/** Supported themes (default: ["light", "dark", "system"]) */
	themes?: readonly Theme[]
}

/* ============================================================================
 * Config State
 * ============================================================================ */

const config: {
	attribute: string
	defaultTheme: Theme
	disableTransitionOnChange: boolean
	storageKey: string
	themes: readonly Theme[]
} = {
	attribute: "data-theme",
	defaultTheme: "system",
	disableTransitionOnChange: true,
	storageKey: "flare.theme",
	themes: ["light", "dark", "system"],
}

let systemTheme: ResolvedTheme = "light"
let initialized = false

/* ============================================================================
 * Server: Generate inline script for <head>
 * ============================================================================ */

/**
 * Generate blocking inline script to prevent theme flash.
 * Include in <head> before any stylesheets.
 */
export function getThemeScript(opts?: ThemeConfig): string {
	const attr = opts?.attribute ?? config.attribute
	const defaultTheme = opts?.defaultTheme ?? config.defaultTheme
	const storageKey = opts?.storageKey ?? config.storageKey

	/*
	 * Minified inline script - runs before body renders
	 * 1. Read theme from localStorage
	 * 2. If "system", detect OS preference
	 * 3. Apply to <html data-theme> and colorScheme
	 */
	const script = `((k,d,a)=>{const e=document.documentElement;let t;try{t=localStorage.getItem(k)||d}catch{t=d}if(t==="system")t=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";e.setAttribute(a,t);e.style.colorScheme=t})("${storageKey}","${defaultTheme}","${attr}")`

	return script
}

/* ============================================================================
 * Client: Initialize
 * ============================================================================ */

/**
 * Initialize theme on client.
 * Call once during app initialization.
 */
export function initTheme(opts?: ThemeConfig): void {
	if (typeof window === "undefined") return
	if (initialized) return
	initialized = true

	/* Merge config */
	if (opts?.attribute) config.attribute = opts.attribute
	if (opts?.defaultTheme) config.defaultTheme = opts.defaultTheme
	if (opts?.disableTransitionOnChange !== undefined) {
		config.disableTransitionOnChange = opts.disableTransitionOnChange
	}
	if (opts?.storageKey) config.storageKey = opts.storageKey
	if (opts?.themes) config.themes = opts.themes

	/* Detect system preference */
	const mq = window.matchMedia("(prefers-color-scheme: dark)")
	systemTheme = mq.matches ? "dark" : "light"

	/* Listen for system preference changes */
	mq.addEventListener("change", (e) => {
		systemTheme = e.matches ? "dark" : "light"

		/* If using system theme, update */
		try {
			const stored = localStorage.getItem(config.storageKey)
			if (stored === "system" || !stored) {
				applyTheme(systemTheme, false)
			}
		} catch {
			/* ignore */
		}
	})
}

/* ============================================================================
 * Apply theme to DOM
 * ============================================================================ */

function disableTransitions(): () => void {
	const css = document.createElement("style")
	css.appendChild(document.createTextNode("*,*::before,*::after{transition:none!important}"))
	document.head.appendChild(css)

	return () => {
		/* Force reflow */
		;(() => window.getComputedStyle(document.body))()
		requestAnimationFrame(() => css.remove())
	}
}

function applyTheme(resolved: ResolvedTheme, withTransitionBlock = true): void {
	if (typeof document === "undefined") return

	const enable =
		withTransitionBlock && config.disableTransitionOnChange ? disableTransitions() : null

	document.documentElement.setAttribute(config.attribute, resolved)
	document.documentElement.style.colorScheme = resolved

	enable?.()
}

/* ============================================================================
 * Public API
 * ============================================================================ */

/**
 * Set theme preference
 */
export function setTheme(theme: Theme): void {
	if (!config.themes.includes(theme)) return

	const resolved = theme === "system" ? systemTheme : theme
	applyTheme(resolved)

	/* Persist to localStorage */
	try {
		localStorage.setItem(config.storageKey, theme)
	} catch {
		/* localStorage unavailable */
	}
}

/**
 * Get current resolved theme from DOM
 */
export function getResolvedTheme(): ResolvedTheme {
	if (typeof document === "undefined") return "light"
	const attr = document.documentElement.getAttribute(config.attribute)
	return attr === "dark" ? "dark" : "light"
}

/**
 * Get stored theme preference
 */
export function getTheme(): Theme {
	if (typeof localStorage === "undefined") return config.defaultTheme
	try {
		const stored = localStorage.getItem(config.storageKey)
		if (stored === "light" || stored === "dark" || stored === "system") {
			return stored
		}
	} catch {
		/* ignore */
	}
	return config.defaultTheme
}

/**
 * Toggle between light and dark
 */
export function toggleTheme(): void {
	const current = getResolvedTheme()
	setTheme(current === "light" ? "dark" : "light")
}

/**
 * Get theme config
 */
export function getThemeConfig(): Readonly<typeof config> {
	return config
}
