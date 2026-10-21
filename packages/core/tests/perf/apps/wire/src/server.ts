import { createServer } from "@lovrozagar/flare/server"
import { router } from "./router.ts"

export const server = createServer({ router })
