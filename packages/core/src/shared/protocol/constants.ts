// The request param that selects a data or prefetch response, and the one that lists stale page ids.
export const KIND_PARAM = "_flare"
export const STALE_PARAM = "_flare_stale"

export const FN_PREFIX = "/_flare/fn/"

// The one query param a GET server function reads: its JSON input.
export const INPUT_PARAM = "_i"

// The client's build on a GET server function's URL, beside `_i`. A cache keyed on the URL, the browser's or a CDN's,
// then keeps each build's answers apart, so after a deploy no client reads the answer the previous build cached. The
// server checks only its shape (B43, plan 21 8.5).
export const BUILD_PARAM = "_b"

// Response headers Flare writes. The server never reads a flare-build request header (bit 06).
export const BUILD_HEADER = "flare-build"
export const RENDER_HEADER = "flare-render"
export const CACHE_HEADER = "flare-cache"

// Marks a server function's returned Response, so the client resolves it untouched instead of reading an envelope.
export const FN_HEADER = "flare-fn"

// `set` on a server function's answer whose own returned Response wrote a cookie, which fetch cannot read, so the
// client forgets the matches and queries it held for the visitor before (B133).
export const COOKIES_HEADER = "flare-cookies"

// On a data answer that is a bare named status (a loader's notFound(), a gate's 401 or 403), the id of the match that
// failed, so the client paints the failure at that match (B77, BUGS.md 134). A data answer keeps "no e frame".
export const FAILED_HEADER = "flare-failed"

// Dev only: the request header that names the tab a request came from, so a dev error reaches that tab (B42). The dev
// server writes it, and a production server never sees it.
export const TAB_HEADER = "flare-dev-tab"
