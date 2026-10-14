import { flare } from "@lovrozagar/flare/vite";
import { defineConfig } from "vite";

// The real dev path, as minimal uses it, under the router's basePath.
export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [flare({ workersDev: process.env["FLARE_E2E_RUNTIME"] === "workers" })],
});
