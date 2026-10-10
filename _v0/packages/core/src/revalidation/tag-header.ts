/** Cache-tag header names and formats. Runtime-safe (no node:*). */

export const DEFAULT_TAG_HEADER = "Surrogate-Key";

/** Cloudflare `Cache-Tag` is comma-separated; `Surrogate-Key` and the rest use spaces. */
export function tagSeparator(header: string): string {
	return header.toLowerCase() === "cache-tag" ? "," : " ";
}

/** Split a tag header value. */
export function parseTags(value: string, header: string): string[] {
	return value
		.split(tagSeparator(header))
		.map((t) => t.trim())
		.filter(Boolean);
}

/**
 * Flare writes tags as `Surrogate-Key`; when the CDN reads another header, move them there in
 * that header's format. Returns the response unchanged when nothing to do.
 */
export function applyTagHeader(response: Response, header: string | undefined): Response {
	if (!header || header.toLowerCase() === DEFAULT_TAG_HEADER.toLowerCase()) return response;
	const value = response.headers.get(DEFAULT_TAG_HEADER);
	if (!value) return response;
	const tags = parseTags(value, DEFAULT_TAG_HEADER);
	try {
		response.headers.set(header, tags.join(tagSeparator(header)));
		response.headers.delete(DEFAULT_TAG_HEADER);
		return response;
	} catch {
		/* immutable headers (a fetched response): copy */
		const headers = new Headers(response.headers);
		headers.set(header, tags.join(tagSeparator(header)));
		headers.delete(DEFAULT_TAG_HEADER);
		return new Response(response.body, { headers, status: response.status, statusText: response.statusText });
	}
}
