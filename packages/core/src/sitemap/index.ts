import type { RouteDefinition } from "../generators/index.ts"

/* ── Types ────────────────────────────────────────────────────────────── */

export type ChangeFreq = "always" | "daily" | "hourly" | "monthly" | "never" | "weekly" | "yearly"

export interface SitemapEntry {
	changefreq?: ChangeFreq
	lastmod?: string
	loc: string
	priority?: number
}

export interface SitemapConfig {
	additionalEntries?: SitemapEntry[]
	changefreq?: ChangeFreq | Record<string, ChangeFreq>
	exclude?: string[]
	origin: string
	priority?: number | Record<string, number>
}

export interface SitemapResult {
	files: Array<{ content: string; path: string }>
	urls: string[]
}

/* ── Glob matching ────────────────────────────────────────────────────── */

function globToRegex(pattern: string): RegExp {
	let result = "^"
	let i = 0
	while (i < pattern.length) {
		if (pattern[i] === "*" && pattern[i + 1] === "*") {
			result += ".*"
			i += 2
			if (pattern[i] === "/") i++
		} else if (pattern[i] === "*") {
			result += "[^/]*"
			i++
		} else if (".+?^${}()|[]\\".includes(pattern[i] ?? "")) {
			result += `\\${pattern[i]}`
			i++
		} else {
			result += pattern[i]
			i++
		}
	}
	result += "$"
	return new RegExp(result)
}

/* ── URL computation (mirrors generators/index.ts computeUrlPattern) ── */

function computeUrlPattern(virtualPath: string): string {
	const parts = virtualPath.split("/")
	const rootIdx = parts.findIndex((p) => p.startsWith("_") && p.endsWith("_") && p.length >= 3)
	const urlParts: string[] = []

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i] ?? ""
		if (rootIdx >= 0 && i <= rootIdx) continue
		if (part.startsWith("(") && part.endsWith(")")) continue
		if (part === "") continue
		urlParts.push(part)
	}

	if (urlParts.length === 0) return "/"
	return `/${urlParts.join("/")}`
}

/* ── Dynamic param detection ──────────────────────────────────────────── */

const DYNAMIC_PARAM_RE = /\[.*\]/

function hasDynamicParams(virtualPath: string): boolean {
	return DYNAMIC_PARAM_RE.test(virtualPath)
}

/* ── Route filtering ──────────────────────────────────────────────────── */

export function filterSitemapRoutes(
	defs: RouteDefinition[],
	exclude?: string[],
): RouteDefinition[] {
	const excludePatterns = exclude?.map(globToRegex) ?? []

	return defs.filter((def) => {
		if (def.type !== "page") return false
		if (def.responseRoute) return false
		if (def.authenticateMode === true) return false
		if (hasDynamicParams(def.virtualPath)) return false

		const url = computeUrlPattern(def.virtualPath)
		for (const pattern of excludePatterns) {
			if (pattern.test(url)) return false
		}

		return true
	})
}

/* ── Entry building ───────────────────────────────────────────────────── */

function resolveOverride<T>(url: string, value: T | Record<string, T> | undefined): T | undefined {
	if (value === undefined) return undefined
	if (typeof value !== "object" || value === null) return value as T

	const overrides = value as Record<string, T>
	let bestMatch: { key: string; value: T } | undefined

	for (const [pattern, val] of Object.entries(overrides)) {
		const re = globToRegex(pattern)
		if (re.test(url)) {
			if (!bestMatch || pattern.length > bestMatch.key.length) {
				bestMatch = { key: pattern, value: val }
			}
		}
	}

	return bestMatch?.value
}

export function buildSitemapEntries(
	defs: RouteDefinition[],
	config: SitemapConfig,
): SitemapEntry[] {
	const entries: SitemapEntry[] = []
	const origin = config.origin.replace(/\/+$/, "")

	for (const def of defs) {
		const url = computeUrlPattern(def.virtualPath)
		const entry: SitemapEntry = { loc: `${origin}${url}` }

		const freq = resolveOverride(url, config.changefreq)
		if (freq) entry.changefreq = freq

		const prio = resolveOverride(url, config.priority)
		if (prio !== undefined) entry.priority = prio

		entries.push(entry)
	}

	if (config.additionalEntries) {
		entries.push(...config.additionalEntries)
	}

	return entries
}

/* ── XML generation ───────────────────────────────────────────────────── */

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

export function generateSitemapXml(entries: SitemapEntry[]): string {
	const lines = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
	]

	for (const entry of entries) {
		lines.push("  <url>")
		lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`)
		if (entry.lastmod) lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`)
		if (entry.changefreq) lines.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`)
		if (entry.priority !== undefined) lines.push(`    <priority>${entry.priority}</priority>`)
		lines.push("  </url>")
	}

	lines.push("</urlset>")
	return lines.join("\n")
}

export function generateSitemapIndexXml(origin: string, count: number): string {
	const lines = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
	]

	for (let i = 0; i < count; i++) {
		lines.push("  <sitemap>")
		lines.push(`    <loc>${escapeXml(origin)}/sitemap-${i}.xml</loc>`)
		lines.push("  </sitemap>")
	}

	lines.push("</sitemapindex>")
	return lines.join("\n")
}

/* ── Full pipeline ────────────────────────────────────────────────────── */

const MAX_SITEMAP_ENTRIES = 50_000

export function generateSitemap(config: SitemapConfig, entries: SitemapEntry[]): SitemapResult {
	const urls = entries.map((e) => e.loc)

	if (entries.length <= MAX_SITEMAP_ENTRIES) {
		return {
			files: [{ content: generateSitemapXml(entries), path: "sitemap.xml" }],
			urls,
		}
	}

	const files: Array<{ content: string; path: string }> = []
	const partCount = Math.ceil(entries.length / MAX_SITEMAP_ENTRIES)

	for (let i = 0; i < partCount; i++) {
		const start = i * MAX_SITEMAP_ENTRIES
		const chunk = entries.slice(start, start + MAX_SITEMAP_ENTRIES)
		files.push({ content: generateSitemapXml(chunk), path: `sitemap-${i}.xml` })
	}

	files.push({ content: generateSitemapIndexXml(config.origin, partCount), path: "sitemap.xml" })

	return { files, urls }
}

/* ── robots.txt ───────────────────────────────────────────────────────── */

export function generateRobotsTxt(sitemapUrl: string, rules?: string): string {
	const base = rules ?? "User-agent: *\nAllow: /"
	return `${base}\n\nSitemap: ${sitemapUrl}\n`
}

/* ── Convenience: filter + build + generate ───────────────────────────── */

export function buildSitemapFromDefs(
	defs: RouteDefinition[],
	config: SitemapConfig,
): SitemapResult {
	const filtered = filterSitemapRoutes(defs, config.exclude)
	const entries = buildSitemapEntries(filtered, config)
	return generateSitemap(config, entries)
}
