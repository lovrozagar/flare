import { defineConfig, devices } from "@playwright/test"

const DEV_PORT = 3999
const PROD_PORT = 4000

/**
 * Tests that rely on Chromium-only APIs:
 * - Web Vitals: longtask, layout-shift, largest-contentful-paint, paint, performance.memory
 * - View Transitions: document.startViewTransition
 */
const CHROMIUM_ONLY_TESTS = [
	"**/deep-perf-benchmarks.test.ts",
	"**/deep-perf-prod.test.ts",
	"**/deep-perf-stress.test.ts",
	"**/deep-performance.test.ts",
	"**/deep-view-transition.test.ts",
]

export default defineConfig({
	expect: { timeout: 10_000 },
	forbidOnly: true,
	maxFailures: 40,
	projects: [
		/* dev projects — all browsers */
		{
			name: "chromium-dev",
			testIgnore: ["**/@prod-only/**", "**/deep-styling-sx-prod.test.ts"],
			use: {
				...devices["Desktop Chrome"],
				baseURL: `https://localhost:${DEV_PORT}`,
				launchOptions: { args: ["--ignore-certificate-errors"] },
			},
		},
		{
			name: "firefox-dev",
			testIgnore: [...CHROMIUM_ONLY_TESTS, "**/@prod-only/**"],
			use: {
				...devices["Desktop Firefox"],
				baseURL: `https://localhost:${DEV_PORT}`,
			},
		},
		{
			name: "mobile-chrome-dev",
			testIgnore: [...CHROMIUM_ONLY_TESTS, "**/@prod-only/**"],
			use: {
				...devices["Pixel 7"],
				baseURL: `https://localhost:${DEV_PORT}`,
				launchOptions: { args: ["--ignore-certificate-errors"] },
			},
		},
		{
			name: "webkit-dev",
			testIgnore: [...CHROMIUM_ONLY_TESTS, "**/@prod-only/**"],
			use: {
				...devices["Desktop Safari"],
				baseURL: `https://localhost:${DEV_PORT}`,
			},
		},
		/* prod projects — all browsers */
		{
			name: "chromium-prod",
			grepInvert: /@dev-only/,
			use: {
				...devices["Desktop Chrome"],
				baseURL: `https://localhost:${PROD_PORT}`,
				launchOptions: { args: ["--ignore-certificate-errors"] },
			},
		},
		{
			name: "firefox-prod",
			grepInvert: /@dev-only/,
			testIgnore: CHROMIUM_ONLY_TESTS,
			use: {
				...devices["Desktop Firefox"],
				baseURL: `https://localhost:${PROD_PORT}`,
			},
		},
		{
			name: "mobile-chrome-prod",
			grepInvert: /@dev-only/,
			testIgnore: CHROMIUM_ONLY_TESTS,
			use: {
				...devices["Pixel 7"],
				baseURL: `https://localhost:${PROD_PORT}`,
				launchOptions: { args: ["--ignore-certificate-errors"] },
			},
		},
		{
			name: "webkit-prod",
			grepInvert: /@dev-only/,
			testIgnore: CHROMIUM_ONLY_TESTS,
			use: {
				...devices["Desktop Safari"],
				baseURL: `https://localhost:${PROD_PORT}`,
			},
		},
	],
	retries: 0,
	testDir: "./e2e",
	timeout: 30_000,
	use: {
		bypassCSP: true,
		ignoreHTTPSErrors: true,
		trace: "on-first-retry",
	},
	webServer: [
		{
			command: "bunx vite dev --port 3999",
			ignoreHTTPSErrors: true,
			port: DEV_PORT,
			reuseExistingServer: true,
			timeout: 30_000,
		},
		{
			command: "bun run build && bunx vite preview --port 4000",
			ignoreHTTPSErrors: true,
			port: PROD_PORT,
			reuseExistingServer: true,
			timeout: 120_000,
		},
	],
})
