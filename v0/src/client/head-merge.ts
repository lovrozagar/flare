/**
 * Head Merge Utilities
 *
 * Turbo Drive-style head merging for CSR navigation.
 * - Updates title, meta tags
 * - Keeps existing stylesheets/scripts if same src/href
 * - Updates <html> attributes (lang, class, data-*)
 * - Tracks and cleans up stale meta tags on navigation
 */

import type { HeadConfig, RobotsConfig } from "../router/_internal/types"

/**
 * Track meta tags managed by Flare for cleanup on navigation.
 * Keyed by selector string (e.g., "meta[name='keywords']").
 */
const managedMetaTags = new Set<string>()

/**
 * Track hreflang links managed by Flare for cleanup on navigation.
 * Keyed by hreflang value (e.g., "en", "fr").
 */
const managedHreflangLinks = new Set<string>()

/**
 * Track head elements by route for per-route cleanup.
 * Map of matchId → Set of selectors managed by that route.
 */
const headByRoute = new Map<string, Set<string>>()

/**
 * Track current route hierarchy for cleanup comparison.
 */
let currentRouteHierarchy: string[] = []

interface ParsedHead {
	links: Array<{ href: string; rel: string; attrs: Record<string, string> }>
	meta: Array<{ content: string; key: string; attrs: Record<string, string> }>
	scripts: Array<{ src: string; attrs: Record<string, string> }>
	title: string | null
}

interface ParsedHtmlAttributes {
	class?: string
	dir?: string
	lang?: string
	[key: string]: string | undefined
}

/**
 * Extract <head> content from HTML string
 */
function extractHead(html: string): ParsedHead {
	const result: ParsedHead = {
		links: [],
		meta: [],
		scripts: [],
		title: null,
	}

	/* Extract title - use last one found (page-specific overrides root) */
	const titleRegex = /<title[^>]*>([^<]*)<\/title>/gi
	let titleMatch: RegExpExecArray | null = null
	let lastTitle: string | null = null

	while ((titleMatch = titleRegex.exec(html)) !== null) {
		if (titleMatch[1]) {
			lastTitle = titleMatch[1]
		}
	}
	if (lastTitle !== null) {
		result.title = lastTitle
	}

	/* Extract meta tags */
	const metaRegex = /<meta\s+([^>]*)>/gi
	let metaMatch: RegExpExecArray | null = null

	while ((metaMatch = metaRegex.exec(html)) !== null) {
		const attrsStr = metaMatch[1]
		if (!attrsStr) continue

		const attrs = parseAttributes(attrsStr)
		/* Key by name or property for deduplication */
		const key = attrs.name || attrs.property || attrs["http-equiv"] || ""
		if (key) {
			result.meta.push({
				attrs,
				content: attrs.content || "",
				key,
			})
		}
	}

	/* Extract link tags (stylesheets, etc.) */
	const linkRegex = /<link\s+([^>]*)>/gi
	let linkMatch: RegExpExecArray | null = null

	while ((linkMatch = linkRegex.exec(html)) !== null) {
		const attrsStr = linkMatch[1]
		if (!attrsStr) continue

		const attrs = parseAttributes(attrsStr)
		if (attrs.href) {
			result.links.push({
				attrs,
				href: attrs.href,
				rel: attrs.rel || "",
			})
		}
	}

	/* Extract script tags with src */
	const scriptRegex = /<script\s+([^>]*)>/gi
	let scriptMatch: RegExpExecArray | null = null

	while ((scriptMatch = scriptRegex.exec(html)) !== null) {
		const attrsStr = scriptMatch[1]
		if (!attrsStr) continue

		const attrs = parseAttributes(attrsStr)
		if (attrs.src) {
			result.scripts.push({
				attrs,
				src: attrs.src,
			})
		}
	}

	return result
}

/**
 * Extract <html> element attributes from HTML string
 */
function extractHtmlAttributes(html: string): ParsedHtmlAttributes {
	const result: ParsedHtmlAttributes = {}

	const htmlMatch = html.match(/<html\s+([^>]*)>/i)
	if (htmlMatch?.[1]) {
		const attrs = parseAttributes(htmlMatch[1])
		Object.assign(result, attrs)
	}

	return result
}

/**
 * Parse HTML attributes string into object
 */
function parseAttributes(attrsStr: string): Record<string, string> {
	const result: Record<string, string> = {}
	const attrRegex = /(\w[\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g
	let match: RegExpExecArray | null = null


	while ((match = attrRegex.exec(attrsStr)) !== null) {
		const name = match[1]
		const value = match[2] ?? match[3] ?? match[4] ?? ""
		if (name) {
			result[name] = value
		}
	}

	return result
}

/**
 * Merge new head into existing document head (Turbo Drive style)
 *
 * Strategy:
 * - Update <title> if changed
 * - Update/add <meta> tags (match by name/property)
 * - Keep existing <link rel="stylesheet"> if same href
 * - Keep existing <script> if same src
 * - Add new links/scripts that don't exist
 */
function mergeHead(newHead: ParsedHead): void {
	/* Update title */
	if (newHead.title !== null && document.title !== newHead.title) {
		document.title = newHead.title
	}

	/* Update meta tags */
	for (const meta of newHead.meta) {
		updateOrAddMeta(meta.content, meta.attrs)
	}

	/* Handle stylesheets - add new ones, keep existing */
	const existingStylesheets = new Set<string>()
	for (const link of Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))) {
		const href = link.getAttribute("href")
		if (href) existingStylesheets.add(href)
	}

	for (const link of newHead.links) {
		if (link.rel === "stylesheet" && !existingStylesheets.has(link.href)) {
			addLink(link.href, link.rel, link.attrs)
		}
	}

	/* Handle scripts - keep existing, don't re-add */
	const existingScripts = new Set<string>()
	for (const script of Array.from(document.head.querySelectorAll("script[src]"))) {
		const src = script.getAttribute("src")
		if (src) existingScripts.add(src)
	}

	/* Note: We intentionally don't add new scripts from head on CSR nav
	 * as they may have already executed or cause conflicts.
	 * Scripts should be in body or handled by the framework.
	 */
}

/**
 * Update or add a meta tag
 */
function updateOrAddMeta(content: string, attrs: Record<string, string>): void {
	/* Try to find existing meta by name or property */
	let existing: Element | null = null

	if (attrs.name) {
		existing = document.head.querySelector(`meta[name="${attrs.name}"]`)
	} else if (attrs.property) {
		existing = document.head.querySelector(`meta[property="${attrs.property}"]`)
	} else if (attrs["http-equiv"]) {
		existing = document.head.querySelector(`meta[http-equiv="${attrs["http-equiv"]}"]`)
	}

	if (existing) {
		/* Update existing */
		if (existing.getAttribute("content") !== content) {
			existing.setAttribute("content", content)
		}
	} else {
		/* Add new meta tag */
		const meta = document.createElement("meta")
		for (const [name, value] of Object.entries(attrs)) {
			meta.setAttribute(name, value)
		}
		document.head.appendChild(meta)
	}
}

/**
 * Add a link tag to head
 */
function addLink(href: string, rel: string, attrs: Record<string, string>): void {
	const link = document.createElement("link")
	link.href = href
	link.rel = rel
	for (const [name, value] of Object.entries(attrs)) {
		if (name !== "href" && name !== "rel") {
			link.setAttribute(name, value)
		}
	}
	document.head.appendChild(link)
}

/**
 * Update <html> element attributes from parsed attributes
 */
function updateHtmlAttributes(attrs: ParsedHtmlAttributes): void {
	const html = document.documentElement

	/* Update lang if changed */
	if (attrs.lang !== undefined && html.lang !== attrs.lang) {
		html.lang = attrs.lang
	}

	/* Update dir if changed */
	if (attrs.dir !== undefined && html.dir !== attrs.dir) {
		html.dir = attrs.dir
	}

	/* Update class if changed */
	if (attrs.class !== undefined && html.className !== attrs.class) {
		html.className = attrs.class
	}

	/* Update data-* attributes */
	for (const [name, value] of Object.entries(attrs)) {
		if (name.startsWith("data-") && value !== undefined) {
			const current = html.getAttribute(name)
			if (current !== value) {
				html.setAttribute(name, value)
			}
		}
	}
}

/**
 * Apply HeadConfig directly to document head (for NDJSON nav).
 * Supports all HeadConfig fields with stale meta cleanup.
 */
function applyHeadConfig(config: HeadConfig): void {
	/* Track which meta tags are in this config for cleanup */
	const currentMetaTags = new Set<string>()
	const currentHreflangLinks = new Set<string>()

	/* Update title */
	if (config.title !== undefined && document.title !== config.title) {
		document.title = config.title
	}

	/* Update meta description */
	if (config.description !== undefined) {
		setMetaTracked("description", config.description, "name", currentMetaTags)
	}

	/* Update keywords */
	if (config.keywords !== undefined) {
		setMetaTracked("keywords", config.keywords, "name", currentMetaTags)
	}

	/* Update robots */
	if (config.robots !== undefined) {
		const robotsContent = buildRobotsContent(config.robots)
		if (robotsContent) {
			setMetaTracked("robots", robotsContent, "name", currentMetaTags)
		}
	}

	/* Update canonical link */
	if (config.canonical !== undefined) {
		updateCanonical(config.canonical)
	}

	/* Update MetaConfig fields */
	if (config.meta) {
		const m = config.meta
		if (m.viewport !== undefined && m.viewport !== false) {
			setMetaTracked("viewport", m.viewport, "name", currentMetaTags)
		}
		if (m.author) setMetaTracked("author", m.author, "name", currentMetaTags)
		if (m.generator) setMetaTracked("generator", m.generator, "name", currentMetaTags)
		if (m.applicationName)
			setMetaTracked("application-name", m.applicationName, "name", currentMetaTags)
		if (m.creator) setMetaTracked("creator", m.creator, "name", currentMetaTags)
		if (m.publisher) setMetaTracked("publisher", m.publisher, "name", currentMetaTags)
		if (m.manifest) updateManifestLink(m.manifest)
		/* Apple mobile web app meta */
		if (m.appleMobileWebAppCapable) {
			setMetaTracked(
				"apple-mobile-web-app-capable",
				m.appleMobileWebAppCapable,
				"name",
				currentMetaTags,
			)
		}
		if (m.appleMobileWebAppStatusBarStyle) {
			setMetaTracked(
				"apple-mobile-web-app-status-bar-style",
				m.appleMobileWebAppStatusBarStyle,
				"name",
				currentMetaTags,
			)
		}
		if (m.appleMobileWebAppTitle) {
			setMetaTracked(
				"apple-mobile-web-app-title",
				m.appleMobileWebAppTitle,
				"name",
				currentMetaTags,
			)
		}
		if (m.mobileWebAppCapable) {
			setMetaTracked("mobile-web-app-capable", m.mobileWebAppCapable, "name", currentMetaTags)
		}
	}

	/* Update favicons */
	if (config.favicons) {
		const f = config.favicons
		if (f.ico) updateFaviconLink("icon", f.ico, "image/x-icon")
		if (f.svg) updateFaviconLink("icon", f.svg, "image/svg+xml")
		if (f.appleTouchIcon) updateFaviconLink("apple-touch-icon", f.appleTouchIcon)
		if (f["96x96"]) updateFaviconLink("icon", f["96x96"], "image/png", "96x96")
		if (f["192x192"]) updateFaviconLink("icon", f["192x192"], "image/png", "192x192")
		if (f["512x512"]) updateFaviconLink("icon", f["512x512"], "image/png", "512x512")
	}

	/* Update OpenGraph meta */
	if (config.openGraph) {
		const og = config.openGraph
		if (og.title) setMetaTracked("og:title", og.title, "property", currentMetaTags)
		if (og.description)
			setMetaTracked("og:description", og.description, "property", currentMetaTags)
		if (og.url) setMetaTracked("og:url", og.url, "property", currentMetaTags)
		if (og.type) setMetaTracked("og:type", og.type, "property", currentMetaTags)
		if (og.siteName) setMetaTracked("og:site_name", og.siteName, "property", currentMetaTags)
		if (og.locale) setMetaTracked("og:locale", og.locale, "property", currentMetaTags)
		/* Handle all images */
		if (og.images) {
			for (let i = 0; i < og.images.length; i++) {
				const img = og.images[i]
				if (!img) continue
				if (i === 0) {
					setMetaTracked("og:image", img.url, "property", currentMetaTags)
					if (img.width)
						setMetaTracked("og:image:width", String(img.width), "property", currentMetaTags)
					if (img.height)
						setMetaTracked("og:image:height", String(img.height), "property", currentMetaTags)
					if (img.alt) setMetaTracked("og:image:alt", img.alt, "property", currentMetaTags)
					if (img.type) setMetaTracked("og:image:type", img.type, "property", currentMetaTags)
				} else {
					/* Additional images - append as new meta tags */
					appendMetaTracked("og:image", img.url, "property", currentMetaTags)
				}
			}
		}
		/* Handle videos */
		if (og.videos) {
			for (const video of og.videos) {
				appendMetaTracked("og:video", video.url, "property", currentMetaTags)
				if (video.type) appendMetaTracked("og:video:type", video.type, "property", currentMetaTags)
				if (video.width)
					appendMetaTracked("og:video:width", String(video.width), "property", currentMetaTags)
				if (video.height)
					appendMetaTracked("og:video:height", String(video.height), "property", currentMetaTags)
			}
		}
		/* Handle audio */
		if (og.audio) {
			for (const audio of og.audio) {
				appendMetaTracked("og:audio", audio.url, "property", currentMetaTags)
				if (audio.type) appendMetaTracked("og:audio:type", audio.type, "property", currentMetaTags)
			}
		}
		/* Handle alternate locales */
		if (og.alternateLocale) {
			for (const locale of og.alternateLocale) {
				appendMetaTracked("og:locale:alternate", locale, "property", currentMetaTags)
			}
		}
	}

	/* Update Twitter meta */
	if (config.twitter) {
		const tw = config.twitter
		if (tw.card) setMetaTracked("twitter:card", tw.card, "name", currentMetaTags)
		if (tw.site) setMetaTracked("twitter:site", tw.site, "name", currentMetaTags)
		if (tw.creator) setMetaTracked("twitter:creator", tw.creator, "name", currentMetaTags)
		if (tw.title) setMetaTracked("twitter:title", tw.title, "name", currentMetaTags)
		if (tw.description)
			setMetaTracked("twitter:description", tw.description, "name", currentMetaTags)
		if (tw.images?.[0]) {
			setMetaTracked("twitter:image", tw.images[0].url, "name", currentMetaTags)
			if (tw.images[0].alt)
				setMetaTracked("twitter:image:alt", tw.images[0].alt, "name", currentMetaTags)
		}
	}

	/* Update JSON-LD structured data */
	if (config.jsonLd !== undefined) {
		updateJsonLd(config.jsonLd)
	}

	/* Update hreflang links for alternate languages */
	if (config.languages) {
		for (const [lang, href] of Object.entries(config.languages)) {
			updateHreflangLink(lang, href, currentHreflangLinks)
		}
	}

	/* Update custom head elements */
	if (config.custom) {
		/* Custom meta tags */
		if (config.custom.meta) {
			for (const meta of config.custom.meta) {
				const key = meta.name || meta.property || meta["http-equiv"]
				if (key) {
					const type = meta.property ? "property" : "name"
					if (meta.content) {
						setMetaTracked(key, meta.content, type, currentMetaTags)
					}
				}
			}
		}
		/* Custom link tags */
		if (config.custom.links) {
			for (const link of config.custom.links) {
				if (link.href && link.rel) {
					updateCustomLink(link)
				}
			}
		}
		/* Custom styles */
		if (config.custom.styles) {
			for (const style of config.custom.styles) {
				if (style.children) {
					appendCustomStyle(style.children)
				}
			}
		}
		/* Custom scripts - Turbo Drive style: add new scripts, dedupe existing */
		if (config.custom.scripts) {
			for (const script of config.custom.scripts) {
				appendCustomScript(script)
			}
		}
	}

	/* Clean up stale meta tags from previous navigation */
	cleanupStaleMeta(currentMetaTags)
	cleanupStaleHreflangLinks(currentHreflangLinks)

	/* Update tracking sets for next navigation */
	managedMetaTags.clear()
	for (const tag of currentMetaTags) {
		managedMetaTags.add(tag)
	}
	managedHreflangLinks.clear()
	for (const lang of currentHreflangLinks) {
		managedHreflangLinks.add(lang)
	}
}

/**
 * Build robots meta content string from RobotsConfig
 */
function buildRobotsContent(robots: RobotsConfig): string {
	const directives: string[] = []

	if (robots.index === false) {
		directives.push("noindex")
	} else if (robots.index === true) {
		directives.push("index")
	}

	if (robots.follow === false) {
		directives.push("nofollow")
	} else if (robots.follow === true) {
		directives.push("follow")
	}

	if (robots.noarchive) directives.push("noarchive")
	if (robots.noimageindex) directives.push("noimageindex")
	if (robots["max-snippet"] !== undefined) directives.push(`max-snippet:${robots["max-snippet"]}`)
	if (robots["max-image-preview"])
		directives.push(`max-image-preview:${robots["max-image-preview"]}`)
	if (robots["max-video-preview"] !== undefined)
		directives.push(`max-video-preview:${robots["max-video-preview"]}`)

	return directives.join(", ")
}

/**
 * Set meta tag with tracking for cleanup
 */
function setMetaTracked(
	key: string,
	value: string,
	type: "name" | "property",
	tracking: Set<string>,
): void {
	const selector = type === "property" ? `meta[property="${key}"]` : `meta[name="${key}"]`
	tracking.add(selector)
	setMeta(key, value, type)
}

/**
 * Append meta tag (for multiple values like og:image) with tracking
 */
function appendMetaTracked(
	key: string,
	value: string,
	type: "name" | "property",
	tracking: Set<string>,
): void {
	const selector = type === "property" ? `meta[property="${key}"]` : `meta[name="${key}"]`
	tracking.add(selector)
	const meta = document.createElement("meta")
	meta.setAttribute(type, key)
	meta.content = value
	document.head.appendChild(meta)
}

/**
 * Clean up stale meta tags not in current config
 */
function cleanupStaleMeta(currentTags: Set<string>): void {
	for (const selector of managedMetaTags) {
		if (!currentTags.has(selector)) {
			/* Remove all elements matching this selector */
			const elements = document.head.querySelectorAll(selector)
			for (const el of Array.from(elements)) {
				el.remove()
			}
		}
	}
}

/**
 * Update or add favicon link
 */
function updateFaviconLink(rel: string, href: string, type?: string, sizes?: string): void {
	/* Build selector to find existing */
	let selector = `link[rel="${rel}"]`
	if (type) selector += `[type="${type}"]`
	if (sizes) selector += `[sizes="${sizes}"]`

	let link = document.head.querySelector(selector) as HTMLLinkElement | null

	if (link) {
		if (link.href !== href) {
			link.href = href
		}
	} else {
		link = document.createElement("link")
		link.rel = rel
		link.href = href
		if (type) link.type = type
		if (sizes) link.setAttribute("sizes", sizes)
		document.head.appendChild(link)
	}
}

/**
 * Update or add manifest link
 */
function updateManifestLink(href: string): void {
	let link = document.head.querySelector('link[rel="manifest"]') as HTMLLinkElement | null

	if (link) {
		if (link.href !== href) {
			link.href = href
		}
	} else {
		link = document.createElement("link")
		link.rel = "manifest"
		link.href = href
		document.head.appendChild(link)
	}
}

/**
 * Update or create JSON-LD script
 */
function updateJsonLd(data: unknown): void {
	let script = document.head.querySelector(
		'script[type="application/ld+json"]',
	) as HTMLScriptElement | null

	const content = JSON.stringify(data)

	if (script) {
		if (script.textContent !== content) {
			script.textContent = content
		}
	} else {
		script = document.createElement("script")
		script.type = "application/ld+json"
		script.textContent = content
		document.head.appendChild(script)
	}
}

/**
 * Update or add hreflang link with tracking
 */
function updateHreflangLink(lang: string, href: string, tracking: Set<string>): void {
	tracking.add(lang)

	const selector = `link[rel="alternate"][hreflang="${lang}"]`
	let link = document.head.querySelector(selector) as HTMLLinkElement | null

	if (link) {
		if (link.href !== href) {
			link.href = href
		}
	} else {
		link = document.createElement("link")
		link.rel = "alternate"
		link.hreflang = lang
		link.href = href
		document.head.appendChild(link)
	}
}

/**
 * Update or add hreflang link without tracking (for per-route head)
 */
function updateHreflangLinkNoTracking(lang: string, href: string): void {
	const selector = `link[rel="alternate"][hreflang="${lang}"]`
	let link = document.head.querySelector(selector) as HTMLLinkElement | null

	if (link) {
		if (link.href !== href) {
			link.href = href
		}
	} else {
		link = document.createElement("link")
		link.rel = "alternate"
		link.hreflang = lang
		link.href = href
		document.head.appendChild(link)
	}
}

/**
 * Clean up stale hreflang links
 */
function cleanupStaleHreflangLinks(currentLangs: Set<string>): void {
	for (const lang of managedHreflangLinks) {
		if (!currentLangs.has(lang)) {
			const selector = `link[rel="alternate"][hreflang="${lang}"]`
			const el = document.head.querySelector(selector)
			if (el) {
				el.remove()
			}
		}
	}
}

/**
 * Update or add custom link element
 */
function updateCustomLink(linkAttrs: Record<string, string>): void {
	const href = linkAttrs.href
	const rel = linkAttrs.rel
	if (!href || !rel) return

	const selector = `link[rel="${rel}"][href="${href}"]`
	let link = document.head.querySelector(selector) as HTMLLinkElement | null

	if (!link) {
		link = document.createElement("link")
		link.rel = rel
		link.href = href
		for (const [key, value] of Object.entries(linkAttrs)) {
			if (key !== "href" && key !== "rel") {
				link.setAttribute(key, value)
			}
		}
		document.head.appendChild(link)
	}
}

/**
 * Append custom style element
 */
function appendCustomStyle(css: string): void {
	/* Check if this exact style already exists to avoid duplicates */
	const existingStyles = document.head.querySelectorAll("style[data-flare-custom]")
	for (const existing of Array.from(existingStyles)) {
		if (existing.textContent === css) {
			return
		}
	}

	const style = document.createElement("style")
	style.setAttribute("data-flare-custom", "")
	style.textContent = css
	document.head.appendChild(style)
}

/**
 * Append custom script element (Turbo Drive style - add new, dedupe existing)
 *
 * External scripts: dedupe by src attribute
 * Inline scripts: dedupe by content, mark with data-flare-custom
 *
 * NOTE: Scripts are additive only - they are NOT removed on navigation.
 * This is intentional because removing a <script> element doesn't undo its
 * JavaScript effects (event listeners, globals, intervals persist).
 *
 * For page-specific code that needs cleanup, use SolidJS lifecycle:
 * - onMount() for initialization
 * - onCleanup() for teardown
 */
function appendCustomScript(scriptConfig: {
	children?: string
	src?: string
	type?: string
}): void {
	const { children, src, type } = scriptConfig

	if (src) {
		/* External script - check if already loaded by src */
		const existing =
			document.head.querySelector(`script[src="${src}"]`) ||
			document.body.querySelector(`script[src="${src}"]`)
		if (existing) {
			return /* Already loaded, skip */
		}

		const script = document.createElement("script")
		script.src = src
		if (type) script.type = type
		script.setAttribute("data-flare-custom", "")
		document.head.appendChild(script)
	} else if (children) {
		/* Inline script - check if exact content already exists */
		const existingScripts = document.head.querySelectorAll("script[data-flare-custom]")
		for (const existing of Array.from(existingScripts)) {
			if (existing.textContent === children) {
				return /* Already exists, skip */
			}
		}

		const script = document.createElement("script")
		if (type) script.type = type
		script.setAttribute("data-flare-custom", "")
		script.textContent = children
		document.head.appendChild(script)
	}
}

/**
 * Set or update a meta tag by name or property
 */
function setMeta(key: string, value: string, type: "name" | "property" = "name"): void {
	const selector = type === "property" ? `meta[property="${key}"]` : `meta[name="${key}"]`
	let meta = document.head.querySelector(selector) as HTMLMetaElement | null

	if (meta) {
		if (meta.content !== value) {
			meta.content = value
		}
	} else {
		meta = document.createElement("meta")
		meta.setAttribute(type, key)
		meta.content = value
		document.head.appendChild(meta)
	}
}

/**
 * Update or add canonical link
 */
function updateCanonical(url: string): void {
	let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null

	if (link) {
		if (link.href !== url) {
			link.href = url
		}
	} else {
		link = document.createElement("link")
		link.rel = "canonical"
		link.href = url
		document.head.appendChild(link)
	}
}

/**
 * Per-route head interface
 */
interface PerRouteHead {
	head: HeadConfig
	matchId: string
}

/**
 * Apply per-route head configs with route-based cleanup.
 * This function:
 * 1. Determines which routes were removed (comparing new vs old hierarchy)
 * 2. Removes head elements owned by removed routes
 * 3. Applies new head configs, tracking ownership by route
 *
 * This solves the script/meta cleanup problem where layouts should persist
 * but page-specific head elements should be removed on navigation.
 */
function applyPerRouteHeads(perRouteHeads: PerRouteHead[]): void {
	/* Extract new route hierarchy from per-route heads */
	const newRouteHierarchy = perRouteHeads.map((h) => h.matchId)

	/* Find routes that were removed (in old hierarchy but not in new) */
	const removedRoutes = currentRouteHierarchy.filter((r) => !newRouteHierarchy.includes(r))

	/* Clean up head elements from removed routes */
	for (const routeId of removedRoutes) {
		const selectors = headByRoute.get(routeId)
		if (selectors) {
			for (const selector of selectors) {
				const elements = document.head.querySelectorAll(selector)
				for (const el of Array.from(elements)) {
					el.remove()
				}
				/* Also remove from global tracking */
				managedMetaTags.delete(selector)
			}
			headByRoute.delete(routeId)
		}
	}

	/* Apply new head configs with route tracking */
	for (const { head, matchId } of perRouteHeads) {
		applyHeadConfigForRoute(matchId, head)
	}

	/* Update current route hierarchy */
	currentRouteHierarchy = newRouteHierarchy
}

/**
 * Apply HeadConfig for a specific route, tracking elements by route.
 */
function applyHeadConfigForRoute(matchId: string, config: HeadConfig): void {
	/* Get or create selector set for this route */
	let routeSelectors = headByRoute.get(matchId)
	if (!routeSelectors) {
		routeSelectors = new Set()
		headByRoute.set(matchId, routeSelectors)
	}

	/* Update title (not tracked by route - always override) */
	if (config.title !== undefined && document.title !== config.title) {
		document.title = config.title
	}

	/* Update meta description */
	if (config.description !== undefined) {
		const selector = 'meta[name="description"]'
		routeSelectors.add(selector)
		managedMetaTags.add(selector)
		setMeta("description", config.description, "name")
	}

	/* Update keywords */
	if (config.keywords !== undefined) {
		const selector = 'meta[name="keywords"]'
		routeSelectors.add(selector)
		managedMetaTags.add(selector)
		setMeta("keywords", config.keywords, "name")
	}

	/* Update robots */
	if (config.robots !== undefined) {
		const robotsContent = buildRobotsContent(config.robots)
		if (robotsContent) {
			const selector = 'meta[name="robots"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("robots", robotsContent, "name")
		}
	}

	/* Update canonical link */
	if (config.canonical !== undefined) {
		routeSelectors.add('link[rel="canonical"]')
		updateCanonical(config.canonical)
	}

	/* Update MetaConfig fields */
	if (config.meta) {
		const m = config.meta
		if (m.viewport !== undefined && m.viewport !== false) {
			const selector = 'meta[name="viewport"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("viewport", m.viewport, "name")
		}
		if (m.author) {
			const selector = 'meta[name="author"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("author", m.author, "name")
		}
	}

	/* Update OpenGraph meta */
	if (config.openGraph) {
		const og = config.openGraph
		if (og.title) {
			const selector = 'meta[property="og:title"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("og:title", og.title, "property")
		}
		if (og.description) {
			const selector = 'meta[property="og:description"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("og:description", og.description, "property")
		}
		if (og.url) {
			const selector = 'meta[property="og:url"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("og:url", og.url, "property")
		}
		if (og.type) {
			const selector = 'meta[property="og:type"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("og:type", og.type, "property")
		}
		if (og.siteName) {
			const selector = 'meta[property="og:site_name"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("og:site_name", og.siteName, "property")
		}
		if (og.images?.[0]) {
			const img = og.images[0]
			const selector = 'meta[property="og:image"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("og:image", img.url, "property")
			if (img.width) {
				const widthSelector = 'meta[property="og:image:width"]'
				routeSelectors.add(widthSelector)
				managedMetaTags.add(widthSelector)
				setMeta("og:image:width", String(img.width), "property")
			}
			if (img.height) {
				const heightSelector = 'meta[property="og:image:height"]'
				routeSelectors.add(heightSelector)
				managedMetaTags.add(heightSelector)
				setMeta("og:image:height", String(img.height), "property")
			}
			if (img.alt) {
				const altSelector = 'meta[property="og:image:alt"]'
				routeSelectors.add(altSelector)
				managedMetaTags.add(altSelector)
				setMeta("og:image:alt", img.alt, "property")
			}
		}
	}

	/* Update Twitter meta */
	if (config.twitter) {
		const tw = config.twitter
		if (tw.card) {
			const selector = 'meta[name="twitter:card"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("twitter:card", tw.card, "name")
		}
		if (tw.title) {
			const selector = 'meta[name="twitter:title"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("twitter:title", tw.title, "name")
		}
		if (tw.description) {
			const selector = 'meta[name="twitter:description"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("twitter:description", tw.description, "name")
		}
		if (tw.site) {
			const selector = 'meta[name="twitter:site"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("twitter:site", tw.site, "name")
		}
		if (tw.creator) {
			const selector = 'meta[name="twitter:creator"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("twitter:creator", tw.creator, "name")
		}
		if (tw.images?.[0]) {
			const selector = 'meta[name="twitter:image"]'
			routeSelectors.add(selector)
			managedMetaTags.add(selector)
			setMeta("twitter:image", tw.images[0].url, "name")
			if (tw.images[0].alt) {
				const altSelector = 'meta[name="twitter:image:alt"]'
				routeSelectors.add(altSelector)
				managedMetaTags.add(altSelector)
				setMeta("twitter:image:alt", tw.images[0].alt, "name")
			}
		}
	}

	/* Update custom scripts - tracked by route for cleanup */
	if (config.custom?.scripts) {
		for (const script of config.custom.scripts) {
			if (script.src) {
				const selector = `script[src="${script.src}"]`
				routeSelectors.add(selector)
				appendCustomScript(script)
			}
		}
	}

	/* Update custom meta */
	if (config.custom?.meta) {
		for (const meta of config.custom.meta) {
			const key = meta.name || meta.property || meta["http-equiv"]
			if (key && meta.content) {
				const type = meta.property ? "property" : "name"
				const selector = type === "property" ? `meta[property="${key}"]` : `meta[name="${key}"]`
				routeSelectors.add(selector)
				managedMetaTags.add(selector)
				setMeta(key, meta.content, type)
			}
		}
	}

	/* Update JSON-LD structured data - tracked by route for cleanup */
	if (config.jsonLd !== undefined) {
		const jsonLdSelector = 'script[type="application/ld+json"]'
		routeSelectors.add(jsonLdSelector)
		updateJsonLd(config.jsonLd)
	}

	/* Update hreflang links - tracked by route for cleanup */
	if (config.languages) {
		for (const [lang, href] of Object.entries(config.languages)) {
			const selector = `link[rel="alternate"][hreflang="${lang}"]`
			routeSelectors.add(selector)
			managedHreflangLinks.add(lang)
			updateHreflangLinkNoTracking(lang, href)
		}
	}
}

/**
 * Initialize route hierarchy and scan DOM for managed head elements.
 * Call this during client hydration to enable cleanup on first navigation.
 * This scans the DOM for meta/link elements that flare manages and adds
 * them to tracking sets so they can be cleaned up on navigation.
 */
function initRouteHierarchy(matchIds: string[]): void {
	currentRouteHierarchy = [...matchIds]

	/* Skip DOM scanning in non-browser environments (SSR, tests) */
	if (typeof document === "undefined" || !document.head) {
		return
	}

	/* Scan DOM for flare-managed meta tags and add to tracking */
	const metaTags = document.head.querySelectorAll("meta[name], meta[property]")
	for (const meta of Array.from(metaTags)) {
		const name = meta.getAttribute("name")
		const property = meta.getAttribute("property")
		if (name) {
			const selector = `meta[name="${name}"]`
			managedMetaTags.add(selector)
		} else if (property) {
			const selector = `meta[property="${property}"]`
			managedMetaTags.add(selector)
		}
	}

	/* Scan DOM for hreflang links */
	const hreflangLinks = document.head.querySelectorAll('link[rel="alternate"][hreflang]')
	for (const link of Array.from(hreflangLinks)) {
		const lang = link.getAttribute("hreflang")
		if (lang) {
			managedHreflangLinks.add(lang)
		}
	}

	/* Associate all managed selectors with the deepest route in hierarchy
	 * This ensures they get cleaned up when that route is removed */
	if (matchIds.length > 0) {
		const deepestRoute = matchIds[matchIds.length - 1]
		if (deepestRoute) {
			const routeSelectors = new Set<string>()
			for (const selector of managedMetaTags) {
				routeSelectors.add(selector)
			}
			/* Also track canonical and JSON-LD */
			if (document.head.querySelector('link[rel="canonical"]')) {
				routeSelectors.add('link[rel="canonical"]')
			}
			if (document.head.querySelector('script[type="application/ld+json"]')) {
				routeSelectors.add('script[type="application/ld+json"]')
			}
			for (const lang of managedHreflangLinks) {
				routeSelectors.add(`link[rel="alternate"][hreflang="${lang}"]`)
			}
			headByRoute.set(deepestRoute, routeSelectors)
		}
	}
}

/**
 * Get current route hierarchy (for debugging/testing)
 */
function getCurrentRouteHierarchy(): string[] {
	return [...currentRouteHierarchy]
}

/**
 * Clear all route tracking (for testing)
 */
function clearRouteTracking(): void {
	headByRoute.clear()
	currentRouteHierarchy = []
	managedMetaTags.clear()
	managedHreflangLinks.clear()
}

export type { ParsedHead, ParsedHtmlAttributes, PerRouteHead }

export {
	applyHeadConfig,
	applyHeadConfigForRoute,
	applyPerRouteHeads,
	clearRouteTracking,
	extractHead,
	extractHtmlAttributes,
	getCurrentRouteHierarchy,
	initRouteHierarchy,
	mergeHead,
	parseAttributes,
	updateHtmlAttributes,
}
