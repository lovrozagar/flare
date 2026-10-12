import { FN_PREFIX, KIND_PARAM, STALE_PARAM } from "./constants.ts";

// `fill` asks for a stored page's `"stream"` values. It is its own URL, so a CDN never answers it with the data copy.
export type RequestKind = "document" | "data" | "prefetch" | "fill";

// `url` is what the router and the loaders see: both internal params are removed, the user's search stays.
export type InternalRequest = { status: 400 } | { status: 200; kind: RequestKind; url: URL; stale: string | null };

export type StaleList = { all: boolean; ids: ReadonlySet<string> };

const KINDS: Record<string, RequestKind> = { data: "data", prefetch: "prefetch", fill: "fill" };

const INTERNAL = new Set([KIND_PARAM, STALE_PARAM]);

const CAP_BYTES = 8 * 1024;

// The server-function endpoint sits under the router's basePath like every route (B41).
export function fnPrefix(basePath: string): string {
	return basePath === "/" ? FN_PREFIX : `${basePath}${FN_PREFIX}`;
}

// Only the query selects a data response. A request header never does (bit 06).
export function readInternal(request: URL): InternalRequest {
	const values = new URLSearchParams(request.search);
	const mode = values.get(KIND_PARAM);
	const kind = mode === null ? "document" : KINDS[mode];
	if (kind === undefined) return { status: 400 };
	const stale = kind === "document" ? null : values.get(STALE_PARAM);
	return { status: 200, kind, url: withoutInternal(request), stale };
}

// The internal params never come from an app's search record (bit 06 `strips reserved`).
export function withoutInternalKeys(search: object | undefined): Record<string, unknown> | undefined {
	if (search === undefined) return undefined;
	return Object.fromEntries(Object.entries(search).filter(([key]) => !INTERNAL.has(key)));
}

// The user's pairs are kept byte for byte. A URLSearchParams write would re-serialize the whole query as form
// data, and the match ids, raw params plus raw search, would then differ from the client's (B31).
function withoutInternal(request: URL): URL {
	const url = new URL(request);
	const pairs = url.search.slice(1).split("&");
	const kept = pairs.filter((pair) => !INTERNAL.has(nameOf(pair)));
	if (kept.length < pairs.length) url.search = kept.join("&");
	return url;
}

function nameOf(pair: string): string {
	return [...new URLSearchParams(pair).keys()].join("");
}

// The page ids the client already holds, space-joined (B30). Past 8 KiB of UTF-8 the list is not read and
// every page loader counts as stale, the bit 04 fallback.
export function staleList(raw: string | null): StaleList | null {
	if (raw === null) return null;
	if (new TextEncoder().encode(raw).length > CAP_BYTES) return { all: true, ids: new Set() };
	return { all: false, ids: new Set(raw.split(" ")) };
}
