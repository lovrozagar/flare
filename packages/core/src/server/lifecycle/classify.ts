import { FN_PREFIX, readInternal, type InternalRequest } from "../../shared/protocol/index.ts";

// A server-function path keeps its whole query, because dispatch reads `_i` alone (B43). It never reaches the
// router. Any other request is a document, data, or prefetch request by its query alone (bit 06).
export function classify(url: URL): InternalRequest {
	if (isServerFn(url)) return { status: 200, kind: "document", url, stale: null };
	return readInternal(url);
}

export function isServerFn(url: URL): boolean {
	return url.pathname.startsWith(FN_PREFIX);
}
