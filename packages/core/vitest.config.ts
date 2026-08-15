import solidPlugin from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [solidPlugin()],
	resolve: {
		alias: {
			"virtual:flare-client-entry": new URL("tests/__mocks__/virtual-flare-client-entry.ts", import.meta.url).pathname,
			"virtual:flare-generated": new URL("tests/__mocks__/virtual-flare-generated.ts", import.meta.url).pathname,
			"virtual:flare-is-dev": new URL("tests/__mocks__/virtual-flare-is-dev.ts", import.meta.url).pathname,
			"virtual:flare-log-level": new URL("tests/__mocks__/virtual-flare-log-level.ts", import.meta.url).pathname,
			"virtual:flare-module-preloads": new URL("tests/__mocks__/virtual-flare-module-preloads.ts", import.meta.url)
				.pathname,
			"virtual:flare-server-fn-map": new URL("tests/__mocks__/virtual-flare-server-fn-map.ts", import.meta.url)
				.pathname,
			"virtual:flare-sw-config": new URL("tests/__mocks__/virtual-flare-sw-config.ts", import.meta.url).pathname,
			"virtual:flare-sx-dev-css": new URL("tests/__mocks__/virtual-flare-sx-dev-css.ts", import.meta.url).pathname,
			"virtual:flare-sx-manifest": new URL("tests/__mocks__/virtual-flare-sx-manifest.ts", import.meta.url).pathname,
		},
	},
	test: {
		environment: "jsdom",
		include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
		setupFiles: ["tests/setup-jsdom.ts"],
	},
});
