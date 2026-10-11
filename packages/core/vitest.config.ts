import { defineConfig } from "vitest/config";

const nodeInclude = ["src/**/*.test.ts", "lint/**/*.test.ts", "tests/**/*.test.ts", "../../scripts/**/*.test.ts"];

export default defineConfig({
	root: import.meta.dirname,
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
					include: ["src/**/*.test.tsx", "lint/**/*.test.tsx", "tests/**/*.test.tsx", "src/client/**/*.test.ts"],
					exclude: ["tests/e2e/**"],
					passWithNoTests: true,
				},
			},
		],
	},
});
