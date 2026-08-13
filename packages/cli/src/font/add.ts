import { join } from "node:path"
import type { DownloadResult } from "./download"
import { downloadFonts, getSubsetsForFont, getUrlsForFont } from "./download"
import type { FontEntry, ResolvedFont } from "./resolve"
import { resolveFonts } from "./resolve"
import { addFont } from "./tracking"

export interface FontAddResult {
	added: ResolvedFont[]
	downloadResult: DownloadResult
	unresolved: string[]
}

export interface FontAddOptions {
	fetch?: typeof globalThis.fetch
	force?: boolean
	names: string[]
	onProgress?: (completed: number, total: number) => void
	projectRoot: string
	registry: FontEntry[]
	subsets?: string[]
	urlMap: Record<string, string>
}

/**
 * Non-interactive font add: resolve names, download, track.
 */
export async function fontAddNonInteractive(options: FontAddOptions): Promise<FontAddResult> {
	const {
		fetch: fetchFn,
		force = false,
		names,
		onProgress,
		projectRoot,
		registry,
		subsets,
		urlMap,
	} = options

	const { resolved, unresolved } = resolveFonts(names, registry)

	if (resolved.length === 0) {
		return {
			added: [],
			downloadResult: { downloaded: 0, failed: 0, failedPaths: [], skipped: 0 },
			unresolved,
		}
	}

	/* collect all download entries across resolved fonts */
	const allEntries: Array<[string, string]> = []
	const fontSubsets = new Map<string, string[]>()

	for (const font of resolved) {
		const entries = getUrlsForFont(font.slug, urlMap, subsets)
		allEntries.push(...entries)

		/* track which subsets were actually downloaded, sorted for consistency */
		const downloadedSubsets = (subsets ?? getSubsetsForFont(font.slug, urlMap)).slice().sort()
		fontSubsets.set(font.slug, downloadedSubsets)
	}

	const outDir = join(projectRoot, "public")
	const downloadResult = await downloadFonts({
		entries: allEntries,
		fetch: fetchFn,
		force,
		onProgress,
		outDir,
	})

	/* update manifest */
	for (const font of resolved) {
		const subs = fontSubsets.get(font.slug) ?? []
		addFont(projectRoot, font.slug, font.family, subs)
	}

	return { added: resolved, downloadResult, unresolved }
}

/**
 * Generates import snippet strings for added fonts.
 */
export function formatImportSnippets(fonts: ResolvedFont[]): string[] {
	return fonts.map((f) => `import { ${f.camelName} } from "flare/fonts/${f.slug}"`)
}
