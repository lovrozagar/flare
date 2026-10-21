import { createRouter } from "@lovrozagar/flare"
import { chunks, layouts, routeTree } from "./_gen/routes.gen.ts"

// v0.9.23's router turned view transitions on; so does the port.
export const router = createRouter({ layouts, routeTree, chunks, viewTransitions: true })
