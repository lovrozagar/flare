import { expect, it } from "vitest";
import { headTags, mergeHead } from "./tags.ts";

it("raw values", () => {
	expect(headTags({ title: 'A <b> & "c"', description: "d<" })).toEqual([
		{ tag: "title", props: { children: 'A <b> & "c"' } },
		{ tag: "meta", props: { name: "description", content: "d<" } },
	]);
});

it("order", () => {
	const tags = headTags(
		{
			title: "T",
			canonical: "https://ex.com/a",
			keywords: "k",
			css: ["/a.css", "javascript:x"],
			languages: { fr: "https://ex.com/fr" },
			meta: { viewport: "width=device-width", charset: "utf-8", manifest: "/m.json", author: "A" },
		},
		{ appStylesheet: "/app.css" },
	);
	expect(tags.map((tag) => `${tag.tag}:${tag.props.rel ?? tag.props.name ?? tag.props.charset ?? ""}`)).toEqual([
		"title:",
		"link:canonical",
		"meta:keywords",
		"link:stylesheet",
		"link:stylesheet",
		"link:alternate",
		"meta:utf-8",
		"meta:viewport",
		"meta:author",
		"link:manifest",
	]);
	expect(() => headTags({ canonical: "http://ex.com" })).toThrow(/canonical/);
});

it("viewport false", () => {
	const merged = mergeHead({ meta: { viewport: "width=device-width" } }, { meta: { viewport: false } });
	expect(headTags(merged).filter((tag) => tag.props.name === "viewport")).toEqual([]);
});

it("og images", () => {
	const tags = headTags({
		images: [{ url: "/a.png", alt: "A", width: 1, height: 2, type: "image/png" }, { url: "javascript:x" }],
		openGraph: {
			images: [{ url: "/b.png" }],
			audio: [{ url: "/a.mp3", type: "audio/mpeg" }],
			videos: [{ url: "/v.mp4", secureUrl: "https://v" }],
		},
	});
	expect(
		tags.filter((tag) => String(tag.props.property).startsWith("og:image")).map((tag) => tag.props.content),
	).toEqual(["/a.png", "A", "1", "2", "image/png", "/b.png"]);
	expect(tags.map((tag) => tag.props.property)).toContain("og:video:secure_url");
	expect(tags.filter((tag) => tag.props.name === "twitter:image")).toEqual([]);
});

it("favicons", () => {
	expect(headTags({ favicons: { ico: "/f.ico", "192x192": "/f.png", svg: "/f.svg" } })).toEqual([
		{ tag: "link", props: { rel: "icon", href: "/f.ico", sizes: "any" } },
		{ tag: "link", props: { rel: "icon", href: "/f.svg", type: "image/svg+xml" } },
		{ tag: "link", props: { rel: "icon", href: "/f.png", type: "image/png", sizes: "192x192" } },
	]);
});

it("twitter and robots", () => {
	const tags = headTags({
		twitter: { site: "@s", images: [{ url: "/t.png", alt: "T" }, { url: "/u.png" }] },
		robots: { index: false, noarchive: true, "max-snippet": 3 },
	});
	expect(tags.map((tag) => `${tag.props.name}=${tag.props.content}`)).toEqual([
		"twitter:card=summary",
		"twitter:site=@s",
		"twitter:image=/t.png",
		"twitter:image:alt=T",
		"twitter:image=/u.png",
		"robots=noindex, follow, noarchive, max-snippet:3",
	]);
});

it("on attributes dropped", () => {
	const tags = headTags(
		{
			custom: {
				links: [{ rel: "preconnect", href: "https://cdn", onload: "x", OnError: "y", "bad name": "z" }],
				meta: [{ name: "m", content: "c", "data-x": "1" }],
				scripts: [
					{ src: "/s.js", async: true, extra: { onclick: "x", nonce: "ignored", "data-k": "v" } },
					{ children: "1" },
					{},
				],
				styles: [{ children: "a{}" }],
			},
			jsonLd: [{ "@type": "Thing" }],
		},
		{ nonce: "n" },
	);
	expect(tags).toEqual([
		{ tag: "script", props: { type: "application/ld+json", nonce: "n", children: '{"@type":"Thing"}' } },
		{ tag: "link", props: { rel: "preconnect", href: "https://cdn" } },
		{ tag: "meta", props: { name: "m", content: "c", "data-x": "1" } },
		{ tag: "script", props: { src: "/s.js", async: true, "data-k": "v" } },
		{ tag: "script", props: { nonce: "n", children: "1" } },
		{ tag: "style", props: { nonce: "n", children: "a{}" } },
	]);
	expect(() => headTags({ custom: { scripts: [{ src: "/a", children: "b" }] } })).toThrow(/src and children/);
});

it("replace", () => {
	const parent = { title: "P", images: [{ url: "/p.png" }], meta: { author: "P" } };
	expect(mergeHead(parent, { title: "C" }, true)).toEqual({ title: "C" });
	const merged = mergeHead(parent, { images: [{ url: "/c.png" }], meta: { author: "C" } });
	expect(merged.title).toBe("P");
	expect(merged.images).toEqual([{ url: "/p.png" }, { url: "/c.png" }]);
	expect(merged.meta).toEqual({ author: "C" });
});
