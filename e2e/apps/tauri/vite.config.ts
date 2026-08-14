import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import { flare } from "flare/plugins"

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
	plugins: [flare({ codegen: { fsVirtualPaths: false } }), nitro({ preset: "node-server" })],
	server: {
		hmr: host ? { host, port: 5174, protocol: "ws" } : undefined,
		host: host || false,
		port: 5173,
		strictPort: true,
	},
})
