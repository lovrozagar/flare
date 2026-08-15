import { i18n } from "@lovrozagar/flare/middleware/i18n";
import { createServer } from "@lovrozagar/flare/server";
import { router } from "./router";

export const server = createServer(router)
	.use(i18n())
	.serverContext(() => ({}))
	.keepalive({ interval: 60_000 });

export default server;
