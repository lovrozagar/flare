import { createPage } from "flare/page"

export const route = createPage("_root_/sitemap.xml").response(() => {
	const xml = [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
		`  <url><loc>https://example.com/</loc></url>`,
		`  <url><loc>https://example.com/about</loc></url>`,
		`</urlset>`,
	].join("\n")

	return new Response(xml, {
		headers: { "Content-Type": "application/xml" },
	})
})
