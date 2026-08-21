import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import { type EnvId, ENV_PORTS, e2eEnvCommand, loadE2eApp } from "./apps/load.ts";
import { e2eAppName, e2eAppTestDir } from "./playwright-app.ts";

function parseRetries(raw: string | undefined): number {
	if (raw === undefined || raw === "") return 1;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return 1;
	return Math.floor(n);
}

export function defineEnvConfig(env: EnvId): PlaywrightTestConfig {
	const app = loadE2eApp(e2eAppName());
	const ports = ENV_PORTS[env];
	const mode = process.env.TEST_MODE ?? "dev";
	const isDev = mode === "dev";
	if (env === "firefox" && !isDev) {
		throw new Error("firefox env is dev-only");
	}

	const port = isDev ? ports.dev : ports.prod;
	process.env.PORT = String(port);

	const invert: string[] = isDev ? ["@prod-only"] : ["@dev-only"];
	if (env === "workers") invert.push("@node-only");

	const slot = `${env}-${isDev ? "dev" : "prod"}-${app.id}`;

	return defineConfig({
		expect: { timeout: 10_000 },
		forbidOnly: true,
		fullyParallel: env === "deno" || env === "workers" ? false : undefined,
		grepInvert: new RegExp(invert.join("|")),
		outputDir: `test-results/${slot}`,
		reporter: [["list"], ["html", { open: "never", outputFolder: `playwright-report/${slot}` }]],
		retries: parseRetries(process.env.FLARE_E2E_RETRIES),
		testDir: e2eAppTestDir(),
		timeout: env === "deno" || env === "workers" || env === "firefox" ? 45_000 : 30_000,
		use: {
			...(env === "firefox" ? devices["Desktop Firefox"] : {}),
			baseURL: `http://${ports.host}:${port}`,
			trace: "on-first-retry",
			...app.use,
		},
		webServer: {
			command: e2eEnvCommand(env, app.id, isDev ? "dev" : "prod", port),
			cwd: app.cwd,
			env: { FLARE_E2E_APP: app.id, PORT: String(port) },
			port,
			reuseExistingServer: false,
			timeout: isDev ? 60_000 : 180_000,
		},
		/* deno/workerd stay serial. Node/bun: 16 Chromium workers (9800X3D 16t / 32GB). */
		workers: env === "deno" || env === "workers" ? 1 : 16,
	});
}
