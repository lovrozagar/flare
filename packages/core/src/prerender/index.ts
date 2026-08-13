/**
 * Pre-render engine — runs at build time to generate static HTML + NDJSON
 * artifacts for routes configured with `static: true` or ISR.
 *
 * For each route:
 *   1. Create synthetic GET request
 *   2. Call handler.fetch() → collect HTML response
 *   3. Call handler.fetch() with x-d:1 header → collect NDJSON response
 *   4. Replace CSP nonce with __FLARE_NONCE__ placeholder
 *   5. Store entry with headers, html, ndjson
 *   6. Generate manifest entry
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ExtractedStaticDeferMode, RouteDefinition } from "../generators/index.ts"
import type { StaticDeferMode } from "../route-builder/types.ts"
import type { ServerHandler } from "../server-handler/index.ts"
import { resolvePathParams } from "../url/index.ts"

export const NONCE_PLACEHOLDER = "__FLARE_NONCE__"

export interface PrerenderRoute {
	defer?: StaticDeferMode
	dynamicParams?: boolean
	mode: "isr" | "static"
	pathname: string
	revalidate?: number
	tags?: string[]
}

export interface PrerenderConfig {
	concurrency?: number
	env?: Record<string, unknown> | (() => Record<string, unknown> | Promise<Record<string, unknown>>)
	exclude?: string[]
	handler: ServerHandler
	origin: string
	routes: PrerenderRoute[]
}

export interface PrerenderManifestEntry {
	defer?: StaticDeferMode
	dynamicParams?: boolean
	headers: Record<string, string>
	html: string
	mode: "isr" | "static"
	ndjson: string
	pathname: string
	revalidate?: number
	tags?: string[]
}

export interface PrerenderResult {
	entries: PrerenderManifestEntry[]
	errors: Array<{ message: string; pathname: string }>
}

/**
 * Extract the nonce value from an HTML string by looking for
 * `nonce="..."` attributes or `nonce-xxx` in CSP-style content.
 */
export function extractNonce(html: string): string | undefined {
	/* Try nonce attribute first: nonce="value" — supports hex and base64 */
	const attrMatch = /\bnonce="([a-zA-Z0-9+/_-]+=*)"/.exec(html)
	if (attrMatch) return attrMatch[1]

	/* Fallback: nonce-value in CSP content — supports hex and base64 */
	const cspMatch = /nonce-([a-zA-Z0-9+/_-]+=*)/.exec(html)
	return cspMatch?.[1]
}

/**
 * Replace all occurrences of a nonce value in a string with the placeholder.
 */
export function replaceNonce(text: string, nonce: string): string {
	return text.replaceAll(nonce, NONCE_PLACEHOLDER)
}

/**
 * Convert Response headers to a plain object, excluding hop-by-hop headers.
 */
function headersToRecord(headers: Headers): Record<string, string> {
	const result: Record<string, string> = {}
	headers.forEach((value, key) => {
		/* Skip transfer-encoding and connection headers */
		if (key === "transfer-encoding" || key === "connection") return
		result[key] = value
	})
	return result
}

/**
 * Render a single route — fetches HTML + NDJSON, replaces nonce.
 */
async function renderRoute(
	route: PrerenderRoute,
	origin: string,
	handler: ServerHandler,
	env: unknown,
): Promise<{ entry: PrerenderManifestEntry } | { error: { message: string; pathname: string } }> {
	const url = `${origin}${route.pathname}`

	/* 1. Fetch HTML */
	let htmlResponse: Response
	try {
		htmlResponse = await handler.fetch(new Request(url, { method: "GET" }), env)
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e)
		return { error: { message: msg, pathname: route.pathname } }
	}

	if (htmlResponse.status !== 200) {
		return {
			error: {
				message: `HTML response status ${htmlResponse.status}`,
				pathname: route.pathname,
			},
		}
	}

	let html = await htmlResponse.text()
	const htmlHeaders = headersToRecord(htmlResponse.headers)

	/* 2. Fetch NDJSON */
	let ndjson = ""
	try {
		const dataResponse = await handler.fetch(
			new Request(url, {
				headers: { "x-d": "1" },
				method: "GET",
			}),
			env,
		)
		ndjson = await dataResponse.text()
	} catch {
		/* NDJSON fetch failure is non-fatal — store empty */
	}

	/* 3. Extract and replace nonce */
	const nonce = extractNonce(html)
	if (nonce) {
		html = replaceNonce(html, nonce)
		/* Replace nonce in headers too (CSP header) */
		for (const [key, value] of Object.entries(htmlHeaders)) {
			if (value.includes(nonce)) {
				htmlHeaders[key] = replaceNonce(value, nonce)
			}
		}
	}

	/* 4. Build manifest entry */
	const entry: PrerenderManifestEntry = {
		headers: htmlHeaders,
		html,
		mode: route.mode,
		ndjson,
		pathname: route.pathname,
	}

	if (route.defer !== undefined) entry.defer = route.defer
	if (route.dynamicParams !== undefined) entry.dynamicParams = route.dynamicParams
	if (route.revalidate !== undefined) entry.revalidate = route.revalidate
	if (route.tags !== undefined) entry.tags = route.tags

	return { entry }
}

/**
 * Pre-render static and ISR routes.
 *
 * Routes are rendered in parallel with configurable concurrency (default: 6).
 * Each route produces an HTML + NDJSON pair with nonce placeholders.
 */
export async function prerender(config: PrerenderConfig): Promise<PrerenderResult> {
	const { concurrency = 6, handler, origin } = config
	const excludeSet = new Set(config.exclude ?? [])

	/* Filter routes */
	const routes = config.routes.filter((r) => !excludeSet.has(r.pathname))

	if (routes.length === 0) {
		return { entries: [], errors: [] }
	}

	/* Resolve env */
	let env: unknown
	if (config.env !== undefined) {
		env = typeof config.env === "function" ? await config.env() : config.env
	}

	/* Render with concurrency control */
	const entries: PrerenderManifestEntry[] = []
	const errors: Array<{ message: string; pathname: string }> = []

	/* Simple semaphore-based concurrency control */
	let activeCount = 0
	let routeIndex = 0
	const totalRoutes = routes.length

	await new Promise<void>((resolve) => {
		let completedCount = 0

		function startNext(): void {
			while (activeCount < concurrency && routeIndex < totalRoutes) {
				const route = routes[routeIndex++]
				if (!route) continue
				activeCount++

				renderRoute(route, origin, handler, env)
					.then((result) => {
						if ("entry" in result) {
							entries.push(result.entry)
						} else {
							errors.push(result.error)
						}
					})
					.catch((e: unknown) => {
						const msg = e instanceof Error ? e.message : String(e)
						errors.push({ message: msg, pathname: route.pathname })
					})
					.finally(() => {
						activeCount--
						completedCount++
						if (completedCount === totalRoutes) {
							resolve()
						} else {
							startNext()
						}
					})
			}
		}

		startNext()
	})

	return { entries, errors }
}

/* ── Route definition → PrerenderRoute bridge ──────────────────── */

/**
 * Compute URL pathname from virtualPath, stripping root prefix, group
 * segments, and "index" → "/". Same logic as generators/computeUrlPattern.
 */
function virtualPathToPathname(virtualPath: string): string {
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

function mapDynamicParams(extracted: boolean | undefined): boolean | undefined {
	return extracted
}

function mapDefer(extracted: ExtractedStaticDeferMode | undefined): StaticDeferMode | undefined {
	return extracted
}

/**
 * Convert generator RouteDefinitions to PrerenderRoutes.
 * Filters to pages with static config, validates auth constraints.
 * When `staticParams` is provided, dynamic routes are expanded into
 * concrete pathnames using `resolvePathParams`.
 */
export function buildPrerenderRoutes(
	defs: RouteDefinition[],
	staticParams?: Map<string, Record<string, string | string[]>[]>,
): PrerenderRoute[] {
	const routes: PrerenderRoute[] = []

	for (const def of defs) {
		/* Only pages, not layouts or response routes */
		if (def.type !== "page") continue
		if (def.responseRoute) continue

		const hasPrerenderConfig = def.cache.ssg || def.cache.isr
		if (!hasPrerenderConfig) continue

		/* isr without revalidate = on-demand only, skip build-time prerender */
		if (def.cache.isr && def.cache.isrRevalidate === undefined) continue

		/* Auth + static = build error (authenticateOptional is allowed) */
		if (def.authenticateMode === true) {
			throw new Error(
				`Route "${def.virtualPath}" has both authenticate and static config. ` +
					"Authenticated routes cannot be pre-rendered.",
			)
		}

		const pathname = virtualPathToPathname(def.virtualPath)
		const mode: "isr" | "static" = def.cache.isr ? "isr" : "static"

		/* Dynamic route — expand with staticParams */
		if (pathname.includes("[")) {
			const paramSets = staticParams?.get(def.virtualPath)
			if (!paramSets || paramSets.length === 0) continue

			for (const params of paramSets) {
				const resolved = resolvePathParams(pathname, params)
				const route: PrerenderRoute = { mode, pathname: resolved }

				if (def.cache.isrRevalidate !== undefined) {
					route.revalidate = def.cache.isrRevalidate
				}
				const defer = mapDefer(def.cache.isrDefer ?? def.cache.ssgDefer)
				if (defer !== undefined) route.defer = defer
				const dp = mapDynamicParams(def.cache.isrDynamicParams)
				if (dp !== undefined) route.dynamicParams = dp

				routes.push(route)
			}
			continue
		}

		const route: PrerenderRoute = { mode, pathname }

		if (def.cache.isrRevalidate !== undefined) {
			route.revalidate = def.cache.isrRevalidate
		}
		const defer = mapDefer(def.cache.isrDefer ?? def.cache.ssgDefer)
		if (defer !== undefined) route.defer = defer
		const dp2 = mapDynamicParams(def.cache.isrDynamicParams)
		if (dp2 !== undefined) route.dynamicParams = dp2

		routes.push(route)
	}

	return routes
}

/* ── Output generation ─────────────────────────────────────────── */

export interface PrerenderOutputFile {
	content: string
	path: string
}

export interface PrerenderManifestRecord {
	defer?: StaticDeferMode
	dynamicParams?: boolean
	mode: "isr" | "static"
	pathname: string
	revalidate?: number
	tags?: string[]
}

export interface PrerenderOutput {
	files: PrerenderOutputFile[]
	manifest: PrerenderManifestRecord[]
}

/**
 * Convert prerender entries to file outputs + manifest.
 * Each entry produces:
 *   - `{pathname}.html` — pre-rendered HTML with nonce placeholder
 *   - `{pathname}.ndjson` — serialized data
 *   - `{pathname}.headers.json` — response headers
 */
export function writePrerenderOutput(entries: PrerenderManifestEntry[]): PrerenderOutput {
	const files: PrerenderOutputFile[] = []
	const manifest: PrerenderManifestRecord[] = []

	for (const entry of entries) {
		const base = entry.pathname === "/" ? "/index" : entry.pathname

		files.push({ content: entry.html, path: `${base}.html` })
		files.push({ content: entry.ndjson, path: `${base}.ndjson` })
		files.push({
			content: JSON.stringify(entry.headers, null, 2),
			path: `${base}.headers.json`,
		})

		const record: PrerenderManifestRecord = {
			mode: entry.mode,
			pathname: entry.pathname,
		}
		if (entry.defer !== undefined) record.defer = entry.defer
		if (entry.dynamicParams !== undefined) record.dynamicParams = entry.dynamicParams
		if (entry.revalidate !== undefined) record.revalidate = entry.revalidate
		if (entry.tags !== undefined) record.tags = entry.tags

		manifest.push(record)
	}

	return { files, manifest }
}

/**
 * Load build-time prerender artifacts from disk into a store.
 * Reads manifest.json + .html/.ndjson/.headers.json files from `staticDir`.
 * Silently no-ops if manifest doesn't exist (e.g. dev mode without prerender).
 */
export function loadPrerenderArtifacts(
	staticDir: string,
	store: import("../store").FlareStore,
): void {
	const manifestPath = join(staticDir, "manifest.json")
	if (!existsSync(manifestPath)) return

	const manifest: PrerenderManifestRecord[] = JSON.parse(readFileSync(manifestPath, "utf-8"))

	for (const record of manifest) {
		const base = record.pathname === "/" ? "/index" : record.pathname
		const htmlPath = join(staticDir, `${base}.html`)
		if (!existsSync(htmlPath)) continue

		const html = readFileSync(htmlPath, "utf-8")
		const ndjsonPath = join(staticDir, `${base}.ndjson`)
		const ndjson = existsSync(ndjsonPath) ? readFileSync(ndjsonPath, "utf-8") : ""
		const headersPath = join(staticDir, `${base}.headers.json`)
		const headers: Record<string, string> = existsSync(headersPath)
			? JSON.parse(readFileSync(headersPath, "utf-8"))
			: {}

		store.set(`static:${record.pathname}`, {
			data: { headers, html, ndjson },
			storedAt: Date.now(),
		})
	}
}
