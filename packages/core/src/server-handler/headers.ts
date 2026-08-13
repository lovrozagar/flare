export type FlareCacheStatus = "HIT" | "MISS" | "STALE"
export type FlareRenderMode = "ISR" | "SSG" | "SSR"

export const FLARE_CACHE_HEADER = "Flare-Cache" as const
export const FLARE_RENDER_HEADER = "Flare-Render" as const
