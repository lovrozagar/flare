import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import { type EnvId, ENV_PORTS, e2eEnvCommand, loadE2eApp } from "./apps/load.ts";
import { e2eAppName, e2eAppTestDir } from "./playwright-app.ts";

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

	return defineConfig({
		expect: { timeout: 10_000 },
		forbidOnly: true,
		fullyParallel: env === "deno" || env === "workers" ? false : undefined,
		grepInvert: new RegExp(invert.join("|")),
		retries: 1,
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
		workers: env === "deno" || env === "workers" ? 1 : undefined,
	});
}
