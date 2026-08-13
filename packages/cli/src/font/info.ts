import { getSubsetsForFont, getUrlsForFont } from "./download"
import type { FontEntry } from "./resolve"
import { resolveFont } from "./resolve"
import { readManifest } from "./tracking"

export interface FontInfo {
	availableSubsets: string[]
	camelName: string
	category: string
	family: string
	importSnippet: string
	installed: boolean
	installedSubsets: string[]
	slug: string
	totalFiles: number
}

export function getFontInfo(
	name: string,
	registry: FontEntry[],
	urlMap: Record<string, string>,
	projectRoot: string,
): FontInfo | null {
	const resolved = resolveFont(name, registry)
	if (!resolved) return null

	const allUrls = getUrlsForFont(resolved.slug, urlMap)
	const availableSubsets = getSubsetsForFont(resolved.slug, urlMap)

	const manifest = readManifest(projectRoot)
	const entry = manifest.fonts[resolved.slug]
	const installed = entry !== undefined

	return {
		availableSubsets,
		camelName: resolved.camelName,
		category: resolved.category,
		family: resolved.family,
		importSnippet: `import { ${resolved.camelName} } from "flare/fonts/${resolved.slug}"`,
		installed,
		installedSubsets: entry?.subsets ?? [],
		slug: resolved.slug,
		totalFiles: allUrls.length,
	}
}
