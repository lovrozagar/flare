// dx/router.md rewrite. `search` keeps its leading "?" and `hash` its leading "#"; each is "" when absent.
export type Location = { pathname: string; search: string; hash: string }

// The client rewrite. Undefined leaves the location alone. The server rewrite is (path) => path (dx/server.md).
export type LocationRewrite = (location: Location) => Location | undefined
