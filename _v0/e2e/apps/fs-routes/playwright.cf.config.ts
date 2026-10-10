import { defineConfig } from "@playwright/test";

const baseURL = process.env.BASE_URL;
if (!baseURL) {
	throw new Error("BASE_URL is required for Cloudflare Playwright (e.g. https://….workers.dev)");
}

export default defineConfig({
	expect: { timeout: 15_000 },
	forbidOnly: true,
	grepInvert: /@dev-only/,
	retries: 2,
	testDir: "./tests/e2e",
	timeout: 45_000,
	use: {
		baseURL,
		trace: "on-first-retry",
	},
});
