import { fnPrefix, readInternal, type InternalRequest } from "../../shared/protocol/index.ts"

// A server-function path keeps its whole query, because dispatch reads `_i` alone (B43). It never reaches the
// router. Any other request is a document, data, or prefetch request by its query alone (bit 06).
export function classify(url: URL, basePath: string): InternalRequest {
	if (isServerFn(url, basePath)) return { status: 200, kind: "document", url, stale: null }
	return readInternal(url)
}

// `<basePath>/_flare/fn/` (B41). With a base, the root prefix is an ordinary path.
export function isServerFn(url: URL, basePath: string): boolean {
	return url.pathname.startsWith(fnPrefix(basePath))
}
