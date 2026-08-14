import { defineConfig } from "@playwright/test"

const mode = process.env.TEST_MODE ?? "dev"
const isDev = mode === "dev"
const PORT = isDev ? "4101" : "4102"
process.env.PORT = PORT

export default defineConfig({
	expect: { timeout: 10_000 },
	forbidOnly: true,
	grepInvert: isDev ? /@prod-only/ : /@dev-only/,
	retries: 1,
	testDir: "../app/e2e",
	timeout: 30_000,
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "on-first-retry",
	},
	webServer: {
		command: isDev
			? "bunx vite dev --port 4101"
			: "bun run build && bunx vite preview --port 4102",
		cwd: "../app",
		env: { PORT },
		port: Number(PORT),
		reuseExistingServer: false,
		timeout: isDev ? 30_000 : 180_000,
	},
})
