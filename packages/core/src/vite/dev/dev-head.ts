// What `transformIndexHtml` adds to an empty document: Vite's client and every plugin's tags, in Vite's order (B95
// (b)). Every dev runtime's server writes it last in a dev document's head, so no app HTML goes through Vite and no
// app script is rewritten. It is computed once per dev server; a config change restarts the server, which computes it
// again. A plugin whose output depends on the request URL gets "/" here, so it is not supported (dx/plugin.md).
export type HtmlTransformer = { transformIndexHtml(url: string, html: string): Promise<string> };

export const EMPTY_DOCUMENT = "<!doctype html><html><head></head><body></body></html>";

// The document's own skeleton tags, which the empty document already had, and Vite's indentation between tags.
const SKELETON = /<!doctype html>|<\/?(?:html|head|body)(?:\s[^>]*)?>/gi;
const BETWEEN = />\s+</g;

export async function devHead(server: HtmlTransformer): Promise<string> {
	const html = await server.transformIndexHtml("/", EMPTY_DOCUMENT);
	return html.replaceAll(SKELETON, "").trim().replaceAll(BETWEEN, "><");
}
