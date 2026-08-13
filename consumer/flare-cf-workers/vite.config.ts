import { cloudflare } from "@cloudflare/vite-plugin"
import { flare } from "flare/plugins"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [flare(), cloudflare({ viteEnvironment: { name: "ssr" } })],
})
