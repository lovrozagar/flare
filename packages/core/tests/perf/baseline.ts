// The performance baseline (plan 21 15.6): v0.9.23's benchmark app and its v1 port, each built for production and
// served, measured by tests/perf/measure.ts on the same post page, with the CPU runs alternating between the sides.
// It prints the comparison as JSON and as the table tests/perf/BASELINE.md keeps; the nightly checks v1 against it.
//
//   node tests/perf/baseline.ts --v0 <a v0.9.23 checkout> [--runs 20] [--requests 3000] [--repeats 3] [--check]
//
// `--check` fails the run when v1 is past a budget in baseline.json: a byte count, a ratio to v0.9.23 in this run, or an
// absolute value.
//
// The v0.9.23 checkout is the tag with one change, which BASELINE.md names: its benchmark app imports `createRouter`
// from `@lovrozagar/flare/router`, since the tag's root export no longer has it.
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const core = fileURLToPath(new URL("../..", import.meta.url))
const measure = join(core, "tests/perf/measure.ts")
const wire = join(core, "tests/perf/apps/wire")

type Child = { stdout: string; code: number | null }

export type Budgets = {
	bytes: Record<string, number>
	ratio: Record<string, number>
	absolute: Record<string, number>
}

type Sides = Record<"v0" | "v1", Record<string, number>>

// Each line v1 is past, as text naming the metric, v1's value, and the budget. A metric the run did not measure is a
// line too, so a renamed metric cannot pass unseen.
export function overBudget(result: Sides, budgets: Budgets): string[] {
	const lines: string[] = []
	const value = (side: "v0" | "v1", name: string): number => {
		const found = result[side][name]
		if (found === undefined) lines.push(`${name}: not measured`)
		return found ?? Number.NaN
	}
	for (const [name, budget] of Object.entries(budgets.bytes)) {
		const v1 = value("v1", name)
		if (v1 > budget) lines.push(`${name}: ${v1} B, budget ${budget} B`)
	}
	for (const [name, budget] of Object.entries(budgets.ratio)) {
		const ratio = value("v1", name) / value("v0", name)
		if (ratio > budget) lines.push(`${name}: v1 / v0 ${ratio.toFixed(3)}, budget ${budget}`)
	}
	for (const [name, budget] of Object.entries(budgets.absolute)) {
		const v1 = value("v1", name)
		if (v1 > budget) lines.push(`${name}: ${v1}, budget ${budget}`)
	}
	return lines
}

function run(
	command: string,
	args: readonly string[],
	at: { cwd: string; env?: Record<string, string> },
): Promise<Child> {
	const child = spawn(command, args, { cwd: at.cwd, env: { ...process.env, NO_COLOR: "1", ...at.env } })
	let stdout = ""
	let stderr = ""
	child.stdout.on("data", (chunk: Buffer) => void (stdout += chunk.toString()))
	child.stderr.on("data", (chunk: Buffer) => void (stderr += chunk.toString()))
	return new Promise((resolve, reject) => {
		child.once("error", reject)
		child.once("exit", (code, signal) =>
			code === 0
				? resolve({ stdout, code })
				: reject(new Error(`${command} ${args.join(" ")} exited ${code ?? signal}\n${stderr}`)),
		)
	})
}

// A long-running server child, resolved with its origin once it prints one.
function serve(command: string, args: readonly string[], cwd: string): Promise<{ origin: string; stop: () => void }> {
	const child = spawn(command, args, { cwd, env: { ...process.env, NODE_ENV: "production", NO_COLOR: "1" } })
	return new Promise((resolve, reject) => {
		let seen = ""
		const read = (chunk: Buffer): void => {
			seen += chunk.toString()
			const origin = /http:\/\/(?:127\.0\.0\.1|localhost):\d+/.exec(seen)?.[0]
			if (origin !== undefined) resolve({ origin, stop: () => void child.kill() })
		}
		child.stdout.on("data", read)
		child.stderr.on("data", read)
		child.once("exit", (code, signal) =>
			reject(new Error(`${command} exited ${code ?? signal} before serving\n${seen}`)),
		)
	})
}

// v1's prod server for the port: the client output by path first, as a deploy's static layer would, then the Node
// adapter, as tests/e2e/boot.ts serves an e2e app.
const V1_SERVE = `
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createNodeListener } from "@lovrozagar/flare/adapters/node";
const out = process.argv[1];
const client = join(out, "client");
const { server } = await import(pathToFileURL(join(out, "server/server.js")).href);
const listener = createNodeListener(server);
const http = createServer(async (req, res) => {
	const path = normalize(join(client, decodeURIComponent(new URL(req.url ?? "/", "http://host").pathname)));
	const info = path.startsWith(client + sep) ? await stat(path).catch(() => undefined) : undefined;
	if (info === undefined || !info.isFile()) return listener(req, res);
	const type = extname(path) === ".js" ? "text/javascript" : extname(path) === ".css" ? "text/css" : "application/octet-stream";
	res.writeHead(200, { "content-type": type });
	res.end(await readFile(path));
});
http.listen(0, "127.0.0.1", () => console.log("http://127.0.0.1:" + http.address().port));
`

function option(name: string, fallback?: string): string {
	const args = process.argv.slice(2)
	const at = args.indexOf(`--${name}`)
	const value = at === -1 ? fallback : args[at + 1]
	if (value === undefined) throw new Error(`baseline: --${name} is required`)
	return value
}

async function measured(args: readonly string[]): Promise<Record<string, number>> {
	const { stdout } = await run(process.execPath, [measure, ...args], { cwd: core })
	return (JSON.parse(stdout) as { result: Record<string, number> }).result
}

async function main(): Promise<void> {
	const v0App = join(option("v0"), "benchmark/flare")
	const runs = option("runs", "20")
	const requests = option("requests", "3000")
	const repeats = Number(option("repeats", "3"))
	const vite = join(core, "../../node_modules/vite/bin/vite.js")
	// The port's output sits under the repo's node_modules, so the built server's external imports resolve.
	const out = mkdtempSync(join(core, "../../node_modules/.flare-perf-wire-"))

	await run(process.execPath, [vite, "build", "--outDir", out], { cwd: wire, env: { NODE_ENV: "production" } })
	await run("npx", ["vite", "build"], { cwd: v0App, env: { NODE_ENV: "production" } })
	const servers = {
		v1: await serve(process.execPath, ["--input-type=module", "-e", V1_SERVE, out], core),
		v0: await serve("npx", ["vite", "preview", "--port", "0", "--host", "127.0.0.1"], v0App),
	}
	const result: Record<"v0" | "v1", Record<string, number>> = { v0: {}, v1: {} }
	try {
		for (const side of ["v0", "v1"] as const) {
			Object.assign(
				result[side],
				await measured(["network", "--side", side, "--origin", servers[side].origin, "--runs", runs]),
			)
		}
	} finally {
		servers.v0.stop()
		servers.v1.stop()
	}
	// CPU in a fresh process per side and repeat, alternating, so neither side runs warmer or beside the other's Solid.
	const modules = { v1: join(out, "server/server.js"), v0: join(v0App, "dist/server/server.js") }
	const cpuRuns: Record<"v0" | "v1", Record<string, number>[]> = { v0: [], v1: [] }
	for (let repeat = 0; repeat < repeats; repeat += 1) {
		for (const side of ["v0", "v1"] as const) {
			cpuRuns[side].push(await measured(["cpu", "--side", side, "--server", modules[side], "--requests", requests]))
		}
	}
	for (const side of ["v0", "v1"] as const) {
		for (const name of Object.keys(cpuRuns[side][0] ?? {})) {
			const values = cpuRuns[side].map((entry) => entry[name] ?? 0).sort((left, right) => left - right)
			result[side][name] = values[Math.floor(values.length / 2)] ?? 0
		}
	}
	rmSync(out, { recursive: true, force: true })

	const lines = ["| Metric | v0.9.23 | v1 |", "| --- | --- | --- |"]
	for (const name of Object.keys(result.v1)) {
		lines.push(
			`| ${name} | ${Math.round((result.v0[name] ?? 0) * 100) / 100} | ${Math.round((result.v1[name] ?? 0) * 100) / 100} |`,
		)
	}
	console.log(JSON.stringify(result, null, "\t"))
	console.log(lines.join("\n"))
	if (process.argv.includes("--check")) {
		const budgets: Budgets = JSON.parse(readFileSync(join(core, "tests/perf/baseline.json"), "utf8"))
		const over = overBudget(result, budgets)
		for (const line of over) console.error(`over budget: ${line}`)
		if (over.length > 0) process.exit(1)
	}
}

if (import.meta.main) {
	await main()
	process.exit(0)
}
