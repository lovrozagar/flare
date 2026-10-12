import { createMemoryStore, createServer } from "@lovrozagar/flare/server";
import { echo } from "./fns/echo.ts";
import { router } from "./router.ts";

// Until codegen writes src/_gen/server-fns.gen.ts (bit 12), the app lists its one server function by hand.
// One store for the process, built outside any request (dx/store.md). Only /stored has a cache mode. `site` is an
// https placeholder: a shared render never fetches it.
const store = createMemoryStore();

export const server = createServer({
	router,
	serverFns: { [echo.id]: async () => echo },
	site: "https://flare.test",
	store,
});
