import { flare } from "@lovrozagar/flare/vite";
import { defineConfig } from "vite";

// The locale slot with theme, direction, and locale on one app (B70). minimal does not gain them.
export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [flare()],
});
