import { flare } from "@lovrozagar/flare/plugins";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [flare({ codegen: { fsVirtualPaths: false } })],
});
