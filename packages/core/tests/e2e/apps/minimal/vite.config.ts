import { flare } from "@lovrozagar/flare/vite";
import { defineConfig } from "vite";

// The real dev path: flare() serves src/server.ts through the SSR runner and the client hydrates (B89).
export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [flare()],
});
