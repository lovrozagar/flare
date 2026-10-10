import type { HeadConfig, SeoImage } from "../route-builder/types.ts";

function escapeHtml(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const VALID_ATTR_RE = /^[a-zA-Z][a-zA-Z0-9-]*$/;

function isSafeAttrName(name: string): boolean {
	if (!VALID_ATTR_RE.test(name)) return false;
	if (name.length > 2 && name[0] === "o" && name[1] === "n") return false;
	if (name.length > 2 && name[0] === "O" && name[1] === "N") return false;
	return !name.toLowerCase().startsWith("on");
}

function renderOgImage(parts: string[], img: SeoImage): void {
	parts.push(`<meta property="og:image" content="${escapeAttr(img.url)}">`);
	if (img.width) parts.push(`<meta property="og:image:width" content="${img.width}">`);
	if (img.height) parts.push(`<meta property="og:image:height" content="${img.height}">`);
	if (img.type) parts.push(`<meta property="og:image:type" content="${escapeAttr(img.type)}">`);
	if (img.alt) parts.push(`<meta property="og:image:alt" content="${escapeAttr(img.alt)}">`);
}

export function renderHeadToHtml(head: HeadConfig, nonce: string): string {
	const parts: string[] = [];

	if (head.title !== undefined) {
		parts.push(`<title>${escapeHtml(head.title)}</title>`);
	}

	if (head.description !== undefined) {
		parts.push(`<meta name="description" content="${escapeAttr(head.description)}">`);
	}

	if (head.canonical !== undefined) {
		parts.push(`<link rel="canonical" href="${escapeAttr(head.canonical)}">`);
	}

	if (head.keywords !== undefined) {
		parts.push(`<meta name="keywords" content="${escapeAttr(head.keywords)}">`);
	}

	if (head.robots) {
		const directives: string[] = [];
		const r = head.robots;
		if (r.index === true) directives.push("index");
		if (r.index === false) directives.push("noindex");
		if (r.follow === true) directives.push("follow");
		if (r.follow === false) directives.push("nofollow");
		if (r.noarchive === true) directives.push("noarchive");
		if (r.noimageindex === true) directives.push("noimageindex");
		if (r["max-snippet"] !== undefined) directives.push(`max-snippet:${r["max-snippet"]}`);
		if (r["max-image-preview"] !== undefined) directives.push(`max-image-preview:${r["max-image-preview"]}`);
		if (r["max-video-preview"] !== undefined) directives.push(`max-video-preview:${r["max-video-preview"]}`);
		if (directives.length > 0) {
			parts.push(`<meta name="robots" content="${directives.join(",")}">`);
		}
	}

	if (head.meta) {
		const m = head.meta;
		if (m.charset !== undefined) {
			parts.push(`<meta charset="${escapeAttr(m.charset)}">`);
		}
		if (m.viewport !== undefined && m.viewport !== false) {
			parts.push(`<meta name="viewport" content="${escapeAttr(m.viewport)}">`);
		}
		if (m.manifest !== undefined) {
			parts.push(`<link rel="manifest" href="${escapeAttr(m.manifest)}">`);
		}
		if (m.appleMobileWebAppCapable !== undefined) {
			parts.push(`<meta name="apple-mobile-web-app-capable" content="${escapeAttr(m.appleMobileWebAppCapable)}">`);
		}
		if (m.appleMobileWebAppStatusBarStyle !== undefined) {
			parts.push(
				`<meta name="apple-mobile-web-app-status-bar-style" content="${escapeAttr(m.appleMobileWebAppStatusBarStyle)}">`,
			);
		}
		if (m.appleMobileWebAppTitle !== undefined) {
			parts.push(`<meta name="apple-mobile-web-app-title" content="${escapeAttr(m.appleMobileWebAppTitle)}">`);
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
				parts.push(`<meta name="${name}" content="${escapeAttr(val)}">`);
			}
		}
	}

	if (head.favicons) {
		const f = head.favicons;
		if (f.ico !== undefined) {
			parts.push(`<link rel="icon" href="${escapeAttr(f.ico)}" sizes="any">`);
		}
		if (f.svg !== undefined) {
			parts.push(`<link rel="icon" type="image/svg+xml" href="${escapeAttr(f.svg)}">`);
		}
		if (f.appleTouchIcon !== undefined) {
			parts.push(`<link rel="apple-touch-icon" href="${escapeAttr(f.appleTouchIcon)}">`);
		}
		const sizedKeys = ["96x96", "192x192", "512x512"] as const;
		for (const size of sizedKeys) {
			const href = f[size];
			if (href !== undefined) {
				parts.push(`<link rel="icon" type="image/png" sizes="${size}" href="${escapeAttr(href)}">`);
			}
		}
	}

	if (head.images) {
		for (const img of head.images) {
			renderOgImage(parts, img);
		}
	}

	if (head.openGraph) {
		const og = head.openGraph;
		if (og.title !== undefined) parts.push(`<meta property="og:title" content="${escapeAttr(og.title)}">`);
		if (og.description !== undefined)
			parts.push(`<meta property="og:description" content="${escapeAttr(og.description)}">`);
		if (og.type !== undefined) parts.push(`<meta property="og:type" content="${escapeAttr(og.type)}">`);
		if (og.url !== undefined) parts.push(`<meta property="og:url" content="${escapeAttr(og.url)}">`);
		if (og.siteName !== undefined) parts.push(`<meta property="og:site_name" content="${escapeAttr(og.siteName)}">`);
		if (og.locale !== undefined) parts.push(`<meta property="og:locale" content="${escapeAttr(og.locale)}">`);
		if (og.alternateLocale) {
			for (const locale of og.alternateLocale) {
				parts.push(`<meta property="og:locale:alternate" content="${escapeAttr(locale)}">`);
			}
		}
		if (og.images) {
			for (const img of og.images) {
				renderOgImage(parts, img);
			}
		}
		if (og.videos) {
			for (const video of og.videos) {
				parts.push(`<meta property="og:video" content="${escapeAttr(video.url)}">`);
				if (video.secureUrl)
					parts.push(`<meta property="og:video:secure_url" content="${escapeAttr(video.secureUrl)}">`);
				if (video.type) parts.push(`<meta property="og:video:type" content="${escapeAttr(video.type)}">`);
				if (video.width) parts.push(`<meta property="og:video:width" content="${video.width}">`);
				if (video.height) parts.push(`<meta property="og:video:height" content="${video.height}">`);
			}
		}
		if (og.audio) {
			for (const audio of og.audio) {
				parts.push(`<meta property="og:audio" content="${escapeAttr(audio.url)}">`);
				if (audio.secureUrl)
					parts.push(`<meta property="og:audio:secure_url" content="${escapeAttr(audio.secureUrl)}">`);
				if (audio.type) parts.push(`<meta property="og:audio:type" content="${escapeAttr(audio.type)}">`);
			}
		}
	}

	if (head.twitter) {
		const tw = head.twitter;
		if (tw.card !== undefined) parts.push(`<meta name="twitter:card" content="${escapeAttr(tw.card)}">`);
		if (tw.site !== undefined) parts.push(`<meta name="twitter:site" content="${escapeAttr(tw.site)}">`);
		if (tw.creator !== undefined) parts.push(`<meta name="twitter:creator" content="${escapeAttr(tw.creator)}">`);
		if (tw.title !== undefined) parts.push(`<meta name="twitter:title" content="${escapeAttr(tw.title)}">`);
		if (tw.description !== undefined)
			parts.push(`<meta name="twitter:description" content="${escapeAttr(tw.description)}">`);
		if (tw.images) {
			for (const img of tw.images) {
				parts.push(`<meta name="twitter:image" content="${escapeAttr(img.url)}">`);
				if (img.alt) parts.push(`<meta name="twitter:image:alt" content="${escapeAttr(img.alt)}">`);
			}
		}
	}

	if (head.languages) {
		for (const [lang, href] of Object.entries(head.languages)) {
			parts.push(`<link rel="alternate" hreflang="${escapeAttr(lang)}" href="${escapeAttr(href)}">`);
		}
	}

	if (head.jsonLd) {
		const items = Array.isArray(head.jsonLd) ? head.jsonLd : [head.jsonLd];
		for (const item of items) {
			const json = JSON.stringify(item).replace(/<\/script\b/gi, "<\\/script");
			parts.push(`<script type="application/ld+json" nonce="${escapeAttr(nonce)}">${json}</script>`);
		}
	}

	if (head.css !== undefined) {
		const cssItems = Array.isArray(head.css) ? head.css : [head.css];
		for (const href of cssItems) {
			parts.push(`<link rel="stylesheet" href="${escapeAttr(href)}">`);
		}
	}

	if (head.custom) {
		if (head.custom.links) {
			for (const link of head.custom.links) {
				let attrs = "";
				for (const [k, v] of Object.entries(link)) {
					if (isSafeAttrName(k)) {
						if (attrs) attrs += " ";
						attrs += `${k}="${escapeAttr(v)}"`;
					}
				}
				parts.push(`<link ${attrs}>`);
			}
		}
		if (head.custom.meta) {
			for (const meta of head.custom.meta) {
				let attrs = "";
				for (const [k, v] of Object.entries(meta)) {
					if (isSafeAttrName(k)) {
						if (attrs) attrs += " ";
						attrs += `${k}="${escapeAttr(v)}"`;
					}
				}
				parts.push(`<meta ${attrs}>`);
			}
		}
		if (head.custom.scripts) {
			for (const script of head.custom.scripts) {
				const attrs: string[] = [`nonce="${escapeAttr(nonce)}"`];
				if (script.async) attrs.push("async");
				if (script.type) attrs.push(`type="${escapeAttr(script.type)}"`);
				if (script.src) attrs.push(`src="${escapeAttr(script.src)}"`);
				if (script.extra) {
					for (const [k, v] of Object.entries(script.extra)) {
						if (isSafeAttrName(k)) attrs.push(`${k}="${escapeAttr(v)}"`);
					}
				}
				const children = (script.children ?? "").replace(/<\/script\b/gi, "<\\/script");
				parts.push(`<script ${attrs.join(" ")}>${children}</script>`);
			}
		}
		if (head.custom.styles) {
			for (const style of head.custom.styles) {
				const safeChildren = (style.children ?? "").replace(/<\/style\b/gi, "<\\/style");
				parts.push(`<style nonce="${escapeAttr(nonce)}">${safeChildren}</style>`);
			}
		}
	}

	return parts.join("");
}
