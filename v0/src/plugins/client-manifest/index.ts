/**
 * Vite Plugin: Client Manifest
 *
 * Provides virtual module "virtual:client-manifest" that exports:
 * - default: the hashed client entry path (prod) or source path (dev)
 * - devEntry: the source entry path for dev mode
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { Plugin, ResolvedConfig } from "vite"

const VIRTUAL_ID = "virtual:client-manifest"
const RESOLVED_ID = `\0${VIRTUAL_ID}`

interface ManifestEntry {
	file: string
	name?: string
	src?: string
	isEntry?: boolean
	isDynamicEntry?: boolean
	imports?: string[]
	dynamicImports?: string[]
}

type Manifest = Record<string, ManifestEntry>

export interface ClientManifestOptions {
	/** Client entry path relative to root @default "src/client.ts" */
	clientEntryPath?: string
}

export function clientManifest(options: ClientManifestOptions = {}): Plugin {
	let config: ResolvedConfig
	const clientEntry = options.clientEntryPath ?? "src/client.ts"

	return {
		configResolved(resolvedConfig) {
			config = resolvedConfig
		},

		load(id) {
			if (id !== RESOLVED_ID) return null

			const assetsDir = join(config.root, "dist/client/assets")
			const manifestPath = join(config.root, "dist/client/.vite/manifest.json")

			/* Dev entry path - normalize to start with / */
			let devEntryPath: string
			if (clientEntry.startsWith("./")) devEntryPath = `/${clientEntry.slice(2)}`
			else if (clientEntry.startsWith("/")) devEntryPath = clientEntry
			else devEntryPath = `/${clientEntry}`

			let clientEntryPath = "/assets/client.js"

			/* Read Vite manifest for accurate chunk mapping */
			if (existsSync(manifestPath)) {
				try {
					const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))

					/* Find client entry */
					for (const [src, entry] of Object.entries(manifest)) {
						if (entry.isEntry && src.includes("client")) {
							clientEntryPath = `/${entry.file}`
							break
						}
					}
				} catch {
					/* Fallback to directory scan */
				}
			}

			/* Fallback: scan assets directory if manifest unavailable */
			if (clientEntryPath === "/assets/client.js" && existsSync(assetsDir)) {
				try {
					const files = readdirSync(assetsDir)
					const clientFile = files.find((f) => f.startsWith("client-") && f.endsWith(".js"))
					if (clientFile) {
						clientEntryPath = `/assets/${clientFile}`
					}
				} catch {
					/* Fallback */
				}
			}

			return `export default "${clientEntryPath}"
export const devEntry = "${devEntryPath}"`
		},
		name: "flare:client-manifest",

		resolveId(id) {
			if (id === VIRTUAL_ID) return RESOLVED_ID
			return null
		},
	}
}
