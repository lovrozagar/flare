/**
 * Vite Plugin: Minify CSS Raw
 *
 * Minifies CSS files imported with ?raw query.
 * Uses load hook to intercept before Vite's ?raw handling.
 */

import { readFileSync } from "node:fs"
import type { Plugin } from "vite"

/**
 * Minify CSS string - removes comments, collapses whitespace
 */
function minifyCss(css: string): string {
	return css
		.replace(/\/\*[\s\S]*?\*\//g, "") /* Remove comments */
		.replace(/\s+/g, " ") /* Collapse whitespace */
		.replace(/\s*([{}:;,>+~])\s*/g, "$1") /* Remove space around special chars */
		.replace(/;}/g, "}") /* Remove trailing semicolons */
		.trim()
}

export function minifyCssRaw(): Plugin {
	return {
		enforce: "pre",
		load(id) {
			/* Only process .css files with ?raw query */
			if (!id.endsWith(".css?raw")) return null

			/* Read the actual CSS file (remove ?raw from path) */
			const filePath = id.replace("?raw", "")
			const css = readFileSync(filePath, "utf-8")

			/* Minify and return as default export */
			const minified = minifyCss(css)
			return `export default ${JSON.stringify(minified)}`
		},
		name: "flare:minify-css-raw",
	}
}
