/**
 * App registry. Env adapters boot whichever app FLARE_E2E_APP names.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ENV_IDS = ["node", "bun", "workers", "deno", "firefox"] as const;
export type EnvId = (typeof ENV_IDS)[number];

const e2eRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const appsRoot = join(e2eRoot, "apps");

export function discoverApps(): string[] {
	return readdirSync(appsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(appsRoot, entry.name, "tests", "e2e")))
		.map((entry) => entry.name)
		.sort();
}

export function isAppId(name: string): boolean {
	return discoverApps().includes(name);
}

export function isEnvId(name: string): name is EnvId {
	return (ENV_IDS as readonly string[]).includes(name);
}

export interface AppSpec {
	cwd: string;
	id: string;
	use?: Record<string, unknown>;
}

export function loadE2eApp(name: string | undefined): AppSpec {
	const id = name ?? "product";
	if (!isAppId(id)) {
		throw new Error(`unknown e2e app "${id}". known: ${discoverApps().join(", ")}`);
	}
	const spec: AppSpec = { cwd: join(appsRoot, id), id };
	if (id === "demo") {
		spec.use = {
			bypassCSP: true,
			userAgent:
				"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
		};
	}
	return spec;
}

export const ENV_PORTS: Record<EnvId, { dev: number; host: string; prod: number }> = {
	bun: { dev: 4103, host: "localhost", prod: 4105 },
	deno: { dev: 4106, host: "127.0.0.1", prod: 4107 },
	firefox: { dev: 4101, host: "localhost", prod: 4101 },
	node: { dev: 4101, host: "localhost", prod: 4102 },
	workers: { dev: 4104, host: "localhost", prod: 4108 },
};

function viteConfigFlag(app: string, env: EnvId): string {
	if (env !== "workers") return "";
	if (app === "product") return " --config vite.workers.config.ts";
	if (app === "fs-routes" || app === "demo") return " --config vite.cf.config.ts";
	return "";
}

function viteBin(env: EnvId): string {
	return env === "bun" ? "bunx --bun vite" : "bunx vite";
}

export function e2eEnvCommand(env: EnvId, app: string, mode: "dev" | "prod", port: number): string {
	const cfg = viteConfigFlag(app, env);
	const deno = join(e2eRoot, "deno", "run-vite.ts");
	const bin = viteBin(env);

	if (env === "deno") {
		return mode === "dev"
			? `deno run -A ${deno} --host 127.0.0.1 dev --port ${port}${cfg}`
			: `bun run build && deno run -A ${deno} --host 127.0.0.1 preview --port ${port}${cfg}`;
	}

	if (mode === "dev") {
		return `${bin} dev --port ${port}${cfg}`;
	}

	/* Workers preview must build with the same config the plugin uses, or
	   `.wrangler/deploy/config.json` is missing and wrangler cannot start. */
	if (env === "workers") {
		if (app === "fs-routes") {
			return `bun run build:cf && ${bin} preview --port ${port}${cfg}`;
		}
		return `${bin} build${cfg} && ${bin} preview --port ${port}${cfg}`;
	}
	return `bun run build && ${bin} preview --port ${port}${cfg}`;
}
