import { createRouter } from "@lovrozagar/flare"
import { chunks, layouts, routeTree } from "./_gen/routes.gen.ts"

// The app lives under /app (B146). The router's defaults stand where the docs app sets a value: an unknown URL is the
// root's not-found, and a link prefetches its route's data as well as its modules.
export const router = createRouter({ basePath: "/app", layouts, routeTree, chunks, notFoundMode: "root" })
