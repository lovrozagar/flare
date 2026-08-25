/**
 * Flare wire protocol identifiers.
 *
 * Headers, URL prefixes, HTML attrs, and window queues are spelled out.
 * NDJSON `t` codes and FlareState keys stay short (bandwidth).
 */

/** Request: CSR data / NDJSON. Flag value is always `"1"`. */
export const HEADER_DATA = "flare-data";
/** Request: prefetch (no cookie commit, cause = prefetch). */
export const HEADER_PREFETCH = "flare-prefetch";
/** Request: comma-separated match ids the client already has. */
export const HEADER_STALE = "flare-stale";
/** Internal: ISR background re-render (prevents recursion). */
export const HEADER_ISR = "flare-isr";
/** Internal: build-time prerender fetch. */
export const HEADER_PRERENDER = "flare-prerender";
/** Shared flag for boolean protocol headers. */
export const HEADER_FLAG = "1";

/** Response diagnostic: HIT | MISS | STALE. Lowercase to match HTTP/2 / Node. */
export const FLARE_CACHE_HEADER = "flare-cache";
/** Response diagnostic: ISR | SSG | SSR. */
export const FLARE_RENDER_HEADER = "flare-render";

/** Reserved prefix for Flare-owned endpoints (keepalive, image, revalidate, server-fn). */
export const INTERNAL_PATH_PREFIX = "/_flare/";
/** Server function HTTP path prefix: `/_flare/server-fn/{id}/{name}`. */
export const SERVER_FN_PREFIX = "/_flare/server-fn";

/** Hidden `<form>` field for progressive-enhancement POST. */
export const FORM_FN_FIELD = "flare_fn";
/** Set on `<html>` after `solidHydrate` completes. */
export const ATTR_HYDRATED = "data-flare-hydrated";

/** Window queue: SSR deferred chunks. `__` so stream scripts survive `self.flare = {}`. */
export const GLOBAL_DEFER = "__flare_defer";
/** Window queue: SSR query-cache dehydrate. */
export const GLOBAL_QUERIES = "__flare_queries";
/** Test/runtime: in-flight lazy imports. */
export const GLOBAL_LAZY_PENDING = "__flare_lazy_pending";
/** Test/runtime: resolved lazy imports. */
export const GLOBAL_LAZY_LOADED = "__flare_lazy_loaded";
/** sessionStorage: chunk-load reload guard. */
export const STORAGE_CHUNK_RELOAD = "flare_chunk_reload";

export function isServerFnPathname(pathname: string): boolean {
	return pathname === SERVER_FN_PREFIX || pathname.startsWith(`${SERVER_FN_PREFIX}/`);
}

export function serverFnPath(id: string, name: string): string {
	return `${SERVER_FN_PREFIX}/${id}/${name}`;
}

export function parseServerFnPathname(pathname: string): { id: string; name: string } | undefined {
	if (!isServerFnPathname(pathname)) return undefined;
	const rest = pathname.slice(SERVER_FN_PREFIX.length);
	const segments = rest.split("/").filter(Boolean);
	const id = segments[0];
	const name = segments[1];
	if (!id || !name) return undefined;
	return { id, name };
}
