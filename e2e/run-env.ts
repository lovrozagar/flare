#!/usr/bin/env bun
/**
 * Run every e2e app on one environment (Honey-shaped):
 *
 *   bun run e2e/run-env.ts --env node
 *   bun run e2e/run-env.ts --env workers --app demo
 */
import { rmSync } from "node:fs"
import { join } from "node:path"
import { discoverApps, type EnvId, isAppId, isEnvId } from "./apps/load.ts"

const FILTER: Record<EnvId, string> = {
	bun: "@flare/e2e-bun",
	deno: "@flare/e2e-deno",
	firefox: "@flare/e2e-node",
	node: "@flare/e2e-node",
	workers: "@flare/e2e-workers",
}

function arg(flag: string): string | undefined {
	const i = process.argv.indexOf(flag)
	if (i === -1) return undefined
	return process.argv[i + 1]
}

const envRaw = arg("--env") ?? process.env.FLARE_E2E_ENV ?? "node"
if (!isEnvId(envRaw)) {
	console.error(`unknown --env ${envRaw}. known: node bun workers deno firefox`)
	process.exit(1)
}
const env = envRaw

const known = discoverApps()
const only = arg("--app") ?? process.env.FLARE_E2E_APP
const apps = only ? [only] : known
if (only && !isAppId(only)) {
	console.error(`unknown --app ${only}. known: ${known.join(", ")}`)
	process.exit(1)
}

const script = env === "firefox" ? "test:firefox" : process.env.TEST_MODE === "prod" ? "test:prod" : "test"

interface Result {
	ms: number
	name: string
	ok: boolean
}

const results: Result[] = []
console.log(`e2e env=${env} apps=${apps.join(",")}\n`)

for (const app of apps) {
	if (app === "fs-routes") {
		rmSync(join(import.meta.dir, "apps/fs-routes/.flare/cache"), { force: true, recursive: true })
	}
	console.log(`\n──────── ${app} × ${env} ────────\n`)
	const started = Date.now()
	const proc = Bun.spawn(["bun", "run", "--filter", FILTER[env], script], {
		env: { ...process.env, FLARE_E2E_APP: app, FLARE_E2E_ENV: env },
		stderr: "inherit",
		stdin: "inherit",
		stdout: "inherit",
	})
	const code = await proc.exited
	const ms = Date.now() - started
	const ok = code === 0
	results.push({ ms, name: `${app}×${env}`, ok })
	console.log(`\n${app}×${env}: ${ok ? "pass" : "FAIL"} (${(ms / 1000).toFixed(1)}s)\n`)
}

console.log("\n========== e2e env summary ==========")
for (const r of results) {
	console.log(`${(r.ok ? "pass" : "FAIL").padEnd(4)}  ${r.name.padEnd(22)} ${(r.ms / 1000).toFixed(1)}s`)
}
const failed = results.filter((r) => !r.ok)
console.log(
	`\n${results.length - failed.length}/${results.length} passed` +
		(failed.length > 0 ? ` — failed: ${failed.map((r) => r.name).join(", ")}` : ""),
)
process.exit(failed.length > 0 ? 1 : 0)
