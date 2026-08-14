import { defineConfig } from "vite"
import mkcert from "vite-plugin-mkcert"
import { flare } from "flare/plugins"

export default defineConfig({
	plugins: [
		mkcert(),
		flare({
			codegen: { fsVirtualPaths: false },
			dev: { cdnCache: false },
			prerender: true,
			serviceWorker: { offlineFallback: "/offline" },
			sx: { tw: true },
		}),
	],
	ssr: {
		/* client-only — keep out of the SSR bundle entirely so the SSR build
		 * never tries to alias solid-js/web → server.js inside it */
		external: ["@msviderok/base-ui-solid"],
	},
})
