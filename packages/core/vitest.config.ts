import { availableParallelism } from "node:os"
import solid from "@solidjs/vite-plugin"
import { defineConfig } from "vitest/config"

// The hydrate harness renders on Node and hydrates in a real browser, so it runs on Node though it is .tsx.
const HYDRATE = "tests/integration/hydrate.test.tsx"
const nodeInclude = ["src/**/*.test.ts", "tests/**/*.test.ts", "../../scripts/**/*.test.ts"]

// An integration case runs a real vite build, a dev server, or a browser (B96): seconds each under the full gate's
// parallel load. They get 60 s, a case and a hook alike; a unit keeps 5 s, so a hung unit still fails fast. Measured in
// one full gate: the slowest case 4.9 s, the slowest build 4.8 s. A lint rule's case runs the oxlint binary once per
// fixture, so it gets the same 60 s: `boundaries.test.ts` `sync import`, six runs, took 1.8 to 3.9 s alone on a loaded
// host and 6.1 s in a full gate.
const INTEGRATION_TIMEOUT = 60_000

// At most 8 workers, else vitest's own run-mode default, one less than the cores (vitest 4.1.10). The full gate on a
// 16-core host, 2026-10-23, three runs each: vitest's 15 workers peaked at 7.6-8.1 GB in all and 118-154 s, with 4
// kills across the runs; 8 workers peaked at 4.7-5.0 GB and 116-119 s, with 1. A runner with 9 cores or fewer keeps
// vitest's default. It lowers the gate's footprint; it does not route around the host's reaper (BUGS.md 485.6).
const MAX_WORKERS = Math.min(8, Math.max(availableParallelism() - 1, 1))

export default defineConfig({
	root: import.meta.dirname,
	// App fixtures are written in JSX, as an app is. Framework sources do not use JSX.
	plugins: [solid({ ssr: true, include: ["tests/e2e/apps/**/*.tsx"] })],
	test: {
		maxWorkers: MAX_WORKERS,
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
						"tests/integration/**",
						"src/client/**/*.test.ts",
						"src/features/*/client/**/!(*.ssr).test.ts",
						"tests/e2e/minimal.test.ts",
						"tests/e2e/navigation.test.ts",
						"tests/e2e/server-fn.test.ts",
						"tests/e2e/static.test.ts",
						"tests/e2e/prefetch-reuse.test.ts",
						"tests/e2e/docs-*.test.ts",
						"tests/e2e/dashboard-*.test.ts",
						"tests/e2e/dev-recovery.test.ts",
						"tests/e2e/dev-hmr.test.ts",
						"tests/e2e/cache-sharing.test.ts",
						// The consumer cells install from the registry: `test:consumers` runs them (plan 21 5.5).
						"tests/consumers/**/*.consumer.test.ts",
					],
				},
			},
			{
				extends: true,
				test: {
					name: "integration",
					environment: "node",
					include: ["tests/integration/**/*.test.ts", HYDRATE, "lint/**/*.test.ts"],
					// Skips a WebKit case where Playwright's WebKit is the frozen macOS 14 build (BUGS.md 351).
					setupFiles: ["tests/integration/frozen-webkit.setup.ts"],
					testTimeout: INTEGRATION_TIMEOUT,
					hookTimeout: INTEGRATION_TIMEOUT,
				},
			},
			{
				extends: true,
				resolve: { conditions: ["browser", "development", "module", "import", "default"] },
				test: {
					name: "unit-dom",
					environment: "jsdom",
					setupFiles: ["tests/report-error.setup.ts"],
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
})
