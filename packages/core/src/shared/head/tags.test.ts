import { expect, it } from "vitest";
import { mergeHead } from "./merge.ts";
import { headTags } from "./tags.ts";

it("raw values", () => {
	expect(headTags({ title: 'A <b> & "c"', description: "d<" })).toEqual([
		{ tag: "title", key: "title", props: { children: 'A <b> & "c"' } },
		{ tag: "meta", key: "meta:description:0", props: { name: "description", content: "d<" } },
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
		{ tag: "link", key: "link:icon:/f.ico:0", props: { rel: "icon", href: "/f.ico", sizes: "any" } },
		{ tag: "link", key: "link:icon:/f.svg:0", props: { rel: "icon", href: "/f.svg", type: "image/svg+xml" } },
		{
			tag: "link",
			key: "link:icon:/f.png:0",
			props: { rel: "icon", href: "/f.png", type: "image/png", sizes: "192x192" },
		},
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
		{
			tag: "script",
			key: expect.stringMatching(/^script:[0-9a-z]+:0$/),
			props: { type: "application/ld+json", nonce: "n", children: '{"@type":"Thing"}' },
		},
		{ tag: "link", key: "link:preconnect:https://cdn:0", props: { rel: "preconnect", href: "https://cdn" } },
		{ tag: "meta", key: "meta:m:0", props: { name: "m", content: "c", "data-x": "1" } },
		{ tag: "script", key: "script:/s.js:0", props: { src: "/s.js", async: true, "data-k": "v", nonce: false } },
		{ tag: "script", key: expect.stringMatching(/^script:[0-9a-z]+:0$/), props: { nonce: "n", children: "1" } },
		{ tag: "style", key: expect.stringMatching(/^style:[0-9a-z]+:0$/), props: { nonce: "n", children: "a{}" } },
	]);
	expect(() => headTags({ custom: { scripts: [{ src: "/a", children: "b" }] } })).toThrow(/src and children/);
});

function keys(head: Parameters<typeof headTags>[0]): string[] {
	return headTags(head).map((tag) => tag.key);
}

it("semantic keys", () => {
	const og = keys({ images: [{ url: "/a.png" }, { url: "/b.png" }], languages: { fr: "https://ex.com/fr" } });
	expect(og).toEqual(["link:alternate:fr:0", "meta:og:image:0", "meta:og:image:1"]);
	const script = { custom: { scripts: [{ children: "run()" }] } };
	const before = keys(script)[0];
	expect(keys({ description: "new", ...script }).at(-1)).toBe(before);
	expect(keys({ custom: { scripts: [{ children: "run(2)" }] } })[0]).not.toBe(before);
	expect(keys({ meta: { charset: "utf-8" }, custom: { meta: [{ "http-equiv": "refresh", content: "5" }] } })).toEqual([
		"meta:utf-8:0",
		"meta:refresh:0",
	]);
});

// The records have the shapes of dx/head.md, so a wrong value fails in the route.
it("typed records", () => {
	// @ts-expect-error an og:type outside the four
	expect(headTags({ openGraph: { type: "blog" } })).toHaveLength(1);
	// @ts-expect-error a card outside the four
	expect(headTags({ twitter: { card: "large" } })).toHaveLength(1);
	// @ts-expect-error a twitter image needs its url
	expect(headTags({ twitter: { images: [{ alt: "A" }] } })).toHaveLength(2);
	// @ts-expect-error robots tokens are booleans
	expect(headTags({ robots: { index: "no" } })).toHaveLength(1);
	// @ts-expect-error a misspelled meta key
	expect(headTags({ meta: { autor: "A" } })).toEqual([]);
});
