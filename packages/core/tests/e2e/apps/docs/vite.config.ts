import tailwindcss from "@tailwindcss/vite";
import { flare } from "@lovrozagar/flare/vite";
import { defineConfig } from "vite";

// The workers boots compose Cloudflare's plugin, as a Workers app does (B109); every other boot stays on Node. The
// import is lazy, so an app staged with only the packed flare (bits/14) loads this config. Its inspector takes a port
// the OS assigns and its state stays in memory, so parallel boots neither race nor write into the app (BUGS.md 85).
const workers =
	process.env["FLARE_E2E_RUNTIME"] === "workers"
		? [
				(await import("@cloudflare/vite-plugin")).cloudflare({
					viteEnvironment: { name: "ssr" },
					inspectorPort: 0,
					persistState: false,
				}),
			]
		: [];

// Every flare() option the docs site uses (bits/15). Tailwind is the app's own plugin (B14). The Inter files come
// from `assets/fonts`, and the build emits only the families the client imports. A build prerenders the SSG pages
// and writes the sitemap and robots.txt beside them.
export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [
		...workers,
		tailwindcss(),
		flare({
			image: { widths: [480, 960, 1600], quality: 72 },
			css: { reset: true },
			fonts: { dir: "assets/fonts" },
			broadcast: true,
			prerender: {
				concurrency: 2,
				env: () => ({ DOCS_PRERENDER: "1" }),
				exclude: [],
				sitemap: {
					robotsTxt: "User-agent: *\nDisallow: /admin\n",
					changefreq: { "[[locale]]/_root_/": "weekly", "[[locale]]/_root_/(guide)/docs/[slug]": "monthly" },
					priority: { "[[locale]]/_root_/": 1 },
					exclude: ["[[locale]]/_root_/error", "[[locale]]/_root_/login", "[[locale]]/_root_/legacy"],
					additionalEntries: [{ loc: "https://flare.test/api/server/create-server", changefreq: "monthly" }],
				},
			},
		}),
	],
});
