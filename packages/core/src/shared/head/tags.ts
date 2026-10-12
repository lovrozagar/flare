import type { HeadConfig, HeadScript, SeoImage } from "../route-builder/types.ts";

type Tag = { tag: "title" | "meta" | "link" | "script" | "style"; props: Record<string, string | boolean> };

// One head element for Solid's useHead. Values are raw: Solid escapes them on the server and sets DOM properties
// on the client. `children` is the element text, `true` an attribute with no value, and `false` an attribute
// that is not written. `key` is semantic, so the server's `data-dh` identity is the one the client computes,
// and Solid adopts, keeps, and removes these exact elements (B83).
export type HeadTag = Tag & { key: string };

export type HeadTagOptions = { nonce?: string; appStylesheet?: string };

type Media = { url: string; type?: string; secureUrl?: string; width?: number; height?: number };

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

// The order is the server's document order, and the client applies the same list (B83).
export function headTags(head: HeadConfig, options: HeadTagOptions = {}): HeadTag[] {
	const tags: Tag[] = [
		...textTag(head.title),
		...metaName("description", head.description),
		...canonical(head.canonical),
		...metaName("keywords", head.keywords),
		...stylesheets(head.css, options.appStylesheet),
		...languages(head.languages),
		...imageList(head.images),
		...graph(head.openGraph),
		...twitter(head.twitter),
		...faviconTags(head.favicons),
		...robotTags(head.robots),
		...metaTags(head.meta),
		...jsonLd(head.jsonLd, options.nonce),
		...customTags(head.custom, options.nonce),
	];
	const seen = new Map<string, number>();
	return tags.map((tag) => {
		if (tag.tag === "title") return { ...tag, key: "title" };
		const base = identity(tag);
		const occurrence = seen.get(base) ?? 0;
		seen.set(base, occurrence + 1);
		return { ...tag, key: `${base}:${occurrence}` };
	});
}

// What a tag is, never where it sits, so adding a tag earlier in the next merge leaves the others alone. Two
// equal tags are told apart by their occurrence (dx/head.md).
function identity(tag: Tag): string {
	const props = tag.props;
	if (tag.tag === "meta") return `meta:${String(props.name ?? props.property ?? props["http-equiv"] ?? props.charset)}`;
	if (tag.tag === "link") return `link:${String(props.rel)}:${String(props.hreflang ?? props.href)}`;
	return `${tag.tag}:${typeof props.src === "string" ? props.src : hash(String(props.children))}`;
}

// FNV-1a, base 36. A short stable name for a script, style, or JSON-LD body.
function hash(text: string): string {
	let value = 0x811c9dc5;
	for (let index = 0; index < text.length; index += 1) {
		value ^= text.charCodeAt(index);
		value = Math.imul(value, 0x01000193);
	}
	return (value >>> 0).toString(36);
}

const list = <T>(value: readonly T[] | undefined): T[] => (value ? [...value] : []);

function textTag(value: string | undefined): Tag[] {
	return value ? [{ tag: "title", props: { children: value } }] : [];
}

function metaName(name: string, content: unknown): Tag[] {
	return typeof content === "string" ? [{ tag: "meta", props: { name, content } }] : [];
}

function property(name: string, content: string): Tag {
	return { tag: "meta", props: { property: name, content } };
}

function canonical(url: string | undefined): Tag[] {
	if (!url) return [];
	if (!url.startsWith("https://")) throw new Error("canonical");
	return [{ tag: "link", props: { rel: "canonical", href: url } }];
}

function stylesheets(css: HeadConfig["css"], app: string | undefined): Tag[] {
	const hrefs = css === undefined ? [] : Array.isArray(css) ? css : [css];
	const routes = hrefs.filter((href) => !href.trim().toLowerCase().startsWith("javascript:")).map(sheet);
	return [...(app ? [sheet(app)] : []), ...routes];
}

const sheet = (href: string): Tag => ({ tag: "link", props: { rel: "stylesheet", href } });

function languages(map: Record<string, string> | undefined): Tag[] {
	if (!map) return [];
	return Object.entries(map).map(([hreflang, href]) => ({ tag: "link", props: { rel: "alternate", hreflang, href } }));
}

function imageList(images: readonly SeoImage[] | undefined): Tag[] {
	return list(images).flatMap(imageTags);
}

function imageTags(image: SeoImage): Tag[] {
	if (image.url.trim().toLowerCase().startsWith("javascript:")) return [];
	return [
		property("og:image", image.url),
		...(image.alt ? [property("og:image:alt", image.alt)] : []),
		...(image.width !== undefined ? [property("og:image:width", String(image.width))] : []),
		...(image.height !== undefined ? [property("og:image:height", String(image.height))] : []),
		...(image.type ? [property("og:image:type", image.type)] : []),
	];
}

function graph(og: HeadConfig["openGraph"]): Tag[] {
	if (!og) return [];
	return [
		property("og:type", typeof og.type === "string" ? og.type : "website"),
		...metaProperty("og:title", og.title),
		...metaProperty("og:description", og.description),
		...metaProperty("og:url", og.url),
		...metaProperty("og:site_name", og.siteName),
		...metaProperty("og:locale", og.locale),
		...list(og.alternateLocale as readonly string[] | undefined).map((locale) =>
			property("og:locale:alternate", locale),
		),
		...imageList(og.images as readonly SeoImage[] | undefined),
		...media("og:audio", og.audio as readonly Media[] | undefined, ["type", "secureUrl"]),
		...media("og:video", og.videos as readonly Media[] | undefined, ["width", "height", "type", "secureUrl"]),
	];
}

function metaProperty(name: string, content: unknown): Tag[] {
	return typeof content === "string" ? [property(name, content)] : [];
}

function media(prefix: string, items: readonly Media[] | undefined, fields: readonly string[]): Tag[] {
	return list(items).flatMap((item) => {
		const tags = [property(prefix, item.url)];
		for (const field of fields) {
			const value = item[field as keyof Media];
			if (value !== undefined)
				tags.push(property(`${prefix}:${field === "secureUrl" ? "secure_url" : field}`, String(value)));
		}
		return tags;
	});
}

function twitter(card: HeadConfig["twitter"]): Tag[] {
	if (!card) return [];
	return [
		...metaName("twitter:card", typeof card.card === "string" ? card.card : "summary"),
		...metaName("twitter:site", card.site),
		...metaName("twitter:creator", card.creator),
		...metaName("twitter:title", card.title),
		...metaName("twitter:description", card.description),
		...list(card.images as ReadonlyArray<{ url: string; alt?: string }> | undefined).flatMap((image) => [
			...metaName("twitter:image", image.url),
			...(image.alt ? metaName("twitter:image:alt", image.alt) : []),
		]),
	];
}

function faviconTags(icons: HeadConfig["favicons"]): Tag[] {
	if (!icons) return [];
	return FAVICONS.flatMap(([key, rel, type, sizes]): Tag[] => {
		const href = icons[key];
		if (!href) return [];
		const props: Record<string, string> = { rel, href };
		if (type) props.type = type;
		if (sizes) props.sizes = sizes;
		return [{ tag: "link", props }];
	});
}

function robotTags(value: HeadConfig["robots"]): Tag[] {
	if (!value) return [];
	const tokens = [value.index === false ? "noindex" : "index", value.follow === false ? "nofollow" : "follow"];
	if (value.noarchive) tokens.push("noarchive");
	if (value.noimageindex) tokens.push("noimageindex");
	if (typeof value["max-image-preview"] === "string") tokens.push(`max-image-preview:${value["max-image-preview"]}`);
	if (typeof value["max-snippet"] === "number") tokens.push(`max-snippet:${value["max-snippet"]}`);
	if (typeof value["max-video-preview"] === "number") tokens.push(`max-video-preview:${value["max-video-preview"]}`);
	return [{ tag: "meta", props: { name: "robots", content: tokens.join(", ") } }];
}

// `viewport: false` removes a parent viewport: only a string writes the tag (B83).
function metaTags(value: HeadConfig["meta"]): Tag[] {
	if (!value) return [];
	const charset: Tag[] = typeof value.charset === "string" ? [{ tag: "meta", props: { charset: value.charset } }] : [];
	const viewport = typeof value.viewport === "string" ? metaName("viewport", value.viewport) : [];
	const names = META_NAMES.flatMap(([key, name]) => metaName(name, value[key]));
	const manifest: Tag[] =
		typeof value.manifest === "string" && value.manifest
			? [{ tag: "link", props: { rel: "manifest", href: value.manifest } }]
			: [];
	return [...charset, ...viewport, ...names, ...manifest];
}

function jsonLd(blocks: HeadConfig["jsonLd"], nonce: string | undefined): Tag[] {
	return list(blocks).map((block) => ({
		tag: "script",
		props: { type: "application/ld+json", ...nonceProp(nonce), children: keepOpen(JSON.stringify(block), "script") },
	}));
}

function customTags(custom: HeadConfig["custom"], nonce: string | undefined): Tag[] {
	if (!custom) return [];
	return [
		...list(custom.links).map((link): Tag => ({ tag: "link", props: allowed(link) })),
		...list(custom.meta).map((entry): Tag => ({ tag: "meta", props: allowed(entry) })),
		...list(custom.scripts).flatMap((script) => scriptTag(script, nonce)),
		...list(custom.styles).map((style): Tag => ({
			tag: "style",
			props: { ...nonceProp(nonce), children: keepOpen(style.children, "style") },
		})),
	];
}

// An external script carries no nonce, and `extra.nonce` is ignored (dx/server.md). `nonce: false` stops Solid
// from stamping the request nonce on it.
function scriptTag(script: HeadScript, nonce: string | undefined): Tag[] {
	if (script.src !== undefined && script.children !== undefined) throw new Error("src and children");
	if (script.src !== undefined) {
		const props: Record<string, string | boolean> = { src: script.src };
		if (script.async) props.async = true;
		return [{ tag: "script", props: { ...props, ...allowed(script.extra, true), nonce: false } }];
	}
	if (script.children === undefined) return [];
	return [{ tag: "script", props: { ...nonceProp(nonce), children: keepOpen(script.children, "script") } }];
}

const nonceProp = (nonce: string | undefined): Record<string, string> => (nonce ? { nonce } : {});

// An attribute whose name starts with `on`, in any case, is dropped (B83).
function allowed(record: Record<string, string> | undefined, skipNonce = false): Record<string, string> {
	if (!record) return {};
	return Object.fromEntries(
		Object.entries(record).filter(([name]) => allowedName(name) && !(skipNonce && name === "nonce")),
	);
}

function allowedName(name: string): boolean {
	if (name.toLowerCase().startsWith("on")) return false;
	return NAME.test(name) || DATA.test(name);
}

// A case-insensitive `</script` or `</style` in the text is rewritten so it cannot close the tag (B83). The client
// sets text as a DOM property, where `<\/` reads the same.
function keepOpen(value: string, tag: "script" | "style"): string {
	return value.replaceAll(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}
