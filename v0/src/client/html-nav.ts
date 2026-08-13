/**
 * HTML Navigation Client
 *
 * Handles HTML nav mode on client side.
 * Fetches full HTML, swaps #app content, merges head, re-hydrates.
 * Layouts re-render on nav (acceptable for content sites).
 */

import type { JSX } from "solid-js"
import { CSR_HEADER_VALUES, CSR_HEADERS, NAV_FORMAT } from "../server/handler/constants"
import { extractHead, extractHtmlAttributes, mergeHead, updateHtmlAttributes } from "./head-merge"
import type {
	NavFetcher,
	NavFetcherConfig,
	NavFetchOptions,
	NavFetchResult,
	NavState,
	PerRouteHead,
	QueryState,
} from "./nav-types"

interface ParsedPerRouteHead {
	head: Record<string, unknown>
	matchId: string
}

interface ParsedFlareState {
	c: Record<string, unknown>
	h?: Record<string, unknown>
	ph?: ParsedPerRouteHead[]
	q: QueryState[]
	r: {
		matches: Array<{ id: string; loaderData: unknown }>
		params: Record<string, string | string[]>
		pathname: string
	}
}

/**
 * Parse flare state from HTML document
 */
function parseFlareStateFromHtml(html: string): ParsedFlareState | null {
	/* Find script with flare state - look for self.flare assignment */
	const selfMatch = html.match(/self\.flare\s*=\s*({[\s\S]*?});?\s*<\/script>/)
	if (!selfMatch?.[1]) {
		return null
	}

	try {
		return JSON.parse(selfMatch[1]) as ParsedFlareState
	} catch {
		return null
	}
}

/**
 * Extract #app content from HTML
 */
function extractAppContent(html: string): string | null {
	/* Parse HTML - look for id="app" or id="root" */
	const appMatch = html.match(
		/<div[^>]*id=["'](?:app|root)["'][^>]*>([\s\S]*?)<\/div>\s*(?:<script|<\/body|$)/i,
	)
	if (appMatch?.[1] !== undefined) {
		return appMatch[1]
	}

	/* Fallback: extract body inner content */
	const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
	if (bodyMatch?.[1] !== undefined) {
		return bodyMatch[1]
	}

	return null
}

/**
 * Convert parsed flare state to NavState
 */
function toNavState(parsed: ParsedFlareState): NavState {
	return {
		matches: parsed.r.matches.map((m) => ({
			id: m.id,
			loaderData: m.loaderData,
		})),
		params: parsed.r.params,
		pathname: parsed.r.pathname,
		queries: parsed.q,
	}
}

/**
 * Create HTML navigation fetcher.
 * Returns parsed state + HTML content. DOM swap is handled by caller.
 */
function createHtmlNavFetcher(config: NavFetcherConfig): NavFetcher {
	const { baseUrl, fetch: fetchFn = globalThis.fetch } = config

	async function fetchHtml(options: NavFetchOptions): Promise<NavFetchResult> {
		const { prefetch, signal, url } = options

		const headers: Record<string, string> = {
			[CSR_HEADERS.DATA_REQUEST]: CSR_HEADER_VALUES.DATA_REQUEST_ENABLED,
			[CSR_HEADERS.NAV_FORMAT]: NAV_FORMAT.HTML,
		}

		if (prefetch) {
			headers[CSR_HEADERS.PREFETCH] = "1"
		}

		try {
			const response = await fetchFn(`${baseUrl}${url}`, {
				headers,
				method: "GET",
				signal,
			})

			if (!response.ok) {
				return {
					error: new Error(`HTML nav failed: ${response.status}`),
					success: false,
				}
			}

			const html = await response.text()
			const parsed = parseFlareStateFromHtml(html)

			if (!parsed) {
				return {
					error: new Error("Failed to parse flare state from HTML"),
					success: false,
				}
			}

			/* Extract per-route heads if available */
			const perRouteHeads: PerRouteHead[] | undefined = parsed.ph?.map((p) => ({
				head: p.head as PerRouteHead["head"],
				matchId: p.matchId,
			}))

			return {
				html,
				perRouteHeads,
				state: toNavState(parsed),
				success: true,
			}
		} catch (e) {
			if (e instanceof Error && e.name === "AbortError") {
				return { success: false }
			}
			return {
				error: e instanceof Error ? e : new Error(String(e)),
				success: false,
			}
		}
	}

	return {
		fetch: fetchHtml,
	}
}

/**
 * Swap #app content with new HTML.
 * Call after HTML nav fetch succeeds.
 */
function swapAppContent(html: string): boolean {
	const appContent = extractAppContent(html)
	if (!appContent) {
		return false
	}

	const appEl = document.getElementById("app") ?? document.getElementById("root")
	if (!appEl) {
		return false
	}

	appEl.innerHTML = appContent
	return true
}

/**
 * Merge head only from HTML (no content swap).
 * Use when Solid is handling content rendering reactively.
 * - Merges <head> (Turbo Drive style)
 * - Updates <html> attributes
 */
function mergeHeadFromHtml(html: string): void {
	/* Extract and merge head */
	const newHead = extractHead(html)
	mergeHead(newHead)

	/* Update <html> attributes */
	const htmlAttrs = extractHtmlAttributes(html)
	updateHtmlAttributes(htmlAttrs)
}

/**
 * Full HTML navigation swap with head merge.
 * Use for full page swap + rehydrate approach.
 * - Merges <head> (Turbo Drive style)
 * - Updates <html> attributes
 * - Swaps #app content
 */
function swapWithHeadMerge(html: string): boolean {
	mergeHeadFromHtml(html)

	/* Swap #app content */
	return swapAppContent(html)
}

/**
 * Re-hydrate after HTML swap.
 * Call this after navigation completes and DOM is swapped.
 */
async function rehydrateAfterSwap(createApp: () => JSX.Element): Promise<void> {
	const { hydrate } = await import("solid-js/web")

	const appEl = document.getElementById("app") ?? document.getElementById("root")
	if (!appEl) {
		return
	}

	/* Clear existing hydration markers */
	const walker = document.createTreeWalker(appEl, NodeFilter.SHOW_COMMENT, null)
	const commentsToRemove: Comment[] = []
	while (walker.nextNode()) {
		const comment = walker.currentNode as Comment
		if (comment.data.startsWith("$") || comment.data.startsWith("/")) {
			commentsToRemove.push(comment)
		}
	}
	for (const comment of commentsToRemove) {
		comment.remove()
	}

	/* Re-hydrate */
	hydrate(() => createApp(), appEl)
}

export type { ParsedFlareState }

export {
	createHtmlNavFetcher,
	extractAppContent,
	mergeHeadFromHtml,
	parseFlareStateFromHtml,
	rehydrateAfterSwap,
	swapAppContent,
	swapWithHeadMerge,
	toNavState,
}
