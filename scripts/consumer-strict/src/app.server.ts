import { createServer } from "@lovrozagar/flare/server";
import { router } from "./app.router";

/* The worker env type flows from here into every route's `ctx.env` through the generated registry. */
type Env = { GREETING: string };

export const server = createServer<Env>(router).authenticateFn(({ env, request }) => {
	const userId = request.headers.get("x-user");
	return userId ? { greeting: env.GREETING, userId } : null;
});

export default server;
