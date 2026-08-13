/**
 * ETag utilities for store-served responses (SSG, ISR, SSR cache hits).
 * Uses weak ETags because per-request CSP nonce injection changes
 * the actual bytes while content is semantically identical.
 */

/** Compute weak ETag from content using SHA-256, truncated to 16 hex chars */
export async function computeEtag(body: string): Promise<string> {
	const encoded = new TextEncoder().encode(body)
	const hash = await crypto.subtle.digest("SHA-256", encoded)
	const hex = Array.from(new Uint8Array(hash))
		.slice(0, 8)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
	return `W/"${hex}"`
}

/**
 * Weak comparison per RFC 9110 section 8.8.3.2.
 * Strips W/ prefix, compares opaque tags.
 * Supports comma-separated If-None-Match values and wildcard *.
 */
export function weakMatch(ifNoneMatch: string, etag: string): boolean {
	const trimmed = ifNoneMatch.trim()
	if (trimmed === "*") return true

	const etagNorm = etag.trim().replace(/^W\//, "")

	/* Fast path: single value (no comma) avoids split + array allocation */
	if (!trimmed.includes(",")) {
		return trimmed.replace(/^W\//, "") === etagNorm
	}

	return trimmed.split(",").some((c) => c.trim().replace(/^W\//, "") === etagNorm)
}

/**
 * Build Vary header value. Always includes `x-d` (flare's NDJSON protocol header).
 * Additional values are appended, with deduplication.
 */
export function buildVaryHeader(additional?: string[]): string {
	const values = ["x-d"]
	if (additional) {
		for (const v of additional) {
			if (!values.some((existing) => existing.toLowerCase() === v.toLowerCase())) {
				values.push(v)
			}
		}
	}
	return values.join(", ")
}
