import { flare } from "flare/plugins"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [flare({ codegen: { fsVirtualPaths: false } })],
})
