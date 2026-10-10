import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/sitemap.xml").response(
	() => new Response("<urlset />", { headers: { "content-type": "application/xml" } }),
);
