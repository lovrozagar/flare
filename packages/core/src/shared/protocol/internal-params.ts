import { KIND_PARAM, STALE_PARAM } from "./constants.ts";

export type RequestKind = "document" | "data" | "prefetch";

// `url` is what the router and the loaders see: both internal params are removed, the user's search stays.
export type InternalRequest = { status: 400 } | { status: 200; kind: RequestKind; url: URL; stale: string | null };

export type StaleList = { all: boolean; ids: ReadonlySet<string> };

const KINDS: Record<string, RequestKind> = { data: "data", prefetch: "prefetch" };

const CAP_BYTES = 8 * 1024;

// Only the query selects a data response. A request header never does (bit 06).
export function readInternal(request: URL): InternalRequest {
	const url = new URL(request);
	const mode = url.searchParams.get(KIND_PARAM);
	const kind = mode === null ? "document" : KINDS[mode];
	if (kind === undefined) return { status: 400 };
	const stale = kind === "document" ? null : url.searchParams.get(STALE_PARAM);
	url.searchParams.delete(KIND_PARAM);
	url.searchParams.delete(STALE_PARAM);
	return { status: 200, kind, url, stale };
}

// The page ids the client already holds, space-joined (B30). Past 8 KiB of UTF-8 the list is not read and
// every page loader counts as stale, the bit 04 fallback.
export function staleList(raw: string | null): StaleList | null {
	if (raw === null) return null;
	if (new TextEncoder().encode(raw).length > CAP_BYTES) return { all: true, ids: new Set() };
	return { all: false, ids: new Set(raw.split(" ")) };
}
