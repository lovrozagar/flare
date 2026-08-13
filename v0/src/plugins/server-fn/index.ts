/**
 * Vite Plugin: Flare Server Functions
 *
 * Scans for createServerFn() calls and injects unique IDs.
 * Generates build-time secret for request signing.
 */

import { createHash, randomBytes } from "node:crypto"
import MagicString from "magic-string"
import type { Plugin } from "vite"

export interface FlareServerFnPluginOptions {
	/** File patterns to include (default: all .ts/.tsx) */
	include?: RegExp
	/** File patterns to exclude */
	exclude?: RegExp
	/** Signature validation window in seconds (default: 60) */
	signatureWindowSeconds?: number
}

interface ServerFnEntry {
	exportName: string
	file: string
	id: string
}

const VIRTUAL_SECRET_ID = "virtual:flare-server-fn-secret"
const RESOLVED_SECRET_ID = `\0${VIRTUAL_SECRET_ID}`

/**
 * Generate a short hash from file path
 */
function hashFile(filePath: string): string {
	return createHash("md5").update(filePath).digest("hex").slice(0, 8)
}

export function flareServerFn(options: FlareServerFnPluginOptions = {}): Plugin {
	const { exclude, include = /\.(ts|tsx)$/, signatureWindowSeconds = 60 } = options

	const registry = new Map<string, ServerFnEntry>()

	/* Generate unique secret per build */
	const buildSecret = randomBytes(32).toString("hex")

	return {
		config() {
			/* Make secret and window available via define for both client and server */
			return {
				define: {
					__FLARE_SERVER_FN_SECRET__: JSON.stringify(buildSecret),
					__FLARE_SERVER_FN_WINDOW__: signatureWindowSeconds,
				},
			}
		},
		enforce: "pre",

		load(id) {
			if (id === RESOLVED_SECRET_ID) {
				return `export const SERVER_FN_SECRET = "${buildSecret}";
export const SERVER_FN_WINDOW = ${signatureWindowSeconds};`
			}
			return null
		},
		name: "flare:server-fn",

		resolveId(id) {
			if (id === VIRTUAL_SECRET_ID) return RESOLVED_SECRET_ID
			return null
		},

		transform(code, id) {
			/* Skip non-matching files */
			if (!include.test(id)) return null
			if (exclude?.test(id)) return null
			if (!code.includes("createServerFn")) return null

			const magicString = new MagicString(code)
			let hasTransforms = false

			/* Match: createServerFn({ method: "...", name: "..." }) */
			const fnPattern = /createServerFn\s*\(\s*(\{[^}]*\})\s*\)/g

			for (let match = fnPattern.exec(code); match !== null; match = fnPattern.exec(code)) {
				const optionsStr = match[1]
				if (!optionsStr) continue

				/* Extract name from options */
				const nameMatch = /name\s*:\s*["'](\w+)["']/.exec(optionsStr)
				if (!nameMatch) continue

				const fnName = nameMatch[1]
				if (!fnName) continue

				const fileHash = hashFile(id)
				const fnId = `${fileHash}/${fnName}`

				/* Register function */
				registry.set(fnId, {
					exportName: fnName,
					file: id,
					id: fnId,
				})

				/* Inject __id into options */
				const callStart = match.index + match[0].indexOf("{") + 1
				magicString.appendLeft(callStart, ` __id: "${fnId}",`)

				hasTransforms = true
			}

			if (!hasTransforms) return null

			return {
				code: magicString.toString(),
				map: magicString.generateMap({ hires: true }),
			}
		},
	}
}
