import { expect, it } from "vitest"
import { createLayout } from "../../src/shared/route-builder/layout.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import type { HeadConfig, HeadScript } from "../../src/shared/route-builder/types.ts"
import { SITE, serve } from "./builder-app.ts"

// dx/head.md's fields and nested objects through the real createServer(...).fetch (B96): pages made with the real
// builders, each with a `.head()`, and the head element of the document the server sends, tag by tag.

// A page at /<name> whose `.head()` returns `config`.
function headPage(name: string, config: () => HeadConfig) {
	return {
		id: `_root_/${name}`,
		path: `/${name}`,
		module: createPage(`_root_/${name}`)
			.head(config)
			.render(() => name),
	}
}

// The tags of the document's head before Flare's own scripts, one string each: the tag name, its attributes as
// written with `data-dh` dropped and the request nonce as `NONCE`, and its text when it has any.
function headTags(html: string, nonce: string): string[] {
	const head = /<head[^>]*>(.*?)<\/head>/s.exec(html)?.[1] ?? ""
	const tags: string[] = []
	for (const match of head.matchAll(/<(title|meta|link|script|style)\b((?:[^>"]|"[^"]*")*)>(?:(.*?)<\/\1>)?/gs)) {
		const attrs = (match[2] ?? "")
			.replaceAll(/ data-dh="[^"]*"/g, "")
			.replaceAll(nonce === "" ? /$^/g : new RegExp(nonce, "g"), "NONCE")
			.trim()
		const text = match[3] === undefined || match[3] === "" ? "" : ` | ${match[3]}`
		tags.push(`${match[1]}${attrs === "" ? "" : ` ${attrs}`}${text}`)
	}
	return tags
}

const IMG = `${SITE}/a.jpg`

// An inline and an external script with `type` and `extra`, and one with neither src nor children.
const SCRIPTS: HeadScript[] = [
	{ children: "var a = '</SCRIPT>'", type: "module", extra: { id: "inline", onload: "x()" } },
	{ src: "/ext.js", async: true, type: "module", extra: { nonce: "evil", id: "ext" } },
	{},
]

// Every field and nested prop on one page.
const ALL: HeadConfig = {
	title: "All",
	description: "about <all>",
	canonical: `${SITE}/all`,
	keywords: "a, b",
	css: ["/a.css", "javascript:alert(1)"],
	languages: { en: `${SITE}/en`, hr: `${SITE}/hr` },
	jsonLd: [{ "@type": "Thing", name: "</script><b>" }, { "@type": "Other" }],
	images: [{ url: IMG, alt: "A", width: 10, height: 20, type: "image/jpeg" }, { url: "javascript:alert(1)" }],
	favicons: {
		ico: "/f.ico",
		svg: "/f.svg",
		appleTouchIcon: "/apple.png",
		"96x96": "/96.png",
		"192x192": "/192.png",
		"512x512": "/512.png",
	},
	robots: {
		index: false,
		follow: false,
		noarchive: true,
		noimageindex: true,
		"max-image-preview": "large",
		"max-snippet": 50,
		"max-video-preview": 30,
	},
	openGraph: {
		type: "article",
		title: "OG",
		description: "og description",
		url: `${SITE}/og`,
		siteName: "Site",
		locale: "en_US",
		alternateLocale: ["hr_HR", "de_DE"],
		images: [{ url: `${SITE}/og.jpg` }],
		audio: [{ url: `${SITE}/a.mp3`, type: "audio/mpeg", secureUrl: `${SITE}/sa.mp3` }],
		videos: [{ url: `${SITE}/v.mp4`, width: 1, height: 2, type: "video/mp4", secureUrl: `${SITE}/sv.mp4` }],
	},
	twitter: {
		card: "summary_large_image",
		site: "@site",
		creator: "@me",
		title: "TW",
		description: "tw description",
		images: [{ url: `${SITE}/t.jpg`, alt: "T" }, { url: `${SITE}/u.jpg` }],
	},
	meta: {
		charset: "utf-8",
		viewport: "width=device-width",
		applicationName: "App",
		author: "Author",
		creator: "Creator",
		publisher: "Publisher",
		generator: "Gen",
		manifest: "/app.webmanifest",
		appleMobileWebAppCapable: "yes",
		appleMobileWebAppTitle: "Apple",
		appleMobileWebAppStatusBarStyle: "black-translucent",
		mobileWebAppCapable: "no",
	},
	custom: {
		links: [{ rel: "preconnect", href: "https://cdn.example.com", onload: "x()", "bad key": "y", "data-k": "v" }],
		meta: [{ "http-equiv": "x-ua-compatible", content: "IE=edge", OnClick: "z()" }],
		scripts: SCRIPTS,
		styles: [{ children: "a{color:red}</style>" }],
	},
}

// Scripts whose `extra` names another origin for `src` or `href`.
const EXTRA_URL: HeadScript[] = [
	{ children: "inline()", extra: { src: "https://evil.example/a.js", id: "in" } },
	{ src: "/ok.js", extra: { src: "https://evil.example/b.js", href: "https://evil.example/c", id: "out" } },
]

const get = serve(
	[
		headPage("all", () => ALL),
		headPage("defaults", () => ({ robots: {}, openGraph: {}, twitter: {}, title: null as unknown as string })),
		headPage("relative", () => ({ title: "Relative", canonical: "/relative" })),
		headPage("extra", () => ({ custom: { scripts: EXTRA_URL } })),
		headPage("both", () => ({
			title: "Both",
			custom: { scripts: [{ src: "/x.js", children: "y" } as never] },
		})),
		{
			id: "_root_/vp/child",
			path: "/vp/child",
			module: createPage("_root_/vp/child")
				.head(() => ({ meta: { viewport: false } }))
				.render(() => "child"),
		},
		{
			id: "_root_/vp/kept",
			path: "/vp/kept",
			module: createPage("_root_/vp/kept")
				.head(() => ({ meta: { author: "Kept" } }))
				.render(() => "kept"),
		},
		{ id: "_root_/plain", path: "/plain", module: createPage("_root_/plain").render(() => "plain") },
	],
	{
		layouts: {
			"_root_/vp": createLayout("_root_/vp")
				.head(() => ({ title: "VP", meta: { viewport: "width=500" } }))
				.render((props) => props.children),
		},
	},
)

// The page's head tags, and the request nonce the CSP header carries.
async function headOf(path: string): Promise<{ status: number; tags: string[]; nonce: string }> {
	const answer = await get(path)
	const nonce = /'nonce-([^']+)'/.exec(answer.headers.get("content-security-policy") ?? "")?.[1] ?? ""
	return { status: answer.status, tags: headTags(answer.text, nonce), nonce }
}

// The top-level fields: title, the description escaped, canonical, keywords, css after the app stylesheet with a
// `javascript:` URL dropped, an hreflang link per language, and one JSON-LD script per object, nonced, its `</script>`
// rewritten so it does not close the tag.
it("fields", async () => {
	const { status, tags, nonce } = await headOf("/all")
	expect(status).toBe(200)
	expect(nonce).not.toBe("")
	expect(tags).toContain("title | All")
	expect(tags).toContain('meta name="description" content="about &lt;all>"')
	expect(tags).toContain(`link rel="canonical" href="${SITE}/all"`)
	expect(tags).toContain('meta name="keywords" content="a, b"')
	expect(tags.filter((tag) => tag.includes('rel="stylesheet"'))).toEqual([expect.stringContaining('href="/a.css"')])
	expect(tags.join("\n")).not.toContain("javascript:")
	expect(tags).toContain(`link rel="alternate" hreflang="en" href="${SITE}/en"`)
	expect(tags).toContain(`link rel="alternate" hreflang="hr" href="${SITE}/hr"`)
	const ld = tags.filter((tag) => tag.includes("application/ld+json"))
	expect(ld).toHaveLength(2)
	expect(ld.every((tag) => tag.includes('nonce="NONCE"'))).toBe(true)
	expect(ld[0]).not.toContain("</script>")
	expect(JSON.parse(ld[0]?.split(" | ")[1] ?? "")).toEqual({ "@type": "Thing", name: "</script><b>" })
})

// `images` first in array order, each SeoImage prop, its `javascript:` entry dropped, then openGraph.images; no
// twitter:image from `images`.
it("images", async () => {
	const { tags } = await headOf("/all")
	const og = tags.filter((tag) => tag.includes('property="og:image'))
	expect(og).toEqual([
		`meta property="og:image" content="${IMG}"`,
		'meta property="og:image:alt" content="A"',
		'meta property="og:image:width" content="10"',
		'meta property="og:image:height" content="20"',
		'meta property="og:image:type" content="image/jpeg"',
		`meta property="og:image" content="${SITE}/og.jpg"`,
	])
})

// Each favicon key is its one link.
it("favicons", async () => {
	const { tags } = await headOf("/all")
	expect(tags.filter((tag) => /rel="(icon|apple-touch-icon)"/.test(tag))).toEqual([
		'link rel="icon" href="/f.ico" sizes="any"',
		'link rel="icon" href="/f.svg" type="image/svg+xml"',
		'link rel="apple-touch-icon" href="/apple.png"',
		'link rel="icon" href="/96.png" type="image/png" sizes="96x96"',
		'link rel="icon" href="/192.png" type="image/png" sizes="192x192"',
		'link rel="icon" href="/512.png" type="image/png" sizes="512x512"',
	])
})

// One robots meta, its tokens in the table's row order; `{}` is index, follow.
it("robots", async () => {
	expect((await headOf("/all")).tags.filter((tag) => tag.includes('name="robots"'))).toEqual([
		'meta name="robots" content="noindex, nofollow, noarchive, noimageindex, max-image-preview:large, max-snippet:50, max-video-preview:30"',
	])
	expect((await headOf("/defaults")).tags.filter((tag) => tag.includes('name="robots"'))).toEqual([
		'meta name="robots" content="index, follow"',
	])
})

// Every openGraph prop as its og meta; `openGraph: {}` is og:type website.
it("open graph", async () => {
	const og = (await headOf("/all")).tags.filter((tag) => /property="og:(?!image)/.test(tag))
	expect(og).toEqual(
		expect.arrayContaining([
			'meta property="og:type" content="article"',
			'meta property="og:title" content="OG"',
			'meta property="og:description" content="og description"',
			`meta property="og:url" content="${SITE}/og"`,
			'meta property="og:site_name" content="Site"',
			'meta property="og:locale" content="en_US"',
			'meta property="og:locale:alternate" content="hr_HR"',
			'meta property="og:locale:alternate" content="de_DE"',
			`meta property="og:audio" content="${SITE}/a.mp3"`,
			'meta property="og:audio:type" content="audio/mpeg"',
			`meta property="og:audio:secure_url" content="${SITE}/sa.mp3"`,
			`meta property="og:video" content="${SITE}/v.mp4"`,
			'meta property="og:video:width" content="1"',
			'meta property="og:video:height" content="2"',
			'meta property="og:video:type" content="video/mp4"',
			`meta property="og:video:secure_url" content="${SITE}/sv.mp4"`,
		]),
	)
	expect(og).toHaveLength(16)
	const defaults = (await headOf("/defaults")).tags.filter((tag) => tag.includes('property="og:'))
	expect(defaults).toEqual(['meta property="og:type" content="website"'])
})

// Every twitter prop as its twitter meta, an image's alt only when set; `twitter: {}` is the summary card.
it("twitter", async () => {
	expect((await headOf("/all")).tags.filter((tag) => tag.includes('name="twitter:'))).toEqual(
		expect.arrayContaining([
			'meta name="twitter:card" content="summary_large_image"',
			'meta name="twitter:site" content="@site"',
			'meta name="twitter:creator" content="@me"',
			'meta name="twitter:title" content="TW"',
			'meta name="twitter:description" content="tw description"',
			`meta name="twitter:image" content="${SITE}/t.jpg"`,
			'meta name="twitter:image:alt" content="T"',
			`meta name="twitter:image" content="${SITE}/u.jpg"`,
		]),
	)
	expect((await headOf("/all")).tags.filter((tag) => tag.includes('name="twitter:'))).toHaveLength(8)
	expect((await headOf("/defaults")).tags.filter((tag) => tag.includes('name="twitter:'))).toEqual([
		'meta name="twitter:card" content="summary"',
	])
})

// Every meta prop as its tag; `viewport: false` removes a parent's viewport and writes none.
it("meta", async () => {
	expect((await headOf("/all")).tags).toEqual(
		expect.arrayContaining([
			'meta charset="utf-8"',
			'meta name="viewport" content="width=device-width"',
			'meta name="application-name" content="App"',
			'meta name="author" content="Author"',
			'meta name="creator" content="Creator"',
			'meta name="publisher" content="Publisher"',
			'meta name="generator" content="Gen"',
			'link rel="manifest" href="/app.webmanifest"',
			'meta name="apple-mobile-web-app-capable" content="yes"',
			'meta name="apple-mobile-web-app-title" content="Apple"',
			'meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"',
			'meta name="mobile-web-app-capable" content="no"',
		]),
	)
	const viewports = async (path: string) => (await headOf(path)).tags.filter((tag) => tag.includes('name="viewport"'))
	expect(await viewports("/vp/kept")).toEqual(['meta name="viewport" content="width=500"'])
	expect(await viewports("/vp/child")).toEqual([])
})

// custom: links and meta keep the allowed attribute names and drop `on*` and any other; a script's `type` and `extra`
// are written; an inline script and a style carry the nonce with their closing tag rewritten in its own spelling; an
// external script has no nonce and `extra`'s nonce is ignored; a script with neither src nor children is dropped.
// A script's `src` comes from its own field only: `src` or `href` in `extra` is dropped, so head data from a CMS or a
// loader cannot point a nonced inline script, or an external one, at another origin (plan 21 12.2, BUGS.md 160).
it("custom extra url", async () => {
	const scripts = (await headOf("/extra")).tags.filter((tag) => tag.includes('id="in"') || tag.includes('id="out"'))
	expect(scripts).toEqual(['script src="/ok.js" id="out"', 'script id="in" nonce="NONCE" | inline()'])
	expect(scripts.join(" ")).not.toContain("evil.example")
})

it("custom", async () => {
	const { tags } = await headOf("/all")
	expect(tags).toContain('link rel="preconnect" href="https://cdn.example.com" data-k="v"')
	expect(tags).toContain('meta http-equiv="x-ua-compatible" content="IE=edge"')
	const scripts = tags.filter((tag) => tag.startsWith("script") && !tag.includes("ld+json") && !tag.includes("_$HY"))
	expect(scripts).toEqual([
		'script src="/ext.js" type="module" async id="ext"',
		'script type="module" id="inline" nonce="NONCE" | var a = \'<\\/SCRIPT>\'',
	])
	expect(tags).toContain('style nonce="NONCE" | a{color:red}<\\/style>')
})

// A null title is omitted, not "null"; a relative canonical and a script with both src and children throw, which
// omits that match's head and keeps the loader's status; no `.head()` writes nothing of its own.
it("omitted", async () => {
	const defaults = await headOf("/defaults")
	expect(defaults.tags.filter((tag) => tag.startsWith("title"))).toEqual([])
	for (const path of ["/relative", "/both"]) {
		const { status, tags } = await headOf(path)
		expect([path, status]).toEqual([path, 200])
		expect(tags.filter((tag) => tag.startsWith("title"))).toEqual([])
	}
	const plain = await headOf("/plain")
	expect(plain.tags.filter((tag) => /^(title|meta name=|link rel="(canonical|icon)")/.test(tag))).toEqual([])
})
