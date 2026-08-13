import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import { flare } from "flare/plugins"

export default defineConfig({
	plugins: [flare(), nitro({ preset: "cloudflare-pages" })],
})
