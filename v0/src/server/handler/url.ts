/**
 * URL Handling
 *
 * URL normalization and static file detection.
 */

function normalizeUrl(url: URL): Response | null {
	/* Only strip trailing slashes - don't lowercase as dynamic params may need case sensitivity */
	if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
		const normalized = new URL(url)
		normalized.pathname = normalized.pathname.slice(0, -1)
		return Response.redirect(normalized.toString(), 301)
	}

	return null
}

function handleStaticFile(url: URL): Response | null {
	const staticExtMatch = url.pathname.match(/\.[a-z0-9]{2,6}$/i)
	if (staticExtMatch) {
		const ext = staticExtMatch[0].toLowerCase()
		if (ext !== ".html") {
			return new Response("Not Found", { status: 404 })
		}
	}
	return null
}

export { handleStaticFile, normalizeUrl }
