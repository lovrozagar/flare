import { flare } from "@lovrozagar/flare/vite";
import { defineConfig } from "vite";

// The real dev path: flare() serves src/server.ts through the SSR runner and the client hydrates (B89). A build
// prerenders the ssg pages into the client output (static.test).
export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [
		flare({
			prerender: true,
			workersDev: process.env["FLARE_E2E_RUNTIME"] === "workers" && { inspectorPort: 0, persistState: false },
		}),
	],
});
