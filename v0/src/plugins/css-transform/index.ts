/**
 * Vite Plugin: Styles Transform (styles() function support)
 *
 * Handles duplicate name detection and HMR for styles() function calls.
 * The styles() function from @flare/v0/styles registers CSS at runtime,
 * but we need build-time validation for:
 *
 * 1. Duplicate name detection - error if same name used in different files
 * 2. HMR support - track names per file, validate on change
 *
 * Detection marker: import { styles } from "@flare/v0/styles"
 */

import type { Plugin } from "vite"

interface LocationInfo {
	file: string
	line: number
	col: number
}

interface FileTracking {
	names: Set<string>
	locations: Map<string, LocationInfo>
}

/**
 * Extract styles() call names from source code
 * Uses regex-based extraction (fast, no AST needed)
 */
function extractStylesNames(code: string, file: string): FileTracking {
	const names = new Set<string>()
	const locations = new Map<string, LocationInfo>()

	/* Match styles("name", ...) or styles('name', ...) */
	const stylesCallRegex = /\bstyles\s*\(\s*["']([^"']+)["']/g

	/* Track line numbers */
	const lines = code.split("\n")
	let charOffset = 0
	const lineOffsets: number[] = []
	for (const line of lines) {
		lineOffsets.push(charOffset)
		charOffset += line.length + 1 /* +1 for newline */
	}

	function getLineCol(index: number): { line: number; col: number } {
		let line = 1
		for (let i = 0; i < lineOffsets.length; i++) {
			const offset = lineOffsets[i]
			if (offset !== undefined && offset <= index) {
				line = i + 1
			} else {
				break
			}
		}
		const col = index - (lineOffsets[line - 1] ?? 0) + 1
		return { col, line }
	}

	let match = stylesCallRegex.exec(code)
	while (match !== null) {
		const name = match[1]
		if (name) {
			const { line, col } = getLineCol(match.index)
			names.add(name)
			locations.set(name, { col, file, line })
		}
		match = stylesCallRegex.exec(code)
	}

	return { locations, names }
}

/**
 * Check if code imports styles from flare styles module
 */
function hasStylesImport(code: string): boolean {
	/* Match: import { styles } from "@flare/v0/styles" or similar */
	return /import\s*\{[^}]*\bstyles\b[^}]*\}\s*from\s*["']@repo\/flare(?:-v2)?\/styles["']/.test(
		code,
	)
}

/**
 * Check if file is TSX/JSX
 */
function isTsxOrJsx(id: string): boolean {
	const cleanId = id.split("?")[0]
	return cleanId?.endsWith(".tsx") || cleanId?.endsWith(".jsx") || false
}

/**
 * Format error message for duplicate names
 */
function formatDuplicateError(
	name: string,
	existing: LocationInfo,
	duplicate: LocationInfo,
): string {
	return (
		`[flare:styles-transform] Duplicate styles name "${name}"\n` +
		`  First defined: ${existing.file}:${existing.line}:${existing.col}\n` +
		`  Duplicate at:  ${duplicate.file}:${duplicate.line}:${duplicate.col}`
	)
}

export interface StylesTransformOptions {
	/** Throw error on duplicate names (default: true in production, false in dev) */
	strict?: boolean
}

/**
 * Vite plugin for styles() function support
 *
 * Validates that styles() names are unique across the codebase.
 * Provides fast HMR by tracking names per file.
 */
export function stylesTransform(options: StylesTransformOptions = {}): Plugin {
	/* Global name registry: name → location */
	const nameRegistry = new Map<string, LocationInfo>()

	/* Per-file tracking: file → names defined in that file */
	const fileTracking = new Map<string, FileTracking>()

	/* Determine strict mode */
	let strictMode = options.strict

	return {
		buildEnd() {
			/* Log summary in build mode */
			if (nameRegistry.size > 0) {
				console.log(`[flare:styles-transform] Validated ${nameRegistry.size} styles() names`)
			}
		},

		configResolved(config) {
			/* Default: strict in production, warn in dev */
			if (strictMode === undefined) {
				strictMode = config.command === "build"
			}
		},
		enforce: "pre",

		handleHotUpdate({ file, server: _server }) {
			/* Only care about TSX/JSX files */
			if (!isTsxOrJsx(file)) {
				return
			}

			/* The transform hook will handle validation on next request */
			/* Just log for visibility */
			const tracking = fileTracking.get(file)
			if (tracking && tracking.names.size > 0) {
				console.log(`[flare:styles-transform] Revalidating styles() names in ${file}`)
			}
		},
		name: "flare:styles-transform",

		transform(code, id) {
			/* Only process TSX/JSX files */
			if (!isTsxOrJsx(id)) {
				return null
			}

			/* Only process files that import styles from flare */
			if (!hasStylesImport(code)) {
				/* If file previously had styles() calls, clean up */
				const existing = fileTracking.get(id)
				if (existing) {
					for (const name of existing.names) {
						nameRegistry.delete(name)
					}
					fileTracking.delete(id)
				}
				return null
			}

			/* Extract styles() names from this file */
			const tracking = extractStylesNames(code, id)

			/* Get previous names from this file (for HMR) */
			const previousTracking = fileTracking.get(id)
			const previousNames = previousTracking?.names ?? new Set<string>()

			/* Remove old names from registry (names no longer in this file) */
			for (const oldName of previousNames) {
				if (!tracking.names.has(oldName)) {
					nameRegistry.delete(oldName)
				}
			}

			/* Check for duplicates and register new names */
			const errors: string[] = []

			for (const [name, location] of tracking.locations) {
				const existing = nameRegistry.get(name)

				/* Skip if this file already registered this name (same location) */
				if (existing && existing.file === id) {
					continue
				}

				/* Check for duplicate in different file */
				if (existing && existing.file !== id) {
					const errorMsg = formatDuplicateError(name, existing, location)
					if (strictMode) {
						errors.push(errorMsg)
					} else {
						console.warn(`\n${errorMsg}\n`)
					}
				} else {
					/* Register the name */
					nameRegistry.set(name, location)
				}
			}

			/* Update file tracking */
			fileTracking.set(id, tracking)

			/* In strict mode, throw on duplicates */
			if (errors.length > 0) {
				throw new Error(errors.join("\n\n"))
			}

			/* No code transformation needed - styles() works at runtime */
			return null
		},
	}
}

/**
 * Get all registered styles names (for debugging/testing)
 */
export function getStylesNameRegistry(): Map<string, LocationInfo> {
	/* This would need to be exposed differently in real usage */
	/* For now, just a placeholder for testing */
	return new Map()
}
