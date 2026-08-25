export type FlareCacheStatus = "HIT" | "MISS" | "STALE";
export type FlareRenderMode = "ISR" | "SSG" | "SSR";

export { FLARE_CACHE_HEADER, FLARE_RENDER_HEADER } from "../protocol.ts";
