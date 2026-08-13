import solid from "vite-plugin-solid"
import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		coverage: {
			exclude: ["src/**/*.d.ts", "src/**/_internal/**"],
			include: ["src/**/*.ts", "src/**/*.tsx"],
			provider: "v8",
		},
		projects: [
			{
				extends: true,
				plugins: [solid({ ssr: true })],
				resolve: {
					conditions: ["node"],
				},
				test: {
					environment: "node",
					include: [
						"tests/unit/**/*.test.ts",
						"tests/unit/**/*.test.tsx",
						"tests/integration/navigation.test.ts",
						"tests/integration/hydration.test.tsx",
						"tests/integration/server-handler.test.ts",
						"tests/integration/layouts.test.ts",
						"tests/integration/view-transitions.test.ts",
						"tests/integration/lazy-loading.test.ts",
						"tests/integration/html-nav.test.ts",
						"tests/integration/ssr-rendering.test.ts",
						"tests/integration/data-loading.test.ts",
						"tests/integration/client-navigation-ndjson.test.ts",
						"tests/integration/middleware-chain.test.ts",
						"tests/integration/error-handling.test.ts",
						"tests/integration/redirect.test.ts",
					],
					name: "ssr",
				},
			},
			{
				extends: true,
				plugins: [solid()],
				test: {
					environment: "jsdom",
					include: ["tests/integration/client-rendering.test.tsx"],
					name: "client",
				},
			},
			{
				extends: true,
				plugins: [solid()],
				test: {
					browser: {
						enabled: true,
						headless: true,
						instances: [{ browser: "chromium" }],
						provider: "playwright",
					},
					include: ["tests/integration/*.browser.test.tsx"],
					name: "browser",
				},
			},
		],
	},
})
