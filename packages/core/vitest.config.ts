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
					exclude: ["tests/e2e/**"],
				},
			},
			{
				extends: true,
				test: {
					name: "unit-dom",
					environment: "jsdom",
					include: ["src/**/*.test.tsx", "lint/**/*.test.tsx", "tests/**/*.test.tsx"],
					exclude: ["tests/e2e/**"],
					passWithNoTests: true,
				},
			},
		],
	},
});
