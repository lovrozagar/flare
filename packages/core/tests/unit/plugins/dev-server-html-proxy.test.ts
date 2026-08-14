/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { peelInlineTags, restoreInlineTags } from "../../../src/plugins/dev-server.ts"

describe("peelInlineTags — Vite html-proxy guard", () => {
	it("peels inline script and style, keeps src scripts and body position", () => {
		const html = [
			"<!doctype html><html><head>",
			'<meta name="csp-nonce" nonce="abc">',
			'<script nonce="abc">window.__flare_theme__=1</script>',
			'<style nonce="abc">html{color-scheme:light}</style>',
			'<link rel="modulepreload" href="/assets/client.js"/>',
			'<script type="module" src="/@vite/client"></script>',
			"</head><body>",
			'<script data-flare-state>self.flare={}</script>',
			'<script nonce="abc" type="module" async>import("/src/client.tsx")</script>',
			"</body></html>",
		].join("")

		const { html: peeledHtml, tags } = peelInlineTags(html)

		expect(tags).toHaveLength(4)
		expect(tags.join("")).toContain("window.__flare_theme__=1")
		expect(tags.join("")).toContain("color-scheme:light")
		expect(tags.join("")).toContain("self.flare={}")
		expect(tags.join("")).toContain('import("/src/client.tsx")')
		expect(peeledHtml).not.toContain("window.__flare_theme__")
		expect(peeledHtml).not.toContain("import(")
		expect(peeledHtml).toContain('src="/@vite/client"')
		expect(peeledHtml).toContain('rel="modulepreload"')
		expect(peeledHtml).toContain("<!--flare-inline-0-->")
		expect(peeledHtml.indexOf("<!--flare-inline-2-->")).toBeLessThan(
			peeledHtml.indexOf("<!--flare-inline-3-->"),
		)
	})

	it("restores tags in place after transformIndexHtml injects vite client", () => {
		const original = [
			"<html><head>",
			"<script>theme()</script>",
			'<link rel="stylesheet" href="/a.css">',
			"</head><body>",
			'<script type="module" async>import("/src/client.tsx")</script>',
			"</body></html>",
		].join("")
		const { html: peeledHtml, tags } = peelInlineTags(original)
		const transformed = peeledHtml.replace(
			"<head>",
			'<head><script type="module" src="/@vite/client"></script>',
		)
		const restored = restoreInlineTags(transformed, tags)

		expect(restored).toContain("<script>theme()</script>")
		expect(restored).toContain('import("/src/client.tsx")')
		expect(restored).not.toContain("html-proxy")
		expect(restored).not.toContain("<!--flare-inline-")
		expect(restored.indexOf("theme()")).toBeGreaterThan(restored.indexOf("/@vite/client"))
		expect(restored.indexOf("theme()")).toBeLessThan(restored.indexOf("import("))
	})

	it("is a no-op when there are no inline tags", () => {
		const html = '<html><head><script src="/app.js"></script></head><body>hi</body></html>'
		const { html: peeledHtml, tags } = peelInlineTags(html)
		expect(tags).toEqual([])
		expect(peeledHtml).toBe(html)
		expect(restoreInlineTags(html, [])).toBe(html)
	})
})
