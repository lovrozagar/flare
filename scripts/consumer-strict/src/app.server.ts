import { createServer } from "@lovrozagar/flare/server";
import { router } from "./app.router";

export const server = createServer(router).authenticateFn(({ request }) => {
	const userId = request.headers.get("x-user");
	return userId ? { userId } : null;
});

export default server;
