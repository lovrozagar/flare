/**
 * Flare Direction (LTR/RTL)
 *
 * No-flash direction switching with localStorage persistence.
 * Follows same pattern as theme.ts.
 */

import { createSignal } from "solid-js"

/* ============================================================================
 * Types
 * ============================================================================ */

export type Direction = "ltr" | "rtl"

export interface DirectionConfig {
	/** Attribute name on html element (default: "data-dir") */
	attribute?: string
	/** Default direction when no preference (default: "ltr") */
	defaultDir?: Direction
	/** localStorage key (default: "flare.dir") */
	storageKey?: string
	/** RTL locale codes (default: ["ar", "he", "fa", "ur"]) */
	rtlLocales?: readonly string[]
}

/* ============================================================================
 * Config State
 * ============================================================================ */

const RTL_LOCALES = ["ar", "he", "fa", "ur"]

const config: {
	attribute: string
	defaultDir: Direction
	rtlLocales: readonly string[]
	storageKey: string
} = {
	attribute: "data-dir",
	defaultDir: "ltr",
	rtlLocales: RTL_LOCALES,
	storageKey: "flare.dir",
}

/* Reactive signal for direction */
const [directionSignal, setDirectionSignal] = createSignal<Direction>("ltr")

let initialized = false

/* ============================================================================
 * Utilities
 * ============================================================================ */

/**
 * Get direction from locale string
 * Returns "rtl" for Arabic, Hebrew, Persian, Urdu
 */
export function getDirFromLocale(locale: string | undefined): Direction {
	if (!locale) return "ltr"
	const base = locale.split("-")[0]?.toLowerCase() ?? ""
	return config.rtlLocales.includes(base) ? "rtl" : "ltr"
}

/* ============================================================================
 * Server: Generate inline script for <head>
 * ============================================================================ */

/**
 * Generate blocking inline script to prevent direction flash.
 * Include in <head> before any stylesheets.
 */
export function getDirectionScript(opts?: DirectionConfig): string {
	const attr = opts?.attribute ?? config.attribute
	const defaultDir = opts?.defaultDir ?? config.defaultDir
	const storageKey = opts?.storageKey ?? config.storageKey

	/*
	 * Minified inline script - runs before body renders
	 * 1. Read direction from localStorage
	 * 2. If none, use server-rendered dir attribute
	 * 3. Apply to <html dir> and data-dir
	 */
	const script = `((k,d,a)=>{const e=document.documentElement;let t;try{t=localStorage.getItem(k)}catch{}if(!t)t=e.getAttribute("dir")||d;e.setAttribute(a,t);e.setAttribute("dir",t)})("${storageKey}","${defaultDir}","${attr}")`

	return script
}

/* ============================================================================
 * Client: Initialize
 * ============================================================================ */

/**
 * Initialize direction on client.
 * Call once during app initialization.
 */
export function initDirection(opts?: DirectionConfig): void {
	if (typeof window === "undefined") return
	if (initialized) return
	initialized = true

	/* Merge config */
	if (opts?.attribute) config.attribute = opts.attribute
	if (opts?.defaultDir) config.defaultDir = opts.defaultDir
	if (opts?.storageKey) config.storageKey = opts.storageKey
	if (opts?.rtlLocales) config.rtlLocales = opts.rtlLocales

	/* Sync signal from DOM */
	const current = document.documentElement.getAttribute("dir")
	setDirectionSignal(current === "rtl" ? "rtl" : "ltr")
}

/* ============================================================================
 * Public API
 * ============================================================================ */

/**
 * Set direction preference (updates signal, DOM, and localStorage)
 */
export function setDirection(dir: Direction): void {
	/* Update signal */
	setDirectionSignal(dir)

	if (typeof document === "undefined") return

	document.documentElement.setAttribute(config.attribute, dir)
	document.documentElement.setAttribute("dir", dir)

	/* Persist to localStorage */
	try {
		localStorage.setItem(config.storageKey, dir)
	} catch {
		/* localStorage unavailable */
	}
}

/**
 * Get current direction (reactive signal)
 * Use in components: direction changes will trigger re-render
 */
export function getDirection(): Direction {
	return directionSignal()
}

/**
 * Toggle between LTR and RTL
 */
export function toggleDirection(): void {
	setDirection(directionSignal() === "ltr" ? "rtl" : "ltr")
}

/**
 * Get direction config
 */
export function getDirectionConfig(): Readonly<typeof config> {
	return config
}
