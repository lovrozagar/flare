import { describe, expect, it } from "vitest";
import { renderHeadToHtml } from "../../../src/ssr/head.ts";

const NONCE = "test-nonce-123";

describe("renderHeadToHtml: escaping edge cases", () => {
	it("title with HTML entities", () => {
		const html = renderHeadToHtml({ title: '<script>alert("xss")</script>' }, NONCE);
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>alert");
	});

	it("title with newlines", () => {
		const html = renderHeadToHtml({ title: "Line1\nLine2" }, NONCE);
		expect(html).toContain("<title>Line1\nLine2</title>");
	});

	it("description with double quotes", () => {
		const html = renderHeadToHtml({ description: 'She said "hello"' }, NONCE);
		expect(html).toContain("&quot;hello&quot;");
		expect(html).not.toContain('content="She said "hello""');
	});

	it("canonical with query string and hash", () => {
		const html = renderHeadToHtml({ canonical: "/page?foo=bar&baz=1#section" }, NONCE);
		expect(html).toContain("&amp;baz=1#section");
	});

	it("keywords with commas and quotes", () => {
		const html = renderHeadToHtml({ keywords: 'a, "b", c' }, NONCE);
		expect(html).toContain("&quot;b&quot;");
	});
});

describe("renderHeadToHtml: isSafeAttrName XSS prevention", () => {
	it("filters onclick from custom.links", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					links: [{ href: "/x", onclick: "alert(1)", rel: "stylesheet" }],
				},
			},
			NONCE,
		);
		expect(html).not.toContain("onclick");
		expect(html).toContain("href=");
	});

	it("filters onerror from custom.meta", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					meta: [{ content: "x", name: "test", onerror: "alert(1)" }],
				},
			},
			NONCE,
		);
		expect(html).not.toContain("onerror");
		expect(html).toContain('name="test"');
	});

	it("filters ONCLICK (uppercase) from custom.links", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					links: [{ ONCLICK: "alert(1)", href: "/x", rel: "stylesheet" }],
				},
			},
			NONCE,
		);
		expect(html).not.toContain("ONCLICK");
	});

	it("filters onLoad (mixed case) from custom.links", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					links: [{ href: "/x", onLoad: "alert(1)", rel: "stylesheet" }],
				},
			},
			NONCE,
		);
		expect(html).not.toContain("onLoad");
	});

	it("allows data-* attributes", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					links: [{ "data-turbo": "false", href: "/x", rel: "prefetch" }],
				},
			},
			NONCE,
		);
		expect(html).toContain("data-turbo=");
	});

	it("rejects attr names starting with numbers", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					meta: [{ "1invalid": "val", content: "x", name: "test" }],
				},
			},
			NONCE,
		);
		expect(html).not.toContain("1invalid");
	});
});

describe("renderHeadToHtml: robots edge cases", () => {
	it("robots with all max-* values", () => {
		const html = renderHeadToHtml(
			{
				robots: {
					"max-image-preview": "large",
					"max-snippet": 160,
					"max-video-preview": 30,
				},
			},
			NONCE,
		);
		expect(html).toContain("max-snippet:160");
		expect(html).toContain("max-image-preview:large");
		expect(html).toContain("max-video-preview:30");
	});

	it("robots empty object produces no tag", () => {
		const html = renderHeadToHtml({ robots: {} }, NONCE);
		expect(html).not.toContain("robots");
	});

	it("robots with max-snippet: 0", () => {
		const html = renderHeadToHtml({ robots: { "max-snippet": 0 } }, NONCE);
		expect(html).toContain("max-snippet:0");
	});
});

describe("renderHeadToHtml: css array", () => {
	it("empty css array produces no links", () => {
		const html = renderHeadToHtml({ css: [] }, NONCE);
		expect(html).not.toContain("<link");
	});

	it("css array with special chars in href", () => {
		const html = renderHeadToHtml({ css: ["/styles?v=1&x=2"] }, NONCE);
		expect(html).toContain("&amp;x=2");
	});

	it("css string still works (backwards compat)", () => {
		const html = renderHeadToHtml({ css: "/single.css" }, NONCE);
		expect(html).toContain('href="/single.css"');
	});
});

describe("renderHeadToHtml: jsonLd edge cases", () => {
	it("jsonLd with </script> in value is escaped", () => {
		const html = renderHeadToHtml(
			{
				jsonLd: [{ "@type": "Thing", name: "</script><script>alert(1)</script>" }],
			},
			NONCE,
		);
		expect(html).not.toContain("</script><script>");
		expect(html).toContain("<\\/script>");
	});

	it("jsonLd empty array produces no script tags", () => {
		const html = renderHeadToHtml({ jsonLd: [] }, NONCE);
		expect(html).not.toContain("application/ld+json");
	});

	it("jsonLd array with multiple items", () => {
		const html = renderHeadToHtml(
			{
				jsonLd: [
					{ "@type": "Organization", name: "A" },
					{ "@type": "Person", name: "B" },
				],
			},
			NONCE,
		);
		/* Each item gets its own script tag */
		const matches = html.match(/application\/ld\+json/g);
		expect(matches).toHaveLength(2);
	});
});

describe("renderHeadToHtml: custom.scripts edge cases", () => {
	it("script with </script> in children is escaped", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					scripts: [{ children: 'var x = "</script>"' }],
				},
			},
			NONCE,
		);
		expect(html).not.toContain('</script>"');
		expect(html).toContain("<\\/script>");
	});

	it("script with no children and no src", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					scripts: [{}],
				},
			},
			NONCE,
		);
		expect(html).toContain(`nonce="${NONCE}"`);
		expect(html).toContain("<script ");
	});

	it("nonce appears on all script tags", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					scripts: [{ src: "/a.js" }, { src: "/b.js" }],
				},
				jsonLd: [{ "@type": "Thing" }],
			},
			NONCE,
		);
		const nonceMatches = html.match(/nonce="test-nonce-123"/g);
		expect(nonceMatches?.length).toBeGreaterThanOrEqual(3);
	});
});

describe("renderHeadToHtml: custom.styles edge cases", () => {
	it("style with </style> in children is escaped", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					styles: [{ children: "body { content: '</style>' }" }],
				},
			},
			NONCE,
		);
		expect(html).toContain("<\\/style>");
	});

	it("nonce appears on style tags", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					styles: [{ children: ".x { color: red }" }],
				},
			},
			NONCE,
		);
		expect(html).toContain(`nonce="${NONCE}"`);
	});
});

describe("renderHeadToHtml: openGraph edge cases", () => {
	it("OG videos with only url (no optional fields)", () => {
		const html = renderHeadToHtml(
			{
				openGraph: {
					videos: [{ url: "https://vid.mp4" }],
				},
			},
			NONCE,
		);
		expect(html).toContain('og:video" content="https://vid.mp4"');
		expect(html).not.toContain("og:video:secure_url");
		expect(html).not.toContain("og:video:type");
	});

	it("OG audio with only url", () => {
		const html = renderHeadToHtml(
			{
				openGraph: {
					audio: [{ url: "https://aud.mp3" }],
				},
			},
			NONCE,
		);
		expect(html).toContain('og:audio" content="https://aud.mp3"');
	});

	it("alternateLocale empty array produces no tags", () => {
		const html = renderHeadToHtml(
			{
				openGraph: {
					alternateLocale: [],
				},
			},
			NONCE,
		);
		expect(html).not.toContain("og:locale:alternate");
	});
});

describe("renderHeadToHtml: twitter edge cases", () => {
	it("twitter.images empty array produces no tags", () => {
		const html = renderHeadToHtml(
			{
				twitter: {
					card: "summary",
					images: [],
				},
			},
			NONCE,
		);
		expect(html).toContain("twitter:card");
		expect(html).not.toContain("twitter:image");
	});
});

describe("renderHeadToHtml: favicons edge cases", () => {
	it("single sized icon (192x192 only)", () => {
		const html = renderHeadToHtml(
			{
				favicons: { "192x192": "/icon-192.png" },
			},
			NONCE,
		);
		expect(html).toContain('sizes="192x192"');
		expect(html).not.toContain('sizes="96x96"');
		expect(html).not.toContain('sizes="512x512"');
	});

	it("all favicon variants", () => {
		const html = renderHeadToHtml(
			{
				favicons: {
					"192x192": "/192.png",
					"512x512": "/512.png",
					"96x96": "/96.png",
					appleTouchIcon: "/apple.png",
					ico: "/favicon.ico",
					svg: "/icon.svg",
				},
			},
			NONCE,
		);
		expect(html).toContain('sizes="any"');
		expect(html).toContain("image/svg+xml");
		expect(html).toContain("apple-touch-icon");
		expect(html).toContain('sizes="96x96"');
		expect(html).toContain('sizes="192x192"');
		expect(html).toContain('sizes="512x512"');
	});
});

describe("renderHeadToHtml: languages", () => {
	it("special lang codes", () => {
		const html = renderHeadToHtml(
			{
				languages: { "x-default": "/", "zh-Hans-CN": "/zh" },
			},
			NONCE,
		);
		expect(html).toContain('hreflang="zh-Hans-CN"');
		expect(html).toContain('hreflang="x-default"');
	});
});

describe("renderHeadToHtml: meta edge cases", () => {
	it("viewport: false produces no viewport tag", () => {
		const html = renderHeadToHtml({ meta: { viewport: false } }, NONCE);
		expect(html).not.toContain("viewport");
	});

	it("all apple meta tags", () => {
		const html = renderHeadToHtml(
			{
				meta: {
					appleMobileWebAppCapable: "yes",
					appleMobileWebAppStatusBarStyle: "black-translucent",
					appleMobileWebAppTitle: "MyApp",
				},
			},
			NONCE,
		);
		expect(html).toContain("apple-mobile-web-app-capable");
		expect(html).toContain("black-translucent");
		expect(html).toContain("apple-mobile-web-app-title");
	});
});
