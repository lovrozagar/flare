#!/usr/bin/env bun
/**
 * Sequential gate. Pick the environment; every e2e app runs on it.
 *
 *   bun run test:all
 *   bun run test:all -- --env bun
 *   bun run test:all -- --env workers
 *   bun run test:all:full -- --env node
 */
import { type EnvId, isEnvId } from "../e2e/apps/load.ts";

function arg(flag: string): string | undefined {
	const i = process.argv.indexOf(flag);
	if (i === -1) return undefined;
	return process.argv[i + 1];
}

const envRaw = arg("--env") ?? process.env.FLARE_E2E_ENV ?? "node";
if (!isEnvId(envRaw)) {
	console.error(`unknown --env ${envRaw}. known: node bun workers deno firefox`);
	process.exit(1);
}
const env: EnvId = envRaw;
const full = process.argv.includes("--full");

interface Suite {
	cmd: string[];
	name: string;
	prod?: boolean;
}

const suites: Suite[] = [
	{ cmd: ["bun", "run", "test"], name: "core-unit" },
	{ cmd: ["bun", "run", "test:cli"], name: "cli-unit" },
	{ cmd: ["bun", "run", "e2e/run-build.ts"], name: "build" },
	{ cmd: ["bun", "run", "e2e/run-env.ts", "--env", env], name: `e2e-${env}` },
];
if (full) {
	suites.push({
		cmd: ["bun", "run", "e2e/run-build.ts", "--runtime", "all"],
		name: "build-all-runtimes",
	});
	suites.push({
		cmd: ["bun", "run", "e2e/run-env.ts", "--env", env],
		name: `e2e-${env}-prod`,
		prod: true,
	});
	suites.push({ cmd: ["bun", "run", "typecheck"], name: "typecheck" });
}

interface Result {
	ms: number;
	name: string;
	ok: boolean;
}

const results: Result[] = [];
console.log(`test:all${full ? ":full" : ""} env=${env} — ${suites.length} suites\n`);

for (const suite of suites) {
	console.log(`\n──────── ${suite.name} ────────\n`);
	const started = Date.now();
	const proc = Bun.spawn(suite.cmd, {
		env: {
			...process.env,
			FLARE_E2E_ENV: env,
			...(suite.prod ? { TEST_MODE: "prod" } : {}),
		},
		stderr: "inherit",
		stdin: "inherit",
		stdout: "inherit",
	});
	const code = await proc.exited;
	const ms = Date.now() - started;
	const ok = code === 0;
	results.push({ ms, name: suite.name, ok });
	console.log(`\n${suite.name}: ${ok ? "pass" : "FAIL"} (${(ms / 1000).toFixed(1)}s)\n`);
}

console.log("\n========== test:all summary ==========");
for (const r of results) {
	console.log(`${(r.ok ? "pass" : "FAIL").padEnd(4)}  ${r.name.padEnd(22)} ${(r.ms / 1000).toFixed(1)}s`);
}
const failed = results.filter((r) => !r.ok);
console.log(
	`\n${results.length - failed.length}/${results.length} passed` +
		(failed.length > 0 ? ` — failed: ${failed.map((r) => r.name).join(", ")}` : ""),
);
process.exit(failed.length > 0 ? 1 : 0);
