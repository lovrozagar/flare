// The query a navigation writes as given, byte for byte, under a key no app object can set by accident or through a
// spread: a module-private symbol, imported only inside Flare and absent from the public types. Only the locale
// provider uses it, to keep the page's query through setLocale (BUGS.md 441).
export const RAW_SEARCH: unique symbol = Symbol("flare.rawSearch")
