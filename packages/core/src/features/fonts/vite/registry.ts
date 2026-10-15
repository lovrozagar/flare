import registry from "../registry.json" with { type: "json" }
import type { FontRegistry } from "./emit.ts"

// The registry's file urls for the build-time copy. The family modules carry the rest (B78).
export const fontRegistry: FontRegistry = registry
