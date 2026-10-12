import { readInternal } from "../../shared/protocol/index.ts";

// One cache entry per URL: the request kind, then the path and the user's search with the internal params
// removed. A document, a data response, and a prefetch of one page are three entries. There is no Vary. A bad
// `_flare` value is no entry.
export function variantId(url: URL): string | undefined {
	const read = readInternal(url);
	if (read.status !== 200) return undefined;
	return `${read.kind}:${read.url.pathname}${read.url.search}`;
}
