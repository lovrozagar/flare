import { defineConfig } from "vite"
import { flare } from "flare/plugins"

export default defineConfig({
	plugins: [
		flare({
			codegen: { fsVirtualPaths: true },
		}),
	],
})
