// The request param that selects a data or prefetch response, and the one that lists stale page ids.
export const KIND_PARAM = "_flare";
export const STALE_PARAM = "_flare_stale";

export const FN_PREFIX = "/_flare/fn/";

// The one query param a GET server function reads: its JSON input.
export const INPUT_PARAM = "_i";

// Response headers Flare writes. The server never reads a flare-build request header (bit 06).
export const BUILD_HEADER = "flare-build";
export const RENDER_HEADER = "flare-render";
export const CACHE_HEADER = "flare-cache";
