import { escapeAttr } from "./escape.ts";
import type { HeadConfig, HeadScript, SeoImage } from "../../shared/route-builder/types.ts";

// The route .head() result. The type lives beside the builder that returns it.
export type Head = HeadConfig;

type Media = { url: string; type?: string; secureUrl?: string; width?: number; height?: number };

export type HeadOptions = { nonce?: string; appStylesheet?: string };

const FAVICONS = [
	["ico", "icon", "", "any"],
	["svg", "icon", "image/svg+xml", ""],
	["appleTouchIcon", "apple-touch-icon", "", ""],
	["96x96", "icon", "image/png", "96x96"],
	["192x192", "icon", "image/png", "192x192"],
	["512x512", "icon", "image/png", "512x512"],
] as const;

const META_NAMES = [
	["applicationName", "application-name"],
	["author", "author"],
	["creator", "creator"],
	["publisher", "publisher"],
	["generator", "generator"],
	["appleMobileWebAppCapable", "apple-mobile-web-app-capable"],
	["appleMobileWebAppTitle", "apple-mobile-web-app-title"],
	["appleMobileWebAppStatusBarStyle", "apple-mobile-web-app-status-bar-style"],
	["mobileWebAppCapable", "mobile-web-app-capable"],
] as const;

const NAME = /^[a-zA-Z][a-zA-Z-]*$/;
const DATA = /^data-[a-zA-Z][a-zA-Z0-9-]*$/;

export function renderHead(head: Head, options: HeadOptions = {}): string {
	return [
		textTag("title", head.title),
		metaName("description", head.description),
		canonical(head.canonical),
		metaName("keywords", head.keywords),
		stylesheets(head.css, options.appStylesheet),
		links(head.languages),
		imageList(head.images),
		graph(head.openGraph),
		twitter(head.twitter),
		faviconTags(head.favicons),
		robotTags(head.robots),
		metaTags(head.meta),
		jsonLd(head.jsonLd, options.nonce),
		customTags(head.custom, options.nonce),
	].join("");
}

export function mergeHead(parent: Head, child: Head, replace = false): Head {
	if (replace) return child;
	const parentCustom = parent.custom ?? {};
	const childCustom = child.custom ?? {};
	return {
		title: pick(child.title, parent.title),
		description: pick(child.description, parent.description),
		keywords: pick(child.keywords, parent.keywords),
		canonical: pick(child.canonical, parent.canonical),
		css: pick(child.css, parent.css),
		languages: { ...parent.languages, ...child.languages },
		meta: { ...parent.meta, ...child.meta },
		robots: { ...parent.robots, ...child.robots },
		openGraph: { ...parent.openGraph, ...child.openGraph },
		twitter: { ...parent.twitter, ...child.twitter },
		favicons: { ...parent.favicons, ...child.favicons },
		images: [...list(parent.images), ...list(child.images)],
		jsonLd: [...list(parent.jsonLd), ...list(child.jsonLd)],
		custom: {
			links: [...list(parentCustom.links), ...list(childCustom.links)],
			meta: [...list(parentCustom.meta), ...list(childCustom.meta)],
			scripts: [...list(parentCustom.scripts), ...list(childCustom.scripts)],
			styles: [...list(parentCustom.styles), ...list(childCustom.styles)],
		},
	};
}

const pick = <T>(child: T | undefined, parent: T | undefined): T | undefined => (child === undefined ? parent : child);
const list = <T>(value: readonly T[] | undefined): T[] => (value ? [...value] : []);

function textTag(name: string, value: string | undefined): string {
	return value ? `<${name}>${escapeAttr(value)}</${name}>` : "";
}

function metaName(name: string, content: unknown): string {
	return typeof content === "string" ? `<meta name="${name}" content="${escapeAttr(content)}">` : "";
}

function property(name: string, content: string): string {
	return `<meta property="${name}" content="${escapeAttr(content)}">`;
}

function canonical(url: string | undefined): string {
	if (!url) return "";
	if (!url.startsWith("https://")) throw new Error("canonical");
	return `<link rel="canonical" href="${escapeAttr(url)}">`;
}

function stylesheets(css: Head["css"], app: string | undefined): string {
	const hrefs = css === undefined ? [] : Array.isArray(css) ? css : [css];
	const links = hrefs.filter((href) => !href.trim().toLowerCase().startsWith("javascript:")).map(sheet);
	return `${app ? sheet(app) : ""}${links.join("")}`;
}

const sheet = (href: string): string => `<link rel="stylesheet" href="${escapeAttr(href)}">`;

function links(map: Record<string, string> | undefined): string {
	if (!map) return "";
	return Object.entries(map)
		.map(([lang, href]) => `<link rel="alternate" hreflang="${escapeAttr(lang)}" href="${escapeAttr(href)}">`)
		.join("");
}

function imageList(images: readonly SeoImage[] | undefined): string {
	return list(images).map(imageTag).join("");
}

function imageTag(image: SeoImage): string {
	if (image.url.trim().toLowerCase().startsWith("javascript:")) return "";
	return [
		property("og:image", image.url),
		image.alt ? property("og:image:alt", image.alt) : "",
		image.width !== undefined ? property("og:image:width", String(image.width)) : "",
		image.height !== undefined ? property("og:image:height", String(image.height)) : "",
		image.type ? property("og:image:type", image.type) : "",
	].join("");
}

function graph(og: Head["openGraph"]): string {
	if (!og) return "";
	return [
		property("og:type", typeof og.type === "string" ? og.type : "website"),
		metaProperty("og:title", og.title),
		metaProperty("og:description", og.description),
		metaProperty("og:url", og.url),
		metaProperty("og:site_name", og.siteName),
		metaProperty("og:locale", og.locale),
		list(og.alternateLocale as readonly string[] | undefined)
			.map((locale) => property("og:locale:alternate", locale))
			.join(""),
		imageList(og.images as readonly SeoImage[] | undefined),
		media("og:audio", og.audio as readonly Media[] | undefined, ["type", "secureUrl"]),
		media("og:video", og.videos as readonly Media[] | undefined, ["width", "height", "type", "secureUrl"]),
	].join("");
}

function metaProperty(name: string, content: unknown): string {
	return typeof content === "string" ? property(name, content) : "";
}

function media(prefix: string, items: readonly Media[] | undefined, fields: readonly string[]): string {
	return list(items)
		.map((item) => {
			const tags = [property(prefix, item.url)];
			for (const field of fields) {
				const value = item[field as keyof Media];
				if (value !== undefined)
					tags.push(property(`${prefix}:${field === "secureUrl" ? "secure_url" : field}`, String(value)));
			}
			return tags.join("");
		})
		.join("");
}

function twitter(card: Head["twitter"]): string {
	if (!card) return "";
	return [
		metaName("twitter:card", typeof card.card === "string" ? card.card : "summary"),
		metaName("twitter:site", card.site),
		metaName("twitter:creator", card.creator),
		metaName("twitter:title", card.title),
		metaName("twitter:description", card.description),
		list(card.images as ReadonlyArray<{ url: string; alt?: string }> | undefined)
			.map(
				(image) =>
					`${metaName("twitter:image", image.url)}${image.alt ? metaName("twitter:image:alt", image.alt) : ""}`,
			)
			.join(""),
	].join("");
}

function faviconTags(icons: Head["favicons"]): string {
	if (!icons) return "";
	return FAVICONS.map(([key, rel, type, sizes]) => {
		const href = icons[key];
		if (!href) return "";
		const typeAttr = type ? ` type="${type}"` : "";
		const sizesAttr = sizes ? ` sizes="${sizes}"` : "";
		return `<link rel="${rel}" href="${escapeAttr(href)}"${typeAttr}${sizesAttr}>`;
	}).join("");
}

function robotTags(value: Head["robots"]): string {
	if (!value) return "";
	const tokens = [value.index === false ? "noindex" : "index", value.follow === false ? "nofollow" : "follow"];
	if (value.noarchive) tokens.push("noarchive");
	if (value.noimageindex) tokens.push("noimageindex");
	if (typeof value["max-image-preview"] === "string") tokens.push(`max-image-preview:${value["max-image-preview"]}`);
	if (typeof value["max-snippet"] === "number") tokens.push(`max-snippet:${value["max-snippet"]}`);
	if (typeof value["max-video-preview"] === "number") tokens.push(`max-video-preview:${value["max-video-preview"]}`);
	return `<meta name="robots" content="${tokens.join(", ")}">`;
}

function metaTags(value: Head["meta"]): string {
	if (!value) return "";
	const charset = typeof value.charset === "string" ? `<meta charset="${escapeAttr(value.charset)}">` : "";
	const viewport = typeof value.viewport === "string" ? metaName("viewport", value.viewport) : "";
	const names = META_NAMES.map(([key, name]) => metaName(name, value[key])).join("");
	const manifestHref = typeof value.manifest === "string" ? value.manifest : "";
	const manifest = manifestHref ? `<link rel="manifest" href="${escapeAttr(manifestHref)}">` : "";
	return `${charset}${viewport}${names}${manifest}`;
}

function jsonLd(blocks: Head["jsonLd"], nonce: string | undefined): string {
	return list(blocks)
		.map(
			(block) =>
				`<script type="application/ld+json"${nonceAttr(nonce)}>${keepOpen(JSON.stringify(block), "script")}</script>`,
		)
		.join("");
}

function customTags(custom: Head["custom"], nonce: string | undefined): string {
	if (!custom) return "";
	return [
		list(custom.links)
			.map((link) => `<link${attrs(link)}>`)
			.join(""),
		list(custom.meta)
			.map((entry) => `<meta${attrs(entry)}>`)
			.join(""),
		list(custom.scripts)
			.map((script) => scriptTag(script, nonce))
			.join(""),
		list(custom.styles)
			.map((style) => `<style${nonceAttr(nonce)}>${keepOpen(style.children, "style")}</style>`)
			.join(""),
	].join("");
}

function scriptTag(script: HeadScript, nonce: string | undefined): string {
	if (script.src !== undefined && script.children !== undefined) throw new Error("src and children");
	if (script.src !== undefined) {
		const asyncAttr = script.async ? " async" : "";
		return `<script src="${escapeAttr(script.src)}"${asyncAttr}${attrs(script.extra, true)}></script>`;
	}
	if (script.children === undefined) return "";
	return `<script${nonceAttr(nonce)}>${keepOpen(script.children, "script")}</script>`;
}

const nonceAttr = (nonce: string | undefined): string => (nonce ? ` nonce="${escapeAttr(nonce)}"` : "");

function attrs(record: Record<string, string> | undefined, skipNonce = false): string {
	if (!record) return "";
	return Object.entries(record)
		.filter(([name]) => allowedName(name) && !(skipNonce && name === "nonce"))
		.map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
		.join("");
}

function allowedName(name: string): boolean {
	if (name.toLowerCase().startsWith("on")) return false;
	return NAME.test(name) || DATA.test(name);
}

function keepOpen(value: string, tag: string): string {
	return value.replaceAll(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}
