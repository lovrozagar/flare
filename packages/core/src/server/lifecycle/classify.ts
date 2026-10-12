import { FN_PREFIX, readInternal, type InternalRequest } from "../../shared/protocol/index.ts";

export type Classified = { status: 404 } | InternalRequest;

// A server-function path never reaches the router. Any other request is a document, data, or prefetch
// request by its query alone (bit 06).
export function classify(url: URL): Classified {
	if (url.pathname.startsWith(FN_PREFIX)) return { status: 404 };
	return readInternal(url);
}
