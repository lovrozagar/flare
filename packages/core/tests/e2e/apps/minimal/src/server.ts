import { createMemoryStore, createServer } from "@lovrozagar/flare/server";
import { serverFns } from "./_gen/server-fns.gen.ts";
import { router } from "./router.ts";

// One store for the process, built outside any request (dx/store.md). Only /stored has a cache mode. `site` is an
// https placeholder: a shared render never fetches it.
const store = createMemoryStore();

export const server = createServer({
	router,
	serverFns,
	site: "https://flare.test",
	store,
});
