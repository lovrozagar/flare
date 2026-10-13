import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

// The hydrate harness renders on Node and hydrates in a real browser, so it runs in unit-node though it is .tsx.
const HYDRATE = "tests/integration/hydrate.test.tsx";
const nodeInclude = [
	"src/**/*.test.ts",
	"lint/**/*.test.ts",
	"tests/**/*.test.ts",
	"../../scripts/**/*.test.ts",
	HYDRATE,
];

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
				// Test support: the navigation tests share one mounted app.
				"**/*.fixture.ts",
				// The e2e apps have their own src/ folders. 00-rules covers packages/core/src only.
				"tests/**",
				"**/*.d.ts",
				"**/index.ts",
				"src/exports/**",
				"src/features/fonts/shared/generated/**",
				// The font registry is data that generate.ts reads, not code.
				"src/features/fonts/registry.json",
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
					// Playwright runs the e2e specs. boot.test.ts is a vitest file. Client tests run in unit-dom.
					exclude: [
						"src/client/**/*.test.ts",
						"src/features/*/client/**/!(*.ssr).test.ts",
						"tests/e2e/minimal.test.ts",
						"tests/e2e/navigation.test.ts",
						"tests/e2e/server-fn.test.ts",
						"tests/e2e/static.test.ts",
						"tests/e2e/docs-*.test.ts",
					],
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
					include: [
						"src/**/*.test.tsx",
						"lint/**/*.test.tsx",
						"tests/**/*.test.tsx",
						"src/client/**/*.test.ts",
						"src/features/*/client/**/!(*.ssr).test.ts",
					],
					exclude: ["tests/e2e/**", HYDRATE],
					passWithNoTests: true,
				},
			},
		],
	},
});
