import { createPage } from "flare/page"

export const route = createPage("_root_/sitemap.xml").response(() => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://localhost:4101/</loc></url>
  <url><loc>http://localhost:4101/about</loc></url>
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`
	return new Response(xml, {
		headers: { "content-type": "application/xml; charset=utf-8" },
	})
})
