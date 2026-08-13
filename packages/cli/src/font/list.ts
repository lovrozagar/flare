import type { FontEntry, ResolvedFont } from "./resolve"
import { readManifest } from "./tracking"

export interface InstalledFont {
	family: string
	slug: string
	subsets: string[]
}

/**
 * Lists fonts tracked in the manifest.
 */
export function listInstalledFonts(projectRoot: string): InstalledFont[] {
	const manifest = readManifest(projectRoot)
	return Object.entries(manifest.fonts)
		.map(([slug, entry]) => ({
			family: entry.family,
			slug,
			subsets: entry.subsets,
		}))
		.sort((a, b) => a.slug.localeCompare(b.slug))
}

/**
 * Lists available fonts from registry, optionally filtered by category.
 */
export function listAvailableFonts(registry: FontEntry[], category?: string): ResolvedFont[] {
	const lower = category?.toLowerCase()
	return registry
		.filter((entry) => !lower || entry[3].toLowerCase() === lower)
		.map((entry) => ({
			camelName: entry[2],
			category: entry[3],
			family: entry[0],
			slug: entry[1],
		}))
}
