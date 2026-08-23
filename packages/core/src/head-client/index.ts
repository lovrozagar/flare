import type { HeadConfig, RobotsConfig } from "../route-builder/types.ts";

export interface PerRouteHead {
	head: HeadConfig;
	matchId: string;
}

const TITLE_MARKER = "__title__";
const CSS_MARKER_PREFIX = "__css__:";

let baseTitle = "";
let currentRouteHierarchy: string[] = [];
const headByRoute = new Map<string, Set<string>>();
const managedMetaTags = new Set<string>();
const managedHreflangTags = new Set<string>();

/* CSS lifecycle: per-route elements + refcounted dedup for shared stylesheets */
const cssElementsByRoute = new Map<string, HTMLElement[]>();
const cssRefCount = new Map<string, { element: HTMLElement; refCount: number }>();

export function clearRouteTracking(): void {
	baseTitle = "";
	currentRouteHierarchy = [];
	headByRoute.clear();
	managedMetaTags.clear();
	managedHreflangTags.clear();
	cssElementsByRoute.clear();
	cssRefCount.clear();
}

export function initRouteHierarchy(matchIds: string[], rootTitle?: string): void {
	currentRouteHierarchy = [...matchIds];

	if (typeof document === "undefined") return;

	/* Use root layout title as fallback, not document.title which is the merged SSR title */
	baseTitle = rootTitle ?? document.title;

	for (const meta of document.head.querySelectorAll("meta[name], meta[property]")) {
		const sel = buildMetaSelector(meta as Element);
		if (sel) managedMetaTags.add(sel);
	}

	for (const link of document.head.querySelectorAll('link[rel="alternate"][hreflang]')) {
		const hreflang = (link as Element).getAttribute("hreflang");
		if (hreflang) managedHreflangTags.add(hreflang);
	}

	/*
	 * Don't pre-populate headByRoute here. The subsequent applyPerRouteHeads()
	 * call during hydration will build headByRoute entries from actual head
	 * configs, avoiding capture of infrastructure tags (viewport, charset).
	 */
}

export function applyPerRouteHeads(heads: PerRouteHead[]): void {
	const newHierarchy = heads.map((h) => h.matchId);
	const newSet = new Set(newHierarchy);
	const removed = currentRouteHierarchy.filter((r) => !newSet.has(r));

	for (const routeId of removed) {
		const selectors = headByRoute.get(routeId);
		if (selectors) {
			for (const sel of selectors) {
				if (sel !== TITLE_MARKER && !sel.startsWith(CSS_MARKER_PREFIX)) {
					removeBySelector(sel);
					managedMetaTags.delete(sel);
				}
			}
			headByRoute.delete(routeId);
		}
		removeCssForRoute(routeId);
	}

	for (const { head, matchId } of heads) {
		applyHeadConfigForRoute(matchId, head);
	}

	/* If no route in the new hierarchy set a title, restore the base (root layout) title */
	let titleSet = false;
	for (const matchId of newHierarchy) {
		if (headByRoute.get(matchId)?.has(TITLE_MARKER)) {
			titleSet = true;
			break;
		}
	}
	if (!titleSet && typeof document !== "undefined") {
		document.title = baseTitle;
	}

	currentRouteHierarchy = newHierarchy;
}

export function applyHeadConfig(config: HeadConfig): void {
	const currentTags = new Set<string>();
	const currentHreflangTags = new Set<string>();

	applyHeadFields(config, currentTags, currentHreflangTags);

	for (const sel of managedMetaTags) {
		if (!currentTags.has(sel)) {
			removeBySelector(sel);
		}
	}
	managedMetaTags.clear();
	for (const sel of currentTags) {
		managedMetaTags.add(sel);
	}

	for (const lang of managedHreflangTags) {
		if (!currentHreflangTags.has(lang)) {
			removeBySelector(`link[hreflang="${escapeAttr(lang)}"]`);
		}
	}
	managedHreflangTags.clear();
	for (const lang of currentHreflangTags) {
		managedHreflangTags.add(lang);
	}
}

function applyHeadConfigForRoute(matchId: string, config: HeadConfig): void {
	const oldSelectors = headByRoute.get(matchId) ?? new Set<string>();

	const tracked = new Set<string>();
	const hreflangTracked = new Set<string>();

	applyHeadFields(config, tracked, hreflangTracked);

	/* Remove selectors that the route no longer produces */
	for (const sel of oldSelectors) {
		if (!tracked.has(sel) && !sel.startsWith(CSS_MARKER_PREFIX)) {
			removeBySelector(sel);
			managedMetaTags.delete(sel);
		}
	}

	/* CSS lifecycle: reconcile CSS elements for this route */
	applyCssForRoute(matchId, config);

	headByRoute.set(matchId, tracked);
	for (const sel of tracked) {
		managedMetaTags.add(sel);
	}
}

function applyHeadFields(config: HeadConfig, tracked: Set<string>, hreflangTracked: Set<string>): void {
	if (config.title !== undefined) {
		document.title = config.title;
		tracked.add(TITLE_MARKER);
	}

	if (config.description !== undefined) {
		upsertMeta("name", "description", config.description, tracked);
	}

	if (config.keywords !== undefined) {
		upsertMeta("name", "keywords", config.keywords, tracked);
	}

	if (config.robots) {
		upsertMeta("name", "robots", buildRobotsContent(config.robots), tracked);
	}

	if (config.canonical !== undefined) {
		upsertLink("canonical", config.canonical, tracked);
	}

	/* OG images — top-level head.images + openGraph.images both produce og:image (matching SSR) */
	const ogImages = [...(config.images ?? []), ...(config.openGraph?.images ?? [])];
	if (ogImages.length > 0) {
		const ogImgSels = [
			'meta[property="og:image"]',
			'meta[property="og:image:width"]',
			'meta[property="og:image:height"]',
			'meta[property="og:image:alt"]',
			'meta[property="og:image:type"]',
		];
		for (const sel of ogImgSels) removeBySelector(sel);
		for (const img of ogImages) {
			appendMeta("property", "og:image", img.url, tracked);
			if (img.width) appendMeta("property", "og:image:width", String(img.width), tracked);
			if (img.height) appendMeta("property", "og:image:height", String(img.height), tracked);
			if (img.alt) appendMeta("property", "og:image:alt", img.alt, tracked);
			if (img.type) appendMeta("property", "og:image:type", img.type, tracked);
		}
	}

	if (config.openGraph) {
		const og = config.openGraph;
		if (og.title) upsertMeta("property", "og:title", og.title, tracked);
		if (og.description) upsertMeta("property", "og:description", og.description, tracked);
		if (og.url) upsertMeta("property", "og:url", og.url, tracked);
		if (og.type) upsertMeta("property", "og:type", og.type, tracked);
		if (og.siteName) upsertMeta("property", "og:site_name", og.siteName, tracked);
		if (og.locale) upsertMeta("property", "og:locale", og.locale, tracked);
		if (og.alternateLocale) {
			const altSels = ['meta[property="og:locale:alternate"]'];
			for (const sel of altSels) removeBySelector(sel);
			for (const locale of og.alternateLocale) {
				appendMeta("property", "og:locale:alternate", locale, tracked);
			}
		}
		if (og.videos) {
			const ogVidSels = [
				'meta[property="og:video"]',
				'meta[property="og:video:secure_url"]',
				'meta[property="og:video:type"]',
				'meta[property="og:video:width"]',
				'meta[property="og:video:height"]',
			];
			for (const sel of ogVidSels) removeBySelector(sel);
			for (const video of og.videos) {
				appendMeta("property", "og:video", video.url, tracked);
				if (video.secureUrl) appendMeta("property", "og:video:secure_url", video.secureUrl, tracked);
				if (video.type) appendMeta("property", "og:video:type", video.type, tracked);
				if (video.width) appendMeta("property", "og:video:width", String(video.width), tracked);
				if (video.height) appendMeta("property", "og:video:height", String(video.height), tracked);
			}
		}
		if (og.audio) {
			const ogAudioSels = [
				'meta[property="og:audio"]',
				'meta[property="og:audio:secure_url"]',
				'meta[property="og:audio:type"]',
			];
			for (const sel of ogAudioSels) removeBySelector(sel);
			for (const audio of og.audio) {
				appendMeta("property", "og:audio", audio.url, tracked);
				if (audio.secureUrl) appendMeta("property", "og:audio:secure_url", audio.secureUrl, tracked);
				if (audio.type) appendMeta("property", "og:audio:type", audio.type, tracked);
			}
		}
	}

	if (config.twitter) {
		const tw = config.twitter;
		if (tw.card) upsertMeta("name", "twitter:card", tw.card, tracked);
		if (tw.title) upsertMeta("name", "twitter:title", tw.title, tracked);
		if (tw.description) upsertMeta("name", "twitter:description", tw.description, tracked);
		if (tw.site) upsertMeta("name", "twitter:site", tw.site, tracked);
		if (tw.creator) upsertMeta("name", "twitter:creator", tw.creator, tracked);
		if (tw.images) {
			const twImgSels = ['meta[name="twitter:image"]', 'meta[name="twitter:image:alt"]'];
			for (const sel of twImgSels) removeBySelector(sel);
			for (const img of tw.images) {
				appendMeta("name", "twitter:image", img.url, tracked);
				if (img.alt) appendMeta("name", "twitter:image:alt", img.alt, tracked);
			}
		}
	}

	if (config.favicons) {
		const fav = config.favicons;
		if (fav.ico) {
			upsertFavicon("icon", fav.ico, { sizes: "any" }, tracked);
		}
		if (fav.svg) {
			upsertFavicon("icon", fav.svg, { type: "image/svg+xml" }, tracked);
		}
		if (fav.appleTouchIcon) {
			upsertFavicon("apple-touch-icon", fav.appleTouchIcon, {}, tracked);
		}
		const sizedKeys = ["96x96", "192x192", "512x512"] as const;
		for (const size of sizedKeys) {
			const href = fav[size];
			if (href !== undefined) {
				upsertFavicon("icon", href, { sizes: size, type: "image/png" }, tracked);
			}
		}
	}

	if (config.languages) {
		for (const [lang, href] of Object.entries(config.languages)) {
			upsertHreflang(lang, href, tracked, hreflangTracked);
		}
	}

	if (config.jsonLd) {
		upsertJsonLd(config.jsonLd, tracked);
	} else {
		/* Clean up SSR-rendered JSON-LD scripts not tracked in managedMetaTags */
		removeBySelector('script[type="application/ld+json"]');
	}

	/* head.meta fields (author, creator, publisher, viewport, apple*, etc.) */
	if (config.meta) {
		const m = config.meta;
		if (m.viewport !== undefined && m.viewport !== false) {
			upsertMeta("name", "viewport", m.viewport, tracked);
		}
		if (m.manifest !== undefined) {
			upsertLink("manifest", m.manifest, tracked);
		}
		if (m.appleMobileWebAppCapable !== undefined) {
			upsertMeta("name", "apple-mobile-web-app-capable", m.appleMobileWebAppCapable, tracked);
		}
		if (m.appleMobileWebAppStatusBarStyle !== undefined) {
			upsertMeta("name", "apple-mobile-web-app-status-bar-style", m.appleMobileWebAppStatusBarStyle, tracked);
		}
		if (m.appleMobileWebAppTitle !== undefined) {
			upsertMeta("name", "apple-mobile-web-app-title", m.appleMobileWebAppTitle, tracked);
		}
		const META_NAME_MAP: Record<string, string> = {
			applicationName: "application-name",
			mobileWebAppCapable: "mobile-web-app-capable",
		};
		const genericMetaKeys = [
			"applicationName",
			"author",
			"creator",
			"generator",
			"mobileWebAppCapable",
			"publisher",
		] as const;
		for (const key of genericMetaKeys) {
			const val = m[key];
			if (val !== undefined) {
				const name = META_NAME_MAP[key] ?? key;
				upsertMeta("name", name, val, tracked);
			}
		}
	}

	/* custom.meta → <meta> elements */
	if (config.custom?.meta) {
		for (const meta of config.custom.meta) {
			const name = meta["name"];
			const property = meta["property"];
			if (name) {
				upsertMeta("name", name, meta["content"] ?? "", tracked);
			} else if (property) {
				upsertMeta("property", property, meta["content"] ?? "", tracked);
			}
		}
	}

	/*
	 * custom.scripts intentionally NOT handled during SPA nav.
	 * Scripts are side-effectful (execute on DOM append) and not idempotent.
	 * SSR-rendered scripts persist; new page scripts load on full page nav.
	 */

	/* custom.links (non-stylesheet handled separately in CSS lifecycle) */
	if (config.custom?.links) {
		for (const link of config.custom.links) {
			if (link["rel"] === "stylesheet") continue;
			const rel = link["rel"] ?? "";
			const href = link["href"] ?? "";
			const sel = `link[rel="${escapeAttr(rel)}"][href="${escapeAttr(href)}"]`;
			tracked.add(sel);
			const existing = document.head.querySelector(sel);
			if (existing) continue;
			const el = document.createElement("link");
			for (const [k, v] of Object.entries(link)) {
				if (!isSafeAttrName(k)) continue;
				el.setAttribute(k, v);
			}
			document.head.appendChild(el);
		}
	}

	/* CSS lifecycle: head.css → <link rel="stylesheet"> */
	if (config.css !== undefined) {
		const cssItems = Array.isArray(config.css) ? config.css : [config.css];
		for (const href of cssItems) {
			tracked.add(`${CSS_MARKER_PREFIX}link:${href}`);
		}
	}

	/* custom.styles → <style> elements */
	if (config.custom?.styles) {
		for (let i = 0; i < config.custom.styles.length; i++) {
			tracked.add(`${CSS_MARKER_PREFIX}style:${i}`);
		}
	}

	/* custom.links with rel="stylesheet" tracked as CSS */
	if (config.custom?.links) {
		for (const link of config.custom.links) {
			if (link.rel === "stylesheet" && link.href) {
				tracked.add(`${CSS_MARKER_PREFIX}link:${link.href}`);
			}
		}
	}
}

function upsertMeta(attrName: "name" | "property", attrValue: string, content: string, tracked: Set<string>): void {
	const escaped = escapeAttr(attrValue);
	const selector = `meta[${attrName}="${escaped}"]`;
	tracked.add(selector);

	const existing = document.head.querySelector(selector);
	if (existing) {
		if (existing.getAttribute("content") !== content) {
			existing.setAttribute("content", content);
		}
		return;
	}

	const el = document.createElement("meta");
	el.setAttribute(attrName, attrValue);
	el.setAttribute("content", content);
	document.head.appendChild(el);
}

/* Always creates a new element — for multi-value OG properties (images, videos) */
function appendMeta(attrName: "name" | "property", attrValue: string, content: string, tracked: Set<string>): void {
	const escaped = escapeAttr(attrValue);
	const selector = `meta[${attrName}="${escaped}"]`;
	tracked.add(selector);

	const el = document.createElement("meta");
	el.setAttribute(attrName, attrValue);
	el.setAttribute("content", content);
	document.head.appendChild(el);
}

function upsertLink(rel: string, href: string, tracked: Set<string>): void {
	const selector = `link[rel="${escapeAttr(rel)}"]`;
	tracked.add(selector);

	const existing = document.head.querySelector(selector) as HTMLElement | null;
	if (existing) {
		if (existing.getAttribute("href") !== href) {
			existing.setAttribute("href", href);
		}
		return;
	}

	const el = document.createElement("link");
	el.setAttribute("rel", rel);
	el.setAttribute("href", href);
	document.head.appendChild(el);
}

function upsertFavicon(rel: string, href: string, attrs: Record<string, string>, tracked: Set<string>): void {
	const extraParts = Object.entries(attrs)
		.map(([k, v]) => `[${k}="${escapeAttr(v)}"]`)
		.join("");
	const selector = `link[rel="${escapeAttr(rel)}"]${extraParts}`;
	tracked.add(selector);

	const existing = document.head.querySelector(selector) as HTMLElement | null;
	if (existing) {
		if (existing.getAttribute("href") !== href) {
			existing.setAttribute("href", href);
		}
		return;
	}

	const el = document.createElement("link");
	el.setAttribute("rel", rel);
	el.setAttribute("href", href);
	for (const [k, v] of Object.entries(attrs)) {
		el.setAttribute(k, v);
	}
	document.head.appendChild(el);
}

function upsertHreflang(lang: string, href: string, selectorTracked: Set<string>, langTracked: Set<string>): void {
	langTracked.add(lang);

	const selector = `link[hreflang="${escapeAttr(lang)}"]`;
	selectorTracked.add(selector);
	const existing = document.head.querySelector(selector) as HTMLElement | null;
	if (existing) {
		if (existing.getAttribute("href") !== href) {
			existing.setAttribute("href", href);
		}
		return;
	}

	const el = document.createElement("link");
	el.setAttribute("rel", "alternate");
	el.setAttribute("hreflang", lang);
	el.setAttribute("href", href);
	document.head.appendChild(el);
}

function upsertJsonLd(items: Array<Record<string, unknown>>, tracked: Set<string>): void {
	const selector = 'script[type="application/ld+json"]';
	tracked.add(selector);

	/* Remove ALL existing JSON-LD scripts — SSR may render multiple */
	removeBySelector(selector);

	const content = items.length === 1 ? JSON.stringify(items[0]) : JSON.stringify(items);
	const el = document.createElement("script");
	el.setAttribute("type", "application/ld+json");
	el.textContent = content;
	document.head.appendChild(el);
}

function buildRobotsContent(robots: RobotsConfig): string {
	const directives: string[] = [];
	if (robots.index === false) directives.push("noindex");
	else if (robots.index === true) directives.push("index");
	if (robots.follow === false) directives.push("nofollow");
	else if (robots.follow === true) directives.push("follow");
	if (robots.noarchive) directives.push("noarchive");
	if (robots.noimageindex) directives.push("noimageindex");
	if (robots["max-snippet"] !== undefined) directives.push(`max-snippet:${robots["max-snippet"]}`);
	if (robots["max-image-preview"] !== undefined) directives.push(`max-image-preview:${robots["max-image-preview"]}`);
	if (robots["max-video-preview"] !== undefined) directives.push(`max-video-preview:${robots["max-video-preview"]}`);
	return directives.join(",");
}

const VALID_ATTR_RE = /^[a-zA-Z][a-zA-Z0-9-]*$/;

function isSafeAttrName(name: string): boolean {
	if (!VALID_ATTR_RE.test(name)) return false;
	return !name.toLowerCase().startsWith("on");
}

function escapeAttr(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\]/g, "\\]").replace(/\0/g, "\\0");
}

function buildMetaSelector(el: Element): string | null {
	const name = el.getAttribute("name");
	if (name) return `meta[name="${escapeAttr(name)}"]`;
	const prop = el.getAttribute("property");
	if (prop) return `meta[property="${escapeAttr(prop)}"]`;
	return null;
}

/* ── CSS lifecycle helpers ────────────────────────────────────────────── */

function addCssLinkForRoute(matchId: string, href: string): void {
	if (typeof document === "undefined") return;
	const ref = cssRefCount.get(href);
	if (ref) {
		ref.refCount++;
		const list = cssElementsByRoute.get(matchId) ?? [];
		list.push(ref.element);
		cssElementsByRoute.set(matchId, list);
		return;
	}

	/* Adopt SSR-rendered or untracked element if already in DOM */
	const existing = document.head.querySelector(
		`link[rel="stylesheet"][href="${escapeAttr(href)}"]`,
	) as HTMLElement | null;
	if (existing) {
		existing.setAttribute("data-flare-route", matchId);
		cssRefCount.set(href, { element: existing, refCount: 1 });
		const list = cssElementsByRoute.get(matchId) ?? [];
		list.push(existing);
		cssElementsByRoute.set(matchId, list);
		return;
	}

	const el = document.createElement("link");
	el.setAttribute("rel", "stylesheet");
	el.setAttribute("href", href);
	el.setAttribute("data-flare-route", matchId);
	document.head.appendChild(el);
	cssRefCount.set(href, { element: el, refCount: 1 });
	const list = cssElementsByRoute.get(matchId) ?? [];
	list.push(el);
	cssElementsByRoute.set(matchId, list);
}

function addCssStyleForRoute(matchId: string, children: string): void {
	if (typeof document === "undefined") return;
	const el = document.createElement("style");
	const meta = document.querySelector?.('meta[name="csp-nonce"]');
	const tagged = document.querySelector?.("script[nonce], style[nonce]") as HTMLElement | null;
	const nonce = meta?.getAttribute("content") || tagged?.nonce || tagged?.getAttribute("nonce") || "";
	if (nonce) {
		el.setAttribute("nonce", nonce);
		el.nonce = nonce;
	}
	el.setAttribute("data-flare-route", matchId);
	el.textContent = children;
	document.head.appendChild(el);
	const list = cssElementsByRoute.get(matchId) ?? [];
	list.push(el);
	cssElementsByRoute.set(matchId, list);
}

function applyCssForRoute(matchId: string, config: HeadConfig): void {
	/* Snapshot old elements before adding new ones */
	const oldElements = cssElementsByRoute.get(matchId) ?? [];
	cssElementsByRoute.delete(matchId);

	/* ADD new CSS elements first — increments refcounts so shared stylesheets survive */
	if (config.css !== undefined) {
		const cssItems = Array.isArray(config.css) ? config.css : [config.css];
		for (const href of cssItems) {
			addCssLinkForRoute(matchId, href);
		}
	}

	if (config.custom?.styles) {
		for (const style of config.custom.styles) {
			addCssStyleForRoute(matchId, style.children);
		}
	}

	if (config.custom?.links) {
		for (const link of config.custom.links) {
			if (link.rel === "stylesheet" && link.href) {
				addCssLinkForRoute(matchId, link.href);
			}
		}
	}

	/* THEN decrement old refcounts — shared elements stay because new refs were added above */
	for (const el of oldElements) {
		const href = el.getAttribute("href");
		if (href && el.getAttribute("rel") === "stylesheet") {
			const ref = cssRefCount.get(href);
			if (ref) {
				ref.refCount--;
				if (ref.refCount <= 0) {
					ref.element.remove();
					cssRefCount.delete(href);
				}
				continue;
			}
		}
		el.remove();
	}
}

function removeCssForRoute(routeId: string): void {
	const elements = cssElementsByRoute.get(routeId);
	if (!elements) return;

	for (const el of elements) {
		const href = el.getAttribute("href");
		/* Refcounted stylesheet links */
		if (href && el.getAttribute("rel") === "stylesheet") {
			const ref = cssRefCount.get(href);
			if (ref) {
				ref.refCount--;
				if (ref.refCount <= 0) {
					ref.element.remove();
					cssRefCount.delete(href);
				}
				continue;
			}
		}
		/* <style> elements or untracked links — just remove */
		el.remove();
	}
	cssElementsByRoute.delete(routeId);
}

function removeBySelector(selector: string): void {
	if (typeof document === "undefined") return;
	document.head.querySelectorAll(selector).forEach((el) => {
		el.remove();
	});
}
