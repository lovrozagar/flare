import { createRouter } from "@lovrozagar/flare"
import { chunks, layouts, routeTree } from "./_gen/routes.gen.ts"

export const router = createRouter({ basePath: "/app", layouts, routeTree, chunks })
