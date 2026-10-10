/**
 * @vitest-environment node
 *
 * Tests for HTML escaping in head rendering.
 * escapeHtml and escapeAttr are private — tested via renderHeadToHtml.
 */
import { describe, expect, it } from "vitest";
import { renderHeadToHtml } from "../../../src/ssr/head.ts";

const NONCE = "test-nonce-abc";

describe("escapeHtml (via title)", () => {
	it("escapes < and >", () => {
		const html = renderHeadToHtml({ title: "<script>alert(1)</script>" }, NONCE);
		expect(html).toContain("<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>");
		expect(html).not.toContain("<script>alert(1)</script>");
	});

	it("escapes &", () => {
		const html = renderHeadToHtml({ title: "A & B" }, NONCE);
		expect(html).toContain("<title>A &amp; B</title>");
	});

	it("escapes double quotes", () => {
		const html = renderHeadToHtml({ title: 'say "hello"' }, NONCE);
		expect(html).toContain("<title>say &quot;hello&quot;</title>");
	});

	it("escapes combined special characters", () => {
		const html = renderHeadToHtml({ title: '<img src="x" onerror="alert(1)">' }, NONCE);
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
		expect(html).toContain("&quot;x&quot;");
	});

	it("already-escaped &amp; gets double-escaped", () => {
		const html = renderHeadToHtml({ title: "&amp;" }, NONCE);
		expect(html).toContain("<title>&amp;amp;</title>");
	});

	it("passes through string with no special chars", () => {
		const html = renderHeadToHtml({ title: "Hello World" }, NONCE);
		expect(html).toContain("<title>Hello World</title>");
	});

	it("handles empty string", () => {
		const html = renderHeadToHtml({ title: "" }, NONCE);
		expect(html).toContain("<title></title>");
	});
});

describe("escapeAttr (via description)", () => {
	it("escapes & in attribute", () => {
		const html = renderHeadToHtml({ description: "A & B" }, NONCE);
		expect(html).toContain('content="A &amp; B"');
	});

	it("escapes double quotes in attribute", () => {
		const html = renderHeadToHtml({ description: 'say "hello"' }, NONCE);
		expect(html).toContain('content="say &quot;hello&quot;"');
	});

	it("escapes < and > in attributes for defense-in-depth", () => {
		const html = renderHeadToHtml({ description: "a < b > c" }, NONCE);
		expect(html).toContain('content="a &lt; b &gt; c"');
	});

	it("handles empty string", () => {
		const html = renderHeadToHtml({ description: "" }, NONCE);
		expect(html).toContain('content=""');
	});

	it("escapes URL with & params", () => {
		const html = renderHeadToHtml({ canonical: "https://example.com?a=1&b=2" }, NONCE);
		expect(html).toContain('href="https://example.com?a=1&amp;b=2"');
	});
});

describe("renderOgImage escaping", () => {
	it("escapes image URL", () => {
		const html = renderHeadToHtml(
			{
				images: [{ url: "https://example.com/img?a=1&b=2" }],
			},
			NONCE,
		);
		expect(html).toContain('content="https://example.com/img?a=1&amp;b=2"');
	});

	it("escapes alt text", () => {
		const html = renderHeadToHtml(
			{
				images: [{ alt: 'photo "sunset" & sea', url: "https://example.com/img.jpg" }],
			},
			NONCE,
		);
		expect(html).toContain('content="photo &quot;sunset&quot; &amp; sea"');
	});

	it("escapes type attribute", () => {
		const html = renderHeadToHtml(
			{
				images: [{ type: 'image/jpeg"onload="alert(1)', url: "https://example.com/img.jpg" }],
			},
			NONCE,
		);
		expect(html).toContain("&quot;onload=");
		expect(html).not.toContain('onload="alert');
	});
});

describe("renderHeadToHtml edge cases", () => {
	it("returns empty string for empty config", () => {
		const html = renderHeadToHtml({}, NONCE);
		expect(html).toBe("");
	});

	it("nonce is escaped in jsonLd script tags", () => {
		const html = renderHeadToHtml(
			{
				jsonLd: [{ "@context": "https://schema.org", "@type": "WebPage" }],
			},
			NONCE,
		);
		expect(html).toContain(`nonce="${NONCE}"`);
		expect(html).toContain("application/ld+json");
	});

	it("custom script src is escaped", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					scripts: [{ src: "https://cdn.example.com/lib.js?v=1&t=2" }],
				},
			},
			NONCE,
		);
		expect(html).toContain('src="https://cdn.example.com/lib.js?v=1&amp;t=2"');
	});

	it("custom meta attributes are escaped", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					meta: [{ content: 'value"with"quotes', name: "test" }],
				},
			},
			NONCE,
		);
		expect(html).toContain("&quot;with&quot;");
	});

	it("twitter image alt is escaped", () => {
		const html = renderHeadToHtml(
			{
				twitter: {
					images: [{ alt: "A & B", url: "https://example.com/tw.jpg" }],
				},
			},
			NONCE,
		);
		expect(html).toContain('content="A &amp; B"');
	});

	it("openGraph video URL is escaped", () => {
		const html = renderHeadToHtml(
			{
				openGraph: {
					videos: [{ url: "https://example.com/v?a=1&b=2" }],
				},
			},
			NONCE,
		);
		expect(html).toContain('content="https://example.com/v?a=1&amp;b=2"');
	});

	it("language alternate href is escaped", () => {
		const html = renderHeadToHtml(
			{
				languages: { en: "https://example.com?lang=en&v=1" },
			},
			NONCE,
		);
		expect(html).toContain('href="https://example.com?lang=en&amp;v=1"');
	});
});

describe("script/style children escaping", () => {
	it("custom script children escapes </script>", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					scripts: [{ children: 'var x = "</script><script>alert(1)</script>"' }],
				},
			},
			NONCE,
		);
		expect(html).not.toContain("</script><script>alert(1)");
		expect(html).toContain("<\\/script>");
	});

	it("custom style children escapes </style>", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					styles: [{ children: "body { } </style><script>alert(1)</script>" }],
				},
			},
			NONCE,
		);
		expect(html).not.toContain("</style><script>");
		expect(html).toContain("<\\/style>");
	});

	it("JSON-LD escapes </script> in values", () => {
		const html = renderHeadToHtml(
			{
				jsonLd: [{ name: "</script><script>alert(1)</script>" }],
			},
			NONCE,
		);
		expect(html).not.toContain("</script><script>alert(1)");
		expect(html).toContain("<\\/script>");
		expect(html).toContain("application/ld+json");
	});

	it("JSON-LD case-insensitive escape", () => {
		const html = renderHeadToHtml(
			{
				jsonLd: [{ name: "</SCRIPT><script>alert(1)</script>" }],
			},
			NONCE,
		);
		expect(html).not.toContain("</SCRIPT>");
	});
});

describe("custom attribute key sanitization", () => {
	it("filters attribute keys with event handlers", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					meta: [{ name: "safe", 'onload="alert(1)" x': "val" }],
				},
			},
			NONCE,
		);
		expect(html).toContain('name="safe"');
		expect(html).not.toContain("onload");
		expect(html).not.toContain("alert");
	});

	it("filters attribute keys with special characters in links", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					links: [{ rel: "stylesheet", 'x"y': "val" }],
				},
			},
			NONCE,
		);
		expect(html).toContain('rel="stylesheet"');
		expect(html).not.toContain('x"y');
	});

	it("allows valid hyphenated attribute keys", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					meta: [{ content: "test", "http-equiv": "refresh" }],
				},
			},
			NONCE,
		);
		expect(html).toContain('http-equiv="refresh"');
		expect(html).toContain('content="test"');
	});
});
