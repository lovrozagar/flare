import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	applyHeadConfig,
	applyPerRouteHeads,
	clearRouteTracking,
	initRouteHierarchy,
} from "../../../src/head-client/index.ts";

/**
 * Enhanced mock DOM that supports multiple elements with identical attributes.
 * Uses array storage with auto-incrementing IDs for element identity.
 */
function createMockDocument() {
	let nextId = 0;
	const elements: Array<{
		attrs: Record<string, string>;
		id: number;
		tag: string;
		textContent: string;
	}> = [];
	let titleValue = "";

	type MockEl = {
		attrs: Record<string, string>;
		getAttribute: (name: string) => string | null;
		id: number;
		innerHTML: string;
		remove: () => void;
		setAttribute: (name: string, value: string) => void;
		tag: string;
		textContent: string;
	};

	function makeEl(tag: string): MockEl {
		const elId = nextId++;
		const el: MockEl = {
			attrs: {},
			getAttribute(name: string) {
				return this.attrs[name] ?? null;
			},
			id: elId,
			get innerHTML() {
				return this.textContent;
			},
			set innerHTML(v: string) {
				this.textContent = v;
			},
			remove() {
				const idx = elements.findIndex((e) => e.id === elId);
				if (idx >= 0) elements.splice(idx, 1);
			},
			setAttribute(name: string, value: string) {
				this.attrs[name] = value;
			},
			tag,
			textContent: "",
		};
		return el;
	}

	function matchesSelector(el: { tag: string; attrs: Record<string, string> }, selector: string): boolean {
		const tagMatch = selector.match(/^(\w+)/);
		if (tagMatch && tagMatch[1] !== el.tag) return false;

		const attrMatches = [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
		for (const m of attrMatches) {
			const attrName = m[1] ?? "";
			const attrValue = m[2];
			if (attrValue !== undefined) {
				if (el.attrs[attrName] !== attrValue) return false;
			} else {
				if (!(attrName in el.attrs)) return false;
			}
		}
		return true;
	}

	const head = {
		appendChild(el: MockEl) {
			elements.push(el);
		},
		querySelector(selector: string): MockEl | null {
			for (const el of elements) {
				if (matchesSelector(el, selector)) return el as MockEl;
			}
			return null;
		},
		querySelectorAll(selector: string) {
			const result: MockEl[] = [];
			for (const el of elements) {
				if (matchesSelector(el, selector)) result.push(el as MockEl);
			}
			return {
				forEach(fn: (el: unknown) => void) {
					result.forEach(fn);
				},
				[Symbol.iterator]() {
					return result[Symbol.iterator]();
				},
				length: result.length,
			};
		},
	};

	return {
		createElement(tag: string) {
			return makeEl(tag);
		},
		elements,
		head,
		get title() {
			return titleValue;
		},
		set title(v: string) {
			titleValue = v;
		},
	};
}

let mockDoc: ReturnType<typeof createMockDocument>;

beforeEach(() => {
	mockDoc = createMockDocument();
	globalThis.document = mockDoc as unknown as Document;
	clearRouteTracking();
});

afterEach(() => {
	delete (globalThis as Record<string, unknown>).document;
});

/* ── Bug 10: og:image:type not handled during SPA navigation ───────── */

describe("Bug 10: OG image:type handling", () => {
	it("og:image:type tags created and cleaned up when updating OG images", () => {
		/* Client should create og:image:type when provided */
		applyHeadConfig({
			openGraph: {
				images: [{ type: "image/webp", url: "https://old.webp" }],
			},
		});
		expect(mockDoc.head.querySelector('meta[property="og:image:type"]')).not.toBeNull();
		expect(mockDoc.head.querySelector('meta[property="og:image:type"]')?.attrs.content).toBe("image/webp");

		/* Navigate to page with no type field — og:image:type should be removed */
		applyHeadConfig({
			openGraph: {
				images: [{ url: "https://new.jpg" }],
			},
		});
		expect(mockDoc.head.querySelector('meta[property="og:image:type"]')).toBeNull();
	});

	it("og:image:type created and cleaned in per-route heads path", () => {
		initRouteHierarchy(["root", "page1"]);
		applyPerRouteHeads([
			{ head: {}, matchId: "root" },
			{
				head: {
					openGraph: {
						images: [{ type: "image/png", url: "https://product.png" }],
					},
				},
				matchId: "page1",
			},
		]);
		expect(mockDoc.head.querySelector('meta[property="og:image:type"]')?.attrs.content).toBe("image/png");

		/* Navigate to page2 with no image type */
		applyPerRouteHeads([
			{ head: {}, matchId: "root" },
			{
				head: {
					openGraph: {
						images: [{ url: "https://blog.jpg" }],
					},
				},
				matchId: "page2",
			},
		]);
		expect(mockDoc.head.querySelector('meta[property="og:image:type"]')).toBeNull();
	});

	it("SSR-rendered og:image:type cleaned up during first SPA navigation", () => {
		/* Simulate SSR: og:image:type already in DOM */
		const ssrTypeTag = mockDoc.createElement("meta");
		ssrTypeTag.setAttribute("property", "og:image:type");
		ssrTypeTag.setAttribute("content", "image/webp");
		mockDoc.head.appendChild(ssrTypeTag);

		expect(mockDoc.head.querySelector('meta[property="og:image:type"]')).not.toBeNull();

		/* SPA navigation updates OG images — should remove stale type tag */
		applyHeadConfig({
			openGraph: {
				images: [{ url: "https://new.jpg" }],
			},
		});
		expect(mockDoc.head.querySelector('meta[property="og:image:type"]')).toBeNull();
	});
});

/* ── Bug 11: JSON-LD stale scripts from SSR persist ────────────────── */

describe("Bug 11: JSON-LD stale scripts cleanup", () => {
	it("all old JSON-LD scripts removed before creating new one", () => {
		/* Simulate SSR: 3 separate JSON-LD scripts in the DOM */
		for (const data of [
			{ "@type": "WebPage", name: "Page1" },
			{ "@type": "Organization", name: "Acme" },
			{ "@type": "BreadcrumbList", itemListElement: [] },
		]) {
			const el = mockDoc.createElement("script");
			el.setAttribute("type", "application/ld+json");
			el.textContent = JSON.stringify(data);
			mockDoc.head.appendChild(el);
		}

		expect(mockDoc.head.querySelectorAll('script[type="application/ld+json"]').length).toBe(3);

		/* SPA navigation: new page has single JSON-LD item */
		applyHeadConfig({
			jsonLd: [{ "@type": "Article", name: "New Article" }],
		});

		/* All old scripts should be gone, only the new one remains */
		const remaining = mockDoc.head.querySelectorAll('script[type="application/ld+json"]');
		expect(remaining.length).toBe(1);
	});

	it("multiple SSR JSON-LD scripts cleaned when next head has none", () => {
		/* Pre-existing JSON-LD from SSR */
		for (const data of [{ "@type": "WebPage" }, { "@type": "Organization" }]) {
			const el = mockDoc.createElement("script");
			el.setAttribute("type", "application/ld+json");
			el.textContent = JSON.stringify(data);
			mockDoc.head.appendChild(el);
		}

		expect(mockDoc.head.querySelectorAll('script[type="application/ld+json"]').length).toBe(2);

		/* Navigate to page with no JSON-LD — managedMetaTags cleanup should remove them */
		applyHeadConfig({ description: "No JSON-LD page" });

		expect(mockDoc.head.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);
	});
});

/* ── Bug 12: Robots meta format inconsistency ──────────────────────── */

describe("Bug 12: Robots meta format consistency", () => {
	it("client robots uses comma-separated format without spaces (matching SSR)", () => {
		applyHeadConfig({ robots: { follow: false, index: false } });
		const el = mockDoc.head.querySelector('meta[name="robots"]');
		const content = el?.attrs.content ?? "";
		/* SSR head.ts renders directives.join(",") — no spaces. Client should match. */
		expect(content).not.toContain(", ");
		expect(content).toBe("noindex,nofollow");
	});

	it("multiple directives use comma-only separator", () => {
		applyHeadConfig({
			robots: {
				follow: true,
				index: true,
				"max-snippet": 150,
				noarchive: true,
			},
		});
		const el = mockDoc.head.querySelector('meta[name="robots"]');
		const content = el?.attrs.content ?? "";
		/* No ", " patterns — only "," between directives */
		expect(content.includes(", ")).toBe(false);
		expect(content).toContain("index,");
	});
});

/* ── Bug 19: OG video/audio, twitter images, og:locale:alternate not handled ── */

describe("Bug 19: OG video tags created and cleaned during SPA nav", () => {
	it("og:video meta tags created from openGraph.videos", () => {
		applyHeadConfig({
			openGraph: {
				videos: [
					{
						height: 720,
						secureUrl: "https://example.com/video.mp4",
						type: "video/mp4",
						url: "https://example.com/video.mp4",
						width: 1280,
					},
				],
			},
		});
		expect(mockDoc.head.querySelector('meta[property="og:video"]')?.attrs.content).toBe(
			"https://example.com/video.mp4",
		);
		expect(mockDoc.head.querySelector('meta[property="og:video:secure_url"]')?.attrs.content).toBe(
			"https://example.com/video.mp4",
		);
		expect(mockDoc.head.querySelector('meta[property="og:video:type"]')?.attrs.content).toBe("video/mp4");
		expect(mockDoc.head.querySelector('meta[property="og:video:width"]')?.attrs.content).toBe("1280");
		expect(mockDoc.head.querySelector('meta[property="og:video:height"]')?.attrs.content).toBe("720");
	});

	it("og:video tags cleaned when navigating to page without videos", () => {
		applyHeadConfig({
			openGraph: {
				videos: [{ type: "video/mp4", url: "https://example.com/video.mp4" }],
			},
		});
		expect(mockDoc.head.querySelector('meta[property="og:video"]')).not.toBeNull();

		applyHeadConfig({ openGraph: { title: "No Videos" } });
		expect(mockDoc.head.querySelector('meta[property="og:video"]')).toBeNull();
		expect(mockDoc.head.querySelector('meta[property="og:video:type"]')).toBeNull();
	});
});

describe("Bug 19: OG audio tags created and cleaned during SPA nav", () => {
	it("og:audio meta tags created from openGraph.audio", () => {
		applyHeadConfig({
			openGraph: {
				audio: [
					{
						secureUrl: "https://example.com/song.mp3",
						type: "audio/mpeg",
						url: "https://example.com/song.mp3",
					},
				],
			},
		});
		expect(mockDoc.head.querySelector('meta[property="og:audio"]')?.attrs.content).toBe("https://example.com/song.mp3");
		expect(mockDoc.head.querySelector('meta[property="og:audio:secure_url"]')?.attrs.content).toBe(
			"https://example.com/song.mp3",
		);
		expect(mockDoc.head.querySelector('meta[property="og:audio:type"]')?.attrs.content).toBe("audio/mpeg");
	});
});

describe("Bug 19: Twitter image tags created and cleaned during SPA nav", () => {
	it("twitter:image meta tags created from twitter.images", () => {
		applyHeadConfig({
			twitter: {
				card: "summary_large_image",
				images: [{ alt: "Hero image", url: "https://example.com/hero.jpg" }],
			},
		});
		expect(mockDoc.head.querySelector('meta[name="twitter:image"]')?.attrs.content).toBe(
			"https://example.com/hero.jpg",
		);
		expect(mockDoc.head.querySelector('meta[name="twitter:image:alt"]')?.attrs.content).toBe("Hero image");
	});

	it("twitter:image tags cleaned when navigating to page without images", () => {
		applyHeadConfig({
			twitter: {
				card: "summary_large_image",
				images: [{ url: "https://example.com/hero.jpg" }],
			},
		});
		expect(mockDoc.head.querySelector('meta[name="twitter:image"]')).not.toBeNull();

		applyHeadConfig({ twitter: { card: "summary" } });
		expect(mockDoc.head.querySelector('meta[name="twitter:image"]')).toBeNull();
	});
});

describe("Bug 19: OG locale:alternate created and cleaned during SPA nav", () => {
	it("og:locale:alternate tags created from openGraph.alternateLocale", () => {
		applyHeadConfig({
			openGraph: {
				alternateLocale: ["fr_FR", "de_DE"],
				locale: "en_US",
			},
		});
		const tags = mockDoc.head.querySelectorAll('meta[property="og:locale:alternate"]');
		expect(tags.length).toBe(2);
	});

	it("og:locale:alternate tags cleaned when navigating away", () => {
		applyHeadConfig({
			openGraph: {
				alternateLocale: ["fr_FR"],
				locale: "en_US",
			},
		});
		expect(mockDoc.head.querySelectorAll('meta[property="og:locale:alternate"]').length).toBe(1);

		applyHeadConfig({ openGraph: { locale: "en_US" } });
		expect(mockDoc.head.querySelectorAll('meta[property="og:locale:alternate"]').length).toBe(0);
	});
});

/* ── Bug 22: Top-level head.images not handled during SPA nav ─────── */

describe("Bug 22: Top-level head.images handling", () => {
	it("top-level images creates og:image tags", () => {
		applyHeadConfig({
			images: [
				{
					alt: "Hero",
					height: 630,
					type: "image/jpeg",
					url: "https://example.com/hero.jpg",
					width: 1200,
				},
			],
		});
		expect(mockDoc.head.querySelector('meta[property="og:image"]')?.attrs.content).toBe("https://example.com/hero.jpg");
		expect(mockDoc.head.querySelector('meta[property="og:image:width"]')?.attrs.content).toBe("1200");
		expect(mockDoc.head.querySelector('meta[property="og:image:height"]')?.attrs.content).toBe("630");
		expect(mockDoc.head.querySelector('meta[property="og:image:type"]')?.attrs.content).toBe("image/jpeg");
		expect(mockDoc.head.querySelector('meta[property="og:image:alt"]')?.attrs.content).toBe("Hero");
	});

	it("top-level images cleaned when navigating to page without images", () => {
		applyHeadConfig({
			images: [{ url: "https://example.com/hero.jpg" }],
		});
		expect(mockDoc.head.querySelector('meta[property="og:image"]')).not.toBeNull();

		applyHeadConfig({ description: "No images page" });
		expect(mockDoc.head.querySelector('meta[property="og:image"]')).toBeNull();
	});

	it("top-level images combined with openGraph.images", () => {
		applyHeadConfig({
			images: [{ url: "https://example.com/top.jpg" }],
			openGraph: {
				images: [{ url: "https://example.com/og.jpg" }],
			},
		});
		const allImgs = mockDoc.head.querySelectorAll('meta[property="og:image"]');
		expect(allImgs.length).toBe(2);
	});
});

/* ── Bug 28: head.meta fields not handled during SPA navigation ───── */

describe("Bug 28: head.meta fields during SPA nav", () => {
	it("author meta tag created from head.meta.author", () => {
		applyHeadConfig({
			meta: { author: "Alice" },
		});
		expect(mockDoc.head.querySelector('meta[name="author"]')?.attrs.content).toBe("Alice");
	});

	it("author meta tag updated on SPA nav", () => {
		applyHeadConfig({ meta: { author: "Alice" } });
		applyHeadConfig({ meta: { author: "Bob" } });
		expect(mockDoc.head.querySelector('meta[name="author"]')?.attrs.content).toBe("Bob");
	});

	it("author meta tag cleaned when nav to page without author", () => {
		applyHeadConfig({ meta: { author: "Alice" } });
		expect(mockDoc.head.querySelector('meta[name="author"]')).not.toBeNull();

		applyHeadConfig({ description: "No meta" });
		expect(mockDoc.head.querySelector('meta[name="author"]')).toBeNull();
	});

	it("generic meta keys use correct HTML name mapping", () => {
		applyHeadConfig({
			meta: {
				applicationName: "My App",
				creator: "Creator Co",
				generator: "Flare",
				mobileWebAppCapable: "yes",
				publisher: "Publisher Inc",
			},
		});
		expect(mockDoc.head.querySelector('meta[name="application-name"]')?.attrs.content).toBe("My App");
		expect(mockDoc.head.querySelector('meta[name="creator"]')?.attrs.content).toBe("Creator Co");
		expect(mockDoc.head.querySelector('meta[name="generator"]')?.attrs.content).toBe("Flare");
		expect(mockDoc.head.querySelector('meta[name="mobile-web-app-capable"]')?.attrs.content).toBe("yes");
		expect(mockDoc.head.querySelector('meta[name="publisher"]')?.attrs.content).toBe("Publisher Inc");
	});

	it("apple meta fields handled during SPA nav", () => {
		applyHeadConfig({
			meta: {
				appleMobileWebAppCapable: "yes",
				appleMobileWebAppStatusBarStyle: "black-translucent",
				appleMobileWebAppTitle: "My PWA",
			},
		});
		expect(mockDoc.head.querySelector('meta[name="apple-mobile-web-app-capable"]')?.attrs.content).toBe("yes");
		expect(mockDoc.head.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.attrs.content).toBe(
			"black-translucent",
		);
		expect(mockDoc.head.querySelector('meta[name="apple-mobile-web-app-title"]')?.attrs.content).toBe("My PWA");
	});

	it("viewport meta handled during SPA nav", () => {
		applyHeadConfig({
			meta: { viewport: "width=device-width, initial-scale=1" },
		});
		expect(mockDoc.head.querySelector('meta[name="viewport"]')?.attrs.content).toBe(
			"width=device-width, initial-scale=1",
		);
	});

	it("manifest link handled during SPA nav", () => {
		applyHeadConfig({
			meta: { manifest: "/manifest.json" },
		});
		expect(mockDoc.head.querySelector('link[rel="manifest"]')?.attrs.href).toBe("/manifest.json");
	});

	it("meta tags cleaned on SPA nav to page without meta", () => {
		applyHeadConfig({ meta: { author: "SSR Author", creator: "SSR Creator" } });
		expect(mockDoc.head.querySelector('meta[name="author"]')).not.toBeNull();
		expect(mockDoc.head.querySelector('meta[name="creator"]')).not.toBeNull();

		applyHeadConfig({ description: "No meta page" });
		expect(mockDoc.head.querySelector('meta[name="author"]')).toBeNull();
		expect(mockDoc.head.querySelector('meta[name="creator"]')).toBeNull();
	});
});

/* ── Bug 29: head.custom.meta/scripts/links (non-stylesheet) not handled ── */

describe("Bug 29: custom.meta during SPA nav", () => {
	it("custom meta tags created from head.custom.meta", () => {
		applyHeadConfig({
			custom: {
				meta: [
					{ content: "abc123", name: "google-site-verification" },
					{ content: "#ffffff", name: "theme-color" },
				],
			},
		});
		expect(mockDoc.head.querySelector('meta[name="google-site-verification"]')?.attrs.content).toBe("abc123");
		expect(mockDoc.head.querySelector('meta[name="theme-color"]')?.attrs.content).toBe("#ffffff");
	});

	it("custom meta tags cleaned on nav to page without custom.meta", () => {
		applyHeadConfig({
			custom: {
				meta: [{ content: "abc123", name: "google-site-verification" }],
			},
		});
		expect(mockDoc.head.querySelector('meta[name="google-site-verification"]')).not.toBeNull();

		applyHeadConfig({ description: "No custom meta" });
		expect(mockDoc.head.querySelector('meta[name="google-site-verification"]')).toBeNull();
	});
});

describe("Bug 29: custom.links (non-stylesheet) during SPA nav", () => {
	it("custom non-stylesheet links created from head.custom.links", () => {
		applyHeadConfig({
			custom: {
				links: [{ href: "https://fonts.googleapis.com", rel: "preconnect" }],
			},
		});
		expect(mockDoc.head.querySelector('link[rel="preconnect"]')?.attrs.href).toBe("https://fonts.googleapis.com");
	});

	it("custom non-stylesheet links cleaned on nav away", () => {
		applyHeadConfig({
			custom: {
				links: [{ href: "https://fonts.googleapis.com", rel: "preconnect" }],
			},
		});
		expect(mockDoc.head.querySelector('link[rel="preconnect"]')).not.toBeNull();

		applyHeadConfig({ description: "No custom links" });
		expect(mockDoc.head.querySelector('link[rel="preconnect"]')).toBeNull();
	});
});

/* ── Bug 30: Sized favicons not handled during SPA navigation ── */

describe("Bug 30: sized favicons during SPA nav", () => {
	it("sized favicon (96x96) created during SPA nav", () => {
		applyHeadConfig({
			favicons: { "96x96": "/icons/icon-96.png" },
		});
		const el = mockDoc.head.querySelector('link[rel="icon"][sizes="96x96"]');
		expect(el).not.toBeNull();
		expect(el?.attrs.href).toBe("/icons/icon-96.png");
		expect(el?.attrs.type).toBe("image/png");
	});

	it("all three sized favicons created", () => {
		applyHeadConfig({
			favicons: {
				"192x192": "/icons/icon-192.png",
				"512x512": "/icons/icon-512.png",
				"96x96": "/icons/icon-96.png",
			},
		});
		expect(mockDoc.head.querySelector('link[rel="icon"][sizes="96x96"]')?.attrs.href).toBe("/icons/icon-96.png");
		expect(mockDoc.head.querySelector('link[rel="icon"][sizes="192x192"]')?.attrs.href).toBe("/icons/icon-192.png");
		expect(mockDoc.head.querySelector('link[rel="icon"][sizes="512x512"]')?.attrs.href).toBe("/icons/icon-512.png");
	});

	it("sized favicons updated on SPA nav to different icons", () => {
		applyHeadConfig({
			favicons: { "96x96": "/icons/old-96.png" },
		});
		expect(mockDoc.head.querySelector('link[rel="icon"][sizes="96x96"]')?.attrs.href).toBe("/icons/old-96.png");

		applyHeadConfig({
			favicons: { "96x96": "/icons/new-96.png" },
		});
		expect(mockDoc.head.querySelector('link[rel="icon"][sizes="96x96"]')?.attrs.href).toBe("/icons/new-96.png");
	});

	it("sized favicons cleaned on nav to page without favicons", () => {
		applyHeadConfig({
			favicons: { "192x192": "/icons/icon-192.png", "96x96": "/icons/icon-96.png" },
		});
		expect(mockDoc.head.querySelector('link[rel="icon"][sizes="96x96"]')).not.toBeNull();
		expect(mockDoc.head.querySelector('link[rel="icon"][sizes="192x192"]')).not.toBeNull();

		applyHeadConfig({ description: "No favicons page" });
		expect(mockDoc.head.querySelector('link[rel="icon"][sizes="96x96"]')).toBeNull();
		expect(mockDoc.head.querySelector('link[rel="icon"][sizes="192x192"]')).toBeNull();
	});
});
