import { createServer } from "flare/server"
import { router } from "./router"

export const server = createServer(router)
