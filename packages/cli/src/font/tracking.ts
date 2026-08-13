import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export interface FontManifestEntry {
	family: string
	installedAt: string
	subsets: string[]
}

export interface FontManifest {
	fonts: Record<string, FontManifestEntry>
}

function manifestPath(projectRoot: string): string {
	return join(projectRoot, "public", "fonts", ".flare-fonts.json")
}

function fontsDir(projectRoot: string): string {
	return join(projectRoot, "public", "fonts")
}

export function readManifest(projectRoot: string): FontManifest {
	const path = manifestPath(projectRoot)
	if (!existsSync(path)) return { fonts: {} }

	try {
		const raw = readFileSync(path, "utf-8")
		const parsed = JSON.parse(raw) as FontManifest
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			typeof parsed.fonts === "object" &&
			parsed.fonts !== null
		) {
			return parsed
		}
		return { fonts: {} }
	} catch {
		return { fonts: {} }
	}
}

function writeManifest(projectRoot: string, manifest: FontManifest): void {
	const dir = fontsDir(projectRoot)
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}

	/* sort fonts by slug */
	const sorted: Record<string, FontManifestEntry> = {}
	for (const key of Object.keys(manifest.fonts).sort()) {
		const entry = manifest.fonts[key]
		if (entry) sorted[key] = entry
	}

	writeFileSync(manifestPath(projectRoot), `${JSON.stringify({ fonts: sorted }, null, "\t")}\n`)
}

export function addFont(
	projectRoot: string,
	slug: string,
	family: string,
	subsets: string[],
): void {
	const manifest = readManifest(projectRoot)
	manifest.fonts[slug] = {
		family,
		installedAt: new Date().toISOString(),
		subsets,
	}
	writeManifest(projectRoot, manifest)
}

export function removeFont(projectRoot: string, slug: string): void {
	const manifest = readManifest(projectRoot)
	if (!(slug in manifest.fonts)) return

	delete manifest.fonts[slug]
	writeManifest(projectRoot, manifest)
}
