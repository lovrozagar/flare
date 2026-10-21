import { expect, it } from "vitest"
import { headTags } from "./tags.ts"
import { isOwned, ownedHtml } from "./owned.ts"

// Title and meta are Solid's useHead's, which keys and replaces them. Every link, script, and style is Flare's own
// (BUGS.md 460).
it("owned split", () => {
	const tags = headTags({
		title: "T",
		description: "d",
		canonical: "https://example.com/a",
		css: "/a.css",
		jsonLd: [{ "@type": "Thing" }],
		custom: {
			links: [{ rel: "preconnect", href: "https://x.example" }],
			meta: [{ name: "x", content: "y" }],
			scripts: [{ src: "/count.js" }, { children: "run()" }],
			styles: [{ children: "a{color:red}" }],
		},
	})
	expect(tags.filter((tag) => !isOwned(tag)).map((tag) => tag.tag)).toEqual(["title", "meta", "meta"])
	expect(tags.filter(isOwned).map((tag) => tag.tag)).toEqual([
		"link",
		"link",
		"script",
		"link",
		"script",
		"script",
		"style",
	])
})

// Each owned tag as the server writes it: its `data-fh` key, its attributes escaped, `true` as a bare attribute,
// `false` not written, and a script's or style's text as headTags kept it.
it("owned html", () => {
	const tags = headTags(
		{
			custom: {
				links: [{ rel: "preconnect", href: 'https://x.example/?a=1&b="2"' }],
				scripts: [{ src: "/count.js", async: true }, { children: "run('</script>')" }],
				styles: [{ children: "a{color:red}" }],
			},
		},
		{ nonce: "n0" },
	).filter(isOwned)
	const keys = tags.map((tag) => tag.key.replaceAll("&", "&amp;").replaceAll('"', "&quot;"))
	expect(ownedHtml(tags)).toBe(
		[
			`<link rel="preconnect" href="https://x.example/?a=1&amp;b=&quot;2&quot;" data-fh="${keys[0]}">`,
			`<script src="/count.js" async data-fh="${keys[1]}"></script>`,
			`<script nonce="n0" data-fh="${keys[2]}">run('<\\/script>')</script>`,
			`<style nonce="n0" data-fh="${keys[3]}">a{color:red}</style>`,
		].join(""),
	)
	expect(ownedHtml([])).toBe("")
})
