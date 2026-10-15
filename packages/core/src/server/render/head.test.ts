import { expect, it, vi } from "vitest"
import type { DevErrorPayload } from "../../shared/errors/dev-report.ts"
import type { ErrorRender } from "../../shared/route-builder/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { serveWith } from "../lifecycle/create.ts"
import type { Logger } from "../lifecycle/logger.ts"
import { createComponent } from "solid-js"
import { Dynamic, type JSX } from "@solidjs/web"
import { mergeHead } from "../../shared/head/index.ts"
import { renderDocument } from "./document.ts"
import type { Head } from "./head.ts"

const https = "https://ex.com"

const router = createRouter({ layouts: {}, routeTree: [] })

// Solid writes the head into a document's head element, so every render here is a full document.
function documentOf(children?: JSX.Element): JSX.Element {
	const body = createComponent(Dynamic, { component: "body", children })
	return createComponent(Dynamic, {
		component: "html",
		children: [createComponent(Dynamic, { component: "head" }), body],
	})
}

// The head Solid writes through the real render, before Flare's capture script. `tags` strips `data-dh`.
async function written(head: Head, nonce = ""): Promise<string> {
	const request = new Request("http://localhost/")
	const body = await renderDocument({
		request,
		router,
		nonce,
		matches: [],
		head,
		render: () => documentOf(),
	})
	const html = await new Response(body).text()
	const inner = html.slice(html.indexOf(">", html.indexOf("<head")) + 1, html.indexOf("</head>"))
	return inner.slice(0, inner.lastIndexOf("<script"))
}

async function tags(head: Head, nonce?: string): Promise<string> {
	return (await written(head, nonce)).replaceAll(/ data-dh="[^"]*"/g, "")
}

it("description", async () => {
	expect(await tags({ description: "Hi" })).toContain('<meta name="description" content="Hi">')
})

it("canonical", async () => {
	expect(await tags({ canonical: `${https}/a` })).toContain(`<link rel="canonical" href="${https}/a">`)
	await expect(tags({ canonical: "/a" })).rejects.toThrow(/canonical/)
})

it("keywords", async () => {
	expect(await tags({ keywords: "a, b" })).toContain('<meta name="keywords" content="a, b">')
})

it("css url", async () => {
	const html = await tags({ css: ["/a.css", "javascript:alert(1)"] })
	expect(html).toContain('href="/a.css"')
	expect(html).not.toContain("javascript:")
	expect(await tags({ css: "/one.css" })).toContain('href="/one.css"')
})

it("hreflang", async () => {
	expect(await tags({ languages: { en: `${https}/en` } })).toContain(
		`<link rel="alternate" hreflang="en" href="${https}/en">`,
	)
})

it("jsonld escape", async () => {
	const html = await tags({ jsonLd: [{ name: "</ScRiPt>" }] })
	expect(html).not.toContain("</ScRiPt>")
	expect(html).toContain("<\\/script>")
	expect(html).not.toContain("&lt;")
})

it("jsonld nonce", async () => {
	expect(await tags({ jsonLd: [{ "@type": "Thing" }] }, "abc")).toContain('nonce="abc"')
})

it("images", async () => {
	const html = await tags({
		images: [{ url: `${https}/a.jpg`, alt: "A" }],
		openGraph: { images: [{ url: `${https}/b.jpg` }] },
	})
	expect(html.indexOf(`${https}/a.jpg`)).toBeLessThan(html.indexOf(`${https}/b.jpg`))
	expect(html).not.toContain("twitter:image")
})

it("image url", async () => {
	expect(await tags({ images: [{ url: `${https}/a.jpg` }] })).toContain(
		`<meta property="og:image" content="${https}/a.jpg">`,
	)
})

it("image alt", async () => {
	expect(await tags({ images: [{ url: `${https}/a.jpg`, alt: "Alt" }] })).toContain(
		'property="og:image:alt" content="Alt"',
	)
})

it("image width", async () => {
	expect(await tags({ images: [{ url: `${https}/a.jpg`, width: 10 }] })).toContain(
		'property="og:image:width" content="10"',
	)
})

it("image height", async () => {
	expect(await tags({ images: [{ url: `${https}/a.jpg`, height: 20 }] })).toContain(
		'property="og:image:height" content="20"',
	)
})

it("image type", async () => {
	expect(await tags({ images: [{ url: `${https}/a.jpg`, type: "image/png" }] })).toContain(
		'property="og:image:type" content="image/png"',
	)
})

it("image scheme", async () => {
	expect(await tags({ images: [{ url: "javascript:alert(1)" }] })).not.toContain("og:image")
})

it("favicons", async () => {
	const html = await tags({
		favicons: {
			ico: "/a.ico",
			svg: "/a.svg",
			appleTouchIcon: "/a.png",
			"96x96": "/96.png",
			"192x192": "/192.png",
			"512x512": "/512.png",
		},
	})
	expect(html).toContain('sizes="any"')
	expect(html).toContain('type="image/svg+xml"')
	expect(html).toContain('rel="apple-touch-icon"')
	expect(html).toContain('sizes="512x512"')
})

it("favicon ico", async () => {
	expect(await tags({ favicons: { ico: "/a.ico" } })).toContain('<link rel="icon" href="/a.ico" sizes="any">')
})

it("favicon svg", async () => {
	expect(await tags({ favicons: { svg: "/a.svg" } })).toContain('<link rel="icon" href="/a.svg" type="image/svg+xml">')
})

it("favicon apple", async () => {
	expect(await tags({ favicons: { appleTouchIcon: "/a.png" } })).toContain(
		'<link rel="apple-touch-icon" href="/a.png">',
	)
})

it("favicon 96", async () => {
	expect(await tags({ favicons: { "96x96": "/96.png" } })).toContain('sizes="96x96"')
})

it("favicon 192", async () => {
	expect(await tags({ favicons: { "192x192": "/192.png" } })).toContain('sizes="192x192"')
})

it("favicon 512", async () => {
	expect(await tags({ favicons: { "512x512": "/512.png" } })).toContain('sizes="512x512"')
})

it("robots", async () => {
	expect(
		await tags({
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
	)
})

it("robots index default", async () => {
	expect(await tags({ robots: {} })).toContain("index")
	expect(await tags({ robots: {} })).not.toContain("noindex")
})

it("robots follow default", async () => {
	expect(await tags({ robots: {} })).toContain("follow")
	expect(await tags({ robots: { follow: false } })).toContain("nofollow")
})

it("robots noarchive", async () => {
	expect(await tags({ robots: { noarchive: true } })).toContain("noarchive")
	expect(await tags({ robots: { noarchive: false } })).not.toContain("noarchive")
})

it("robots noimageindex", async () => {
	expect(await tags({ robots: { noimageindex: true } })).toContain("noimageindex")
	expect(await tags({ robots: { noimageindex: false } })).not.toContain("noimageindex")
})

it("robots preview", async () => {
	expect(await tags({ robots: { "max-image-preview": "large" } })).toContain("max-image-preview:large")
})

it("robots snippet", async () => {
	expect(await tags({ robots: { "max-snippet": -1 } })).toContain("max-snippet:-1")
})

it("robots video", async () => {
	expect(await tags({ robots: { "max-video-preview": 0 } })).toContain("max-video-preview:0")
})

it("og", async () => {
	const html = await tags({ openGraph: { type: "article", title: "T", images: [{ url: `${https}/b.jpg` }] } })
	expect(html).toContain('property="og:type" content="article"')
	expect(html).toContain('property="og:title" content="T"')
})

it("og type default", async () => {
	expect(await tags({ openGraph: {} })).toContain('property="og:type" content="website"')
})

it("og title", async () => {
	expect(await tags({ openGraph: { title: "T" } })).toContain('property="og:title" content="T"')
})

it("og description", async () => {
	expect(await tags({ openGraph: { description: "D" } })).toContain('property="og:description" content="D"')
})

it("og url", async () => {
	expect(await tags({ openGraph: { url: `${https}/p` } })).toContain(`property="og:url" content="${https}/p"`)
})

it("og site", async () => {
	expect(await tags({ openGraph: { siteName: "Ex" } })).toContain('property="og:site_name" content="Ex"')
})

it("og locale", async () => {
	expect(await tags({ openGraph: { locale: "en_US" } })).toContain('property="og:locale" content="en_US"')
})

it("og alternate", async () => {
	expect(await tags({ openGraph: { alternateLocale: ["fr_FR", "de_DE"] } })).toContain(
		'property="og:locale:alternate" content="fr_FR"',
	)
	expect(await tags({ openGraph: { alternateLocale: ["fr_FR", "de_DE"] } })).toContain(
		'property="og:locale:alternate" content="de_DE"',
	)
})

it("og audio", async () => {
	const html = await tags({
		openGraph: {
			audio: [{ url: `${https}/a.mp3` }, { url: `${https}/b.mp3`, type: "audio/mpeg", secureUrl: `${https}/b.mp3` }],
		},
	})
	expect(html).toContain(`property="og:audio" content="${https}/a.mp3"`)
	expect(html).toContain('property="og:audio:type" content="audio/mpeg"')
	expect(html).toContain(`property="og:audio:secure_url" content="${https}/b.mp3"`)
})

it("og video", async () => {
	const html = await tags({
		openGraph: {
			videos: [{ url: `${https}/v.mp4`, width: 1, height: 2, type: "video/mp4", secureUrl: `${https}/v.mp4` }],
		},
	})
	expect(html).toContain(`property="og:video" content="${https}/v.mp4"`)
	expect(html).toContain('property="og:video:width" content="1"')
	expect(html).toContain('property="og:video:height" content="2"')
	expect(html).toContain('property="og:video:type" content="video/mp4"')
	expect(html).toContain(`property="og:video:secure_url" content="${https}/v.mp4"`)
})

it("twitter", async () => {
	expect(await tags({ twitter: { card: "player", title: "T" } })).toContain('name="twitter:card" content="player"')
})

it("twitter card", async () => {
	expect(await tags({ twitter: {} })).toContain('name="twitter:card" content="summary"')
})

it("twitter site", async () => {
	expect(await tags({ twitter: { site: "@ex" } })).toContain('name="twitter:site" content="@ex"')
})

it("twitter creator", async () => {
	expect(await tags({ twitter: { creator: "@me" } })).toContain('name="twitter:creator" content="@me"')
})

it("twitter title", async () => {
	expect(await tags({ twitter: { title: "T" } })).toContain('name="twitter:title" content="T"')
})

it("twitter description", async () => {
	expect(await tags({ twitter: { description: "D" } })).toContain('name="twitter:description" content="D"')
})

it("twitter image", async () => {
	const html = await tags({ twitter: { images: [{ url: `${https}/t.jpg` }, { url: `${https}/u.jpg`, alt: "U" }] } })
	expect(html).toContain(`name="twitter:image" content="${https}/t.jpg"`)
	expect(html).toContain('name="twitter:image:alt" content="U"')
})

it("meta", async () => {
	expect(await tags({ meta: { author: "A" } })).toContain('<meta name="author" content="A">')
})

it("meta charset", async () => {
	expect(await tags({ meta: { charset: "utf-8" } })).toContain('<meta charset="utf-8">')
})

it("meta viewport", async () => {
	expect(await tags({ meta: { viewport: "width=device-width" } })).toContain(
		'<meta name="viewport" content="width=device-width">',
	)
	expect(await tags({ meta: { viewport: false } })).not.toContain("viewport")
})

it("meta application", async () => {
	expect(await tags({ meta: { applicationName: "App" } })).toContain('<meta name="application-name" content="App">')
})

it("meta author", async () => {
	expect(await tags({ meta: { author: "A" } })).toContain('<meta name="author" content="A">')
})

it("meta creator", async () => {
	expect(await tags({ meta: { creator: "C" } })).toContain('<meta name="creator" content="C">')
})

it("meta publisher", async () => {
	expect(await tags({ meta: { publisher: "P" } })).toContain('<meta name="publisher" content="P">')
})

it("meta generator", async () => {
	expect(await tags({ meta: { generator: "G" } })).toContain('<meta name="generator" content="G">')
})

it("meta manifest", async () => {
	expect(await tags({ meta: { manifest: "/manifest.webmanifest" } })).toContain(
		'<link rel="manifest" href="/manifest.webmanifest">',
	)
})

it("meta apple capable", async () => {
	expect(await tags({ meta: { appleMobileWebAppCapable: "yes" } })).toContain(
		'<meta name="apple-mobile-web-app-capable" content="yes">',
	)
})

it("meta apple title", async () => {
	expect(await tags({ meta: { appleMobileWebAppTitle: "App" } })).toContain(
		'<meta name="apple-mobile-web-app-title" content="App">',
	)
})

it("meta apple bar", async () => {
	expect(await tags({ meta: { appleMobileWebAppStatusBarStyle: "black" } })).toContain(
		'<meta name="apple-mobile-web-app-status-bar-style" content="black">',
	)
})

it("meta mobile", async () => {
	expect(await tags({ meta: { mobileWebAppCapable: "yes" } })).toContain(
		'<meta name="mobile-web-app-capable" content="yes">',
	)
})

it("custom nonce", async () => {
	const html = await tags(
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
	)
	expect(html).toContain('<script nonce="abc">var x = 1</script>')
	expect(html).toContain('<script src="/a.js" async id="s"></script>')
	expect(html).toContain('<script src="/b.js"></script>')
	expect(html).not.toContain('src="/a.js" nonce')
})

it("custom both", async () => {
	await expect(tags({ custom: { scripts: [{ src: "/a.js", children: "x" }] } })).rejects.toThrow(/src and children/)
})

it("custom style", async () => {
	const html = await tags({ custom: { styles: [{ children: "a{}" }, { children: "</StYlE>" }] } }, "abc")
	expect(html).toContain('<style nonce="abc">a{}</style>')
	expect(html).not.toContain("</StYlE>")
	expect(html).toContain("<\\/style>")
	expect(await tags({ custom: { styles: [{ children: "a{}" }] } })).not.toContain("nonce")
})

it("script close", async () => {
	const html = await tags({ custom: { scripts: [{ children: "</ScRiPt>" }] } })
	expect(html).not.toContain("</ScRiPt>")
	expect(html).toContain("<\\/script>")
})

it("custom key dropped", async () => {
	const html = await tags({
		custom: {
			links: [{ rel: "preconnect", href: https, "http-equiv": "x", "data-a1": "1", "bad name": "no" }],
			meta: [{ name: "theme-color", content: "black" }],
		},
	})
	expect(html).toContain('rel="preconnect"')
	expect(html).toContain('http-equiv="x"')
	expect(html).toContain('data-a1="1"')
	expect(html).not.toContain("bad name")
	expect(html).toContain('<meta name="theme-color" content="black">')
})

it("custom on dropped", async () => {
	expect(await tags({ custom: { links: [{ onclick: "alert(1)", href: https }] } })).not.toContain("onclick")
})

it("merge", async () => {
	const kept = mergeHead(
		{ title: "Parent", description: "D", css: ["/a.css"], custom: { links: [{ rel: "prev" }] } },
		{ title: "Child" },
	)
	expect(kept.title).toBe("Child")
	expect(await tags(kept)).toContain("<title>Child</title>")
	expect(kept.description).toBe("D")
	expect(kept.css).toEqual(["/a.css"])
	const replacedCss = mergeHead(
		{ css: ["/a.css"] },
		{ css: "/b.css", images: [{ url: `${https}/c.jpg` }], jsonLd: [{ n: 1 }] },
	)
	expect(replacedCss.css).toBe("/b.css")
	const joined = mergeHead(
		{ images: [{ url: `${https}/a.jpg` }], jsonLd: [{ n: 0 }], custom: { links: [{ rel: "prev" }] } },
		{ images: [{ url: `${https}/b.jpg` }], jsonLd: [{ n: 1 }], custom: { links: [{ rel: "next" }] } },
	)
	expect(joined.images?.map((image) => image.url)).toEqual([`${https}/a.jpg`, `${https}/b.jpg`])
	expect(joined.jsonLd).toEqual([{ n: 0 }, { n: 1 }])
	expect(joined.custom?.links?.map((link) => link.rel)).toEqual(["prev", "next"])
})

it("replace", async () => {
	const head = mergeHead({ title: "Parent", description: "D" }, { description: "Child" }, true)
	expect(head.title).toBeUndefined()
	expect(head.description).toBe("Child")
})

it("viewport false", async () => {
	const head = mergeHead({ meta: { viewport: "width=device-width" } }, { meta: { viewport: false } })
	expect(await tags(head)).not.toContain("viewport")
})

it("unknown field", async () => {
	expect(await tags({ nope: "secret" } as Head)).not.toContain("secret")
})

function quietLog(): void {}

function headBroke(): never {
	throw new Error("head broke")
}

it("head throw", async () => {
	const log: Logger = { level: "error", error: quietLog, warn: quietLog, log: quietLog }
	const send = vi.fn<(payload: DevErrorPayload) => void>()
	const errorRender = vi.fn<ErrorRender>(() => "painted")
	const root = createRootLayout("_root_")
		.head(() => ({ title: "Root" }))
		.render((props) => documentOf(["root[", props.children, "]"]))
	const page = createPage("_root_/")
		.loader(() => ({ text: "data" }))
		.head(headBroke)
		.render(() => "page")
		.errorRender(errorRender)
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: page }] })
	const response = await serveWith({ router }, { dev: true, send, log }).fetch(new Request("http://localhost/"))
	expect(response.status).toBe(200)
	const body = await response.text()
	expect(body).toMatch(/<title[^>]*>Root<\/title>/)
	expect(body).toContain("page")
	expect(errorRender).not.toHaveBeenCalled()
	expect(send).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ err: expect.objectContaining({ message: "head broke" }) }),
	)
})
