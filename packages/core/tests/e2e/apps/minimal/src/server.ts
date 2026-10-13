import { createAssetsStore, createMemoryStore, createServer, type FlareStore } from "@lovrozagar/flare/server";
import { fileURLToPath } from "node:url";
import { fileAssets } from "@lovrozagar/flare/stores/fs";
import { serverFns } from "./_gen/server-fns.gen.ts";
import { router } from "./router.ts";

// One store for the process, built outside any request (dx/store.md). Only /stored has a cache mode. `site` is an
// https placeholder: a shared render never fetches it.
const store = createMemoryStore();

// The prerendered seeds (dx/store.md). On Workers the ASSETS binding serves the client output. On Node and Bun the
// files sit beside the built server, in `<outDir>/client`. `vite dev` has none, so an ssg page renders live there.
function seeds(env: unknown): FlareStore {
	const binding: unknown = typeof env === "object" && env !== null ? Reflect.get(env, "ASSETS") : undefined;
	if (typeof binding === "object" && binding !== null && "fetch" in binding && typeof binding.fetch === "function") {
		const fetch = binding.fetch.bind(binding);
		return createAssetsStore((path) => fetch(new URL(path, "http://assets")));
	}
	return createAssetsStore(fileAssets(fileURLToPath(new URL("../client", import.meta.url))));
}

export const server = createServer({
	router,
	serverFns,
	site: "https://flare.test",
	store,
	static: seeds,
});
