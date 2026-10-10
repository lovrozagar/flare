import { createServer } from "@lovrozagar/flare/server";
import { router } from "./router";

export const server = createServer(router);
