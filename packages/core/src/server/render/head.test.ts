import { expect, it } from "vitest";
import { mergeHead, renderHead, type Head } from "./head.ts";

const https = "https://ex.com";

function tags(head: Head, nonce?: string, appStylesheet?: string): string {
	return renderHead(head, { nonce, appStylesheet });
}

it("description", () => {
	expect(tags({ description: "Hi" })).toContain('<meta name="description" content="Hi">');
});

it("canonical", () => {
	expect(tags({ canonical: `${https}/a` })).toContain(`<link rel="canonical" href="${https}/a">`);
	expect(() => tags({ canonical: "/a" })).toThrow(/canonical/);
});

it("keywords", () => {
	expect(tags({ keywords: "a, b" })).toContain('<meta name="keywords" content="a, b">');
});

it("css url", () => {
	const html = tags({ css: ["/a.css", "javascript:alert(1)"] }, undefined, "/app.css");
	expect(html.indexOf("/app.css")).toBeLessThan(html.indexOf("/a.css"));
	expect(html).not.toContain("javascript:");
	expect(tags({ css: "/one.css" })).toContain('href="/one.css"');
});

it("hreflang", () => {
	expect(tags({ languages: { en: `${https}/en` } })).toContain(
		`<link rel="alternate" hreflang="en" href="${https}/en">`,
	);
});

it("jsonld escape", () => {
	const html = tags({ jsonLd: [{ name: "</ScRiPt>" }] });
	expect(html).not.toContain("</ScRiPt>");
	expect(html).toContain("<\\/script>");
	expect(html).not.toContain("&lt;");
});

it("jsonld nonce", () => {
	expect(tags({ jsonLd: [{ "@type": "Thing" }] }, "abc")).toContain('nonce="abc"');
});

it("images", () => {
	const html = tags({
		images: [{ url: `${https}/a.jpg`, alt: "A" }],
		openGraph: { images: [{ url: `${https}/b.jpg` }] },
	});
	expect(html.indexOf(`${https}/a.jpg`)).toBeLessThan(html.indexOf(`${https}/b.jpg`));
	expect(html).not.toContain("twitter:image");
});

it("image url", () => {
	expect(tags({ images: [{ url: `${https}/a.jpg` }] })).toContain(
		`<meta property="og:image" content="${https}/a.jpg">`,
	);
});

it("image alt", () => {
	expect(tags({ images: [{ url: `${https}/a.jpg`, alt: "Alt" }] })).toContain('property="og:image:alt" content="Alt"');
});

it("image width", () => {
	expect(tags({ images: [{ url: `${https}/a.jpg`, width: 10 }] })).toContain('property="og:image:width" content="10"');
});

it("image height", () => {
	expect(tags({ images: [{ url: `${https}/a.jpg`, height: 20 }] })).toContain(
		'property="og:image:height" content="20"',
	);
});

it("image type", () => {
	expect(tags({ images: [{ url: `${https}/a.jpg`, type: "image/png" }] })).toContain(
		'property="og:image:type" content="image/png"',
	);
});

it("image scheme", () => {
	expect(tags({ images: [{ url: "javascript:alert(1)" }] })).not.toContain("og:image");
});

it("favicons", () => {
	const html = tags({
		favicons: {
			ico: "/a.ico",
			svg: "/a.svg",
			appleTouchIcon: "/a.png",
			"96x96": "/96.png",
			"192x192": "/192.png",
			"512x512": "/512.png",
		},
	});
	expect(html).toContain('sizes="any"');
	expect(html).toContain('type="image/svg+xml"');
	expect(html).toContain('rel="apple-touch-icon"');
	expect(html).toContain('sizes="512x512"');
});

it("favicon ico", () => {
	expect(tags({ favicons: { ico: "/a.ico" } })).toContain('<link rel="icon" href="/a.ico" sizes="any">');
});

it("favicon svg", () => {
	expect(tags({ favicons: { svg: "/a.svg" } })).toContain('<link rel="icon" href="/a.svg" type="image/svg+xml">');
});

it("favicon apple", () => {
	expect(tags({ favicons: { appleTouchIcon: "/a.png" } })).toContain('<link rel="apple-touch-icon" href="/a.png">');
});

it("favicon 96", () => {
	expect(tags({ favicons: { "96x96": "/96.png" } })).toContain('sizes="96x96"');
});

it("favicon 192", () => {
	expect(tags({ favicons: { "192x192": "/192.png" } })).toContain('sizes="192x192"');
});

it("favicon 512", () => {
	expect(tags({ favicons: { "512x512": "/512.png" } })).toContain('sizes="512x512"');
});

it("robots", () => {
	expect(
		tags({
			robots: {
				index: false,
				noarchive: true,
				"max-image-preview": "large",
				"max-snippet": -1,
				"max-video-preview": 0,
			},
		}),
	).toBe(
		'<meta name="robots" content="noindex, follow, noarchive, max-image-preview:large, max-snippet:-1, max-video-preview:0">',
	);
});

it("robots index default", () => {
	expect(tags({ robots: {} })).toContain("index");
	expect(tags({ robots: {} })).not.toContain("noindex");
});

it("robots follow default", () => {
	expect(tags({ robots: {} })).toContain("follow");
	expect(tags({ robots: { follow: false } })).toContain("nofollow");
});

it("robots noarchive", () => {
	expect(tags({ robots: { noarchive: true } })).toContain("noarchive");
	expect(tags({ robots: { noarchive: false } })).not.toContain("noarchive");
});

it("robots noimageindex", () => {
	expect(tags({ robots: { noimageindex: true } })).toContain("noimageindex");
	expect(tags({ robots: { noimageindex: false } })).not.toContain("noimageindex");
});

it("robots preview", () => {
	expect(tags({ robots: { "max-image-preview": "large" } })).toContain("max-image-preview:large");
});

it("robots snippet", () => {
	expect(tags({ robots: { "max-snippet": -1 } })).toContain("max-snippet:-1");
});

it("robots video", () => {
	expect(tags({ robots: { "max-video-preview": 0 } })).toContain("max-video-preview:0");
});

it("og", () => {
	const html = tags({ openGraph: { type: "article", title: "T", images: [{ url: `${https}/b.jpg` }] } });
	expect(html).toContain('property="og:type" content="article"');
	expect(html).toContain('property="og:title" content="T"');
});

it("og type default", () => {
	expect(tags({ openGraph: {} })).toContain('property="og:type" content="website"');
});

it("og title", () => {
	expect(tags({ openGraph: { title: "T" } })).toContain('property="og:title" content="T"');
});

it("og description", () => {
	expect(tags({ openGraph: { description: "D" } })).toContain('property="og:description" content="D"');
});

it("og url", () => {
	expect(tags({ openGraph: { url: `${https}/p` } })).toContain(`property="og:url" content="${https}/p"`);
});

it("og site", () => {
	expect(tags({ openGraph: { siteName: "Ex" } })).toContain('property="og:site_name" content="Ex"');
});

it("og locale", () => {
	expect(tags({ openGraph: { locale: "en_US" } })).toContain('property="og:locale" content="en_US"');
});

it("og alternate", () => {
	expect(tags({ openGraph: { alternateLocale: ["fr_FR", "de_DE"] } })).toContain(
		'property="og:locale:alternate" content="fr_FR"',
	);
	expect(tags({ openGraph: { alternateLocale: ["fr_FR", "de_DE"] } })).toContain(
		'property="og:locale:alternate" content="de_DE"',
	);
});

it("og audio", () => {
	const html = tags({
		openGraph: {
			audio: [{ url: `${https}/a.mp3` }, { url: `${https}/b.mp3`, type: "audio/mpeg", secureUrl: `${https}/b.mp3` }],
		},
	});
	expect(html).toContain(`property="og:audio" content="${https}/a.mp3"`);
	expect(html).toContain('property="og:audio:type" content="audio/mpeg"');
	expect(html).toContain(`property="og:audio:secure_url" content="${https}/b.mp3"`);
});

it("og video", () => {
	const html = tags({
		openGraph: {
			videos: [{ url: `${https}/v.mp4`, width: 1, height: 2, type: "video/mp4", secureUrl: `${https}/v.mp4` }],
		},
	});
	expect(html).toContain(`property="og:video" content="${https}/v.mp4"`);
	expect(html).toContain('property="og:video:width" content="1"');
	expect(html).toContain('property="og:video:height" content="2"');
	expect(html).toContain('property="og:video:type" content="video/mp4"');
	expect(html).toContain(`property="og:video:secure_url" content="${https}/v.mp4"`);
});

it("twitter", () => {
	expect(tags({ twitter: { card: "player", title: "T" } })).toContain('name="twitter:card" content="player"');
});

it("twitter card", () => {
	expect(tags({ twitter: {} })).toContain('name="twitter:card" content="summary"');
});

it("twitter site", () => {
	expect(tags({ twitter: { site: "@ex" } })).toContain('name="twitter:site" content="@ex"');
});

it("twitter creator", () => {
	expect(tags({ twitter: { creator: "@me" } })).toContain('name="twitter:creator" content="@me"');
});

it("twitter title", () => {
	expect(tags({ twitter: { title: "T" } })).toContain('name="twitter:title" content="T"');
});

it("twitter description", () => {
	expect(tags({ twitter: { description: "D" } })).toContain('name="twitter:description" content="D"');
});

it("twitter image", () => {
	const html = tags({ twitter: { images: [{ url: `${https}/t.jpg` }, { url: `${https}/u.jpg`, alt: "U" }] } });
	expect(html).toContain(`name="twitter:image" content="${https}/t.jpg"`);
	expect(html).toContain('name="twitter:image:alt" content="U"');
});

it("meta", () => {
	expect(tags({ meta: { author: "A" } })).toContain('<meta name="author" content="A">');
});

it("meta charset", () => {
	expect(tags({ meta: { charset: "utf-8" } })).toContain('<meta charset="utf-8">');
});

it("meta viewport", () => {
	expect(tags({ meta: { viewport: "width=device-width" } })).toContain(
		'<meta name="viewport" content="width=device-width">',
	);
	expect(tags({ meta: { viewport: false } })).not.toContain("viewport");
});

it("meta application", () => {
	expect(tags({ meta: { applicationName: "App" } })).toContain('<meta name="application-name" content="App">');
});

it("meta author", () => {
	expect(tags({ meta: { author: "A" } })).toContain('<meta name="author" content="A">');
});

it("meta creator", () => {
	expect(tags({ meta: { creator: "C" } })).toContain('<meta name="creator" content="C">');
});

it("meta publisher", () => {
	expect(tags({ meta: { publisher: "P" } })).toContain('<meta name="publisher" content="P">');
});

it("meta generator", () => {
	expect(tags({ meta: { generator: "G" } })).toContain('<meta name="generator" content="G">');
});

it("meta manifest", () => {
	expect(tags({ meta: { manifest: "/manifest.webmanifest" } })).toContain(
		'<link rel="manifest" href="/manifest.webmanifest">',
	);
});

it("meta apple capable", () => {
	expect(tags({ meta: { appleMobileWebAppCapable: "yes" } })).toContain(
		'<meta name="apple-mobile-web-app-capable" content="yes">',
	);
});

it("meta apple title", () => {
	expect(tags({ meta: { appleMobileWebAppTitle: "App" } })).toContain(
		'<meta name="apple-mobile-web-app-title" content="App">',
	);
});

it("meta apple bar", () => {
	expect(tags({ meta: { appleMobileWebAppStatusBarStyle: "black" } })).toContain(
		'<meta name="apple-mobile-web-app-status-bar-style" content="black">',
	);
});

it("meta mobile", () => {
	expect(tags({ meta: { mobileWebAppCapable: "yes" } })).toContain(
		'<meta name="mobile-web-app-capable" content="yes">',
	);
});

it("custom nonce", () => {
	const html = tags(
		{
			custom: {
				scripts: [
					{ children: "var x = 1" },
					{ src: "/a.js", async: true, extra: { nonce: "evil", id: "s" } },
					{ src: "/b.js" },
					{},
				],
			},
		},
		"abc",
	);
	expect(html).toContain('<script nonce="abc">var x = 1</script>');
	expect(html).toContain('<script src="/a.js" async id="s"></script>');
	expect(html).toContain('<script src="/b.js"></script>');
	expect(html).not.toContain('src="/a.js" nonce');
});

it("custom both", () => {
	expect(() => tags({ custom: { scripts: [{ src: "/a.js", children: "x" }] } })).toThrow(/src and children/);
});

it("custom style", () => {
	const html = tags({ custom: { styles: [{ children: "a{}" }, { children: "</StYlE>" }] } }, "abc");
	expect(html).toContain('<style nonce="abc">a{}</style>');
	expect(html).not.toContain("</StYlE>");
	expect(html).toContain("<\\/style>");
	expect(tags({ custom: { styles: [{ children: "a{}" }] } })).not.toContain("nonce");
});

it("script close", () => {
	const html = tags({ custom: { scripts: [{ children: "</ScRiPt>" }] } });
	expect(html).not.toContain("</ScRiPt>");
	expect(html).toContain("<\\/script>");
});

it("custom key dropped", () => {
	const html = tags({
		custom: {
			links: [{ rel: "preconnect", href: https, "http-equiv": "x", "data-a1": "1", "bad name": "no" }],
			meta: [{ name: "theme-color", content: "black" }],
		},
	});
	expect(html).toContain('rel="preconnect"');
	expect(html).toContain('http-equiv="x"');
	expect(html).toContain('data-a1="1"');
	expect(html).not.toContain("bad name");
	expect(html).toContain('<meta name="theme-color" content="black">');
});

it("custom on dropped", () => {
	expect(tags({ custom: { links: [{ onclick: "alert(1)", href: https }] } })).not.toContain("onclick");
});

it("merge", () => {
	const kept = mergeHead(
		{ title: "Parent", description: "D", css: ["/a.css"], custom: { links: [{ rel: "prev" }] } },
		{ title: "Child" },
	);
	expect(kept.title).toBe("Child");
	expect(tags(kept)).toContain("<title>Child</title>");
	expect(kept.description).toBe("D");
	expect(kept.css).toEqual(["/a.css"]);
	const replacedCss = mergeHead(
		{ css: ["/a.css"] },
		{ css: "/b.css", images: [{ url: `${https}/c.jpg` }], jsonLd: [{ n: 1 }] },
	);
	expect(replacedCss.css).toBe("/b.css");
	const joined = mergeHead(
		{ images: [{ url: `${https}/a.jpg` }], jsonLd: [{ n: 0 }], custom: { links: [{ rel: "prev" }] } },
		{ images: [{ url: `${https}/b.jpg` }], jsonLd: [{ n: 1 }], custom: { links: [{ rel: "next" }] } },
	);
	expect(joined.images?.map((image) => image.url)).toEqual([`${https}/a.jpg`, `${https}/b.jpg`]);
	expect(joined.jsonLd).toEqual([{ n: 0 }, { n: 1 }]);
	expect(joined.custom?.links?.map((link) => link.rel)).toEqual(["prev", "next"]);
});

it("replace", () => {
	const head = mergeHead({ title: "Parent", description: "D" }, { description: "Child" }, true);
	expect(head.title).toBeUndefined();
	expect(head.description).toBe("Child");
});

it("viewport false", () => {
	const head = mergeHead({ meta: { viewport: "width=device-width" } }, { meta: { viewport: false } });
	expect(renderHead(head)).not.toContain("viewport");
});

it("unknown field", () => {
	expect(renderHead({ nope: "secret" } as Head)).not.toContain("secret");
});
