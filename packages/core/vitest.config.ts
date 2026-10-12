import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

const nodeInclude = ["src/**/*.test.ts", "lint/**/*.test.ts", "tests/**/*.test.ts", "../../scripts/**/*.test.ts"];

export default defineConfig({
	root: import.meta.dirname,
	// App fixtures are written in JSX, as an app is. Framework sources do not use JSX.
	plugins: [solid({ ssr: true, include: ["tests/e2e/apps/**/*.tsx"] })],
	test: {
		coverage: {
			provider: "v8",
			include: ["src/**", "lint/**"],
			exclude: [
				"**/*.test.ts",
				"**/*.test.tsx",
				"**/*.d.ts",
				"**/index.ts",
				"src/exports/**",
				"src/features/fonts/shared/generated/**",
			],
			thresholds: {
				perFile: true,
				lines: 100,
				branches: 100,
				functions: 100,
				statements: 100,
			},
		},
		projects: [
			{
				extends: true,
				test: {
					name: "unit-node",
					environment: "node",
					include: nodeInclude,
					exclude: ["src/client/**/*.test.ts", "tests/e2e/minimal.test.ts"],
				},
			},
			{
				extends: true,
				resolve: { conditions: ["browser", "development", "module", "import", "default"] },
				test: {
					name: "unit-dom",
					environment: "jsdom",
					// Inlined so Vite resolves the browser builds. Externalized, Node loads Solid's server build.
					server: { deps: { inline: ["solid-js", "@solidjs/web"] } },
					include: ["src/**/*.test.tsx", "lint/**/*.test.tsx", "tests/**/*.test.tsx", "src/client/**/*.test.ts"],
					exclude: ["tests/e2e/**"],
					passWithNoTests: true,
				},
			},
		],
	},
});
