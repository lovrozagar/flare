import { spawn, spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { rcompare, satisfies } from "semver"
import { onFreePort } from "../../../../scripts/free-port.ts"
import { nodeAt, type PinnedNode } from "../../../../scripts/node-at.ts"
import { packTarball, stagePackage } from "../../../../scripts/release.ts"
import { marked, readme } from "../structure/readme.ts"

// The consumer cells (plan 21 5.5): the packed tarball installed into a fresh project under the OS temp dir, outside
// the repo, by the pinned Node's own npm, never the host's, and never a link to the workspace.

type Manifest = {
	peerDependencies?: Record<string, string>
	peerDependenciesMeta?: Record<string, { optional?: boolean }>
	devDependencies?: Record<string, string>
}

export type PeerMode = "floor" | "newest"

export const CORE = fileURLToPath(new URL("../../", import.meta.url))
export const MANIFEST: Manifest = JSON.parse(readFileSync(join(CORE, "package.json"), "utf8"))
export const MINIMAL = join(CORE, "tests/e2e/apps/minimal")
export const OPTIONAL = Object.entries(MANIFEST.peerDependenciesMeta ?? {})
	.filter(([, meta]) => meta.optional === true)
	.map(([name]) => name)

// The peers to install, as npm specs: each at its floor, the exact devDependency every range starts from (B79), or at
// its whole range, which npm resolves to the newest version it admits. `without` leaves optional peers out.
export function peerSpecs(manifest: Manifest, mode: PeerMode, options: { without?: readonly string[] } = {}): string[] {
	const peers = manifest.peerDependencies ?? {}
	const meta = manifest.peerDependenciesMeta ?? {}
	for (const name of options.without ?? []) {
		if (meta[name]?.optional !== true) throw new Error(`stage: ${name} is not an optional peer`)
	}
	return Object.keys(peers)
		.filter((name) => !(options.without ?? []).includes(name))
		.toSorted()
		.map((name) => {
			const floor = manifest.devDependencies?.[name]
			if (floor === undefined) throw new Error(`stage: ${name} has no exact devDependency, so no floor`)
			return mode === "floor" ? `${name}@${floor}` : `${name}@${peers[name]}`
		})
}

export type NewestRow = { name: string; installed: string; newest: string; same: boolean }

// Each peer's installed version beside the newest published version its range admits with pre-releases counted.
// npm matches a pre-release range only on its own release line, so a row that differs is a range-wording question.
export function newestReport(
	installed: Record<string, string>,
	published: Record<string, readonly string[]>,
	ranges: Record<string, string>,
): NewestRow[] {
	return Object.keys(installed)
		.toSorted()
		.map((name) => {
			const range = ranges[name] ?? "*"
			const admitted = (published[name] ?? []).filter((version) =>
				satisfies(version, range, { includePrerelease: true }),
			)
			const newest = admitted.toSorted(rcompare)[0] ?? "none"
			const version = installed[name] ?? ""
			return { name, installed: version, newest, same: newest === version }
		})
}

export type Run = { status: number | null; output: string }

export type Command = { cwd: string; args: readonly string[]; env?: Record<string, string> }

// A consumer's shell: the runner's environment without its own `NODE_ENV=test` and `VITEST*` variables, which turn a
// `vite build` into a test build whose server bundle does not load. sharp uses its prebuilt binaries whatever libvips
// the machine has: a sharp install script that finds a system libvips compiles against it instead, and fails without
// a compiler toolchain, so a cell would depend on the host.
export function shellEnv(): NodeJS.ProcessEnv {
	const shell = Object.entries(process.env).filter(([name]) => name !== "NODE_ENV" && !name.startsWith("VITEST"))
	return { ...Object.fromEntries(shell), SHARP_IGNORE_GLOBAL_LIBVIPS: "1" }
}

// The environment a pinned Node runs in: a consumer's shell with the pinned Node's directory first on PATH, so a script
// that spawns `node` gets it.
function envOf(node: PinnedNode, env: Record<string, string> = {}): NodeJS.ProcessEnv {
	return { ...shellEnv(), ...env, PATH: `${join(node.node, "..")}:${process.env["PATH"] ?? ""}` }
}

// One command with a pinned Node: `args` begins with the script it runs.
export function run(node: PinnedNode, command: Command): Run {
	const result = spawnSync(node.node, command.args, {
		cwd: command.cwd,
		encoding: "utf8",
		env: envOf(node, command.env),
		maxBuffer: 64 * 1024 * 1024,
	})
	return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` }
}

// The pinned Node's npm, in `cwd`.
export function npm(node: PinnedNode, cwd: string, args: readonly string[]): Run {
	return run(node, { cwd, args: [node.npm, ...args, "--no-audit", "--no-fund"] })
}

// The Nodes of plan 21 5.5: the published floor and the current LTS every other cell runs.
export function nodes(): Promise<{ floor: PinnedNode; current: PinnedNode }> {
	return Promise.all([nodeAt("22.12.0"), nodeAt("24.22.0")]).then(([floor, current]) => ({ floor, current }))
}

// The tarball the cells install: `FLARE_TARBALL`, the bytes a release ships, or a fresh pack by the current Node's npm.
export function tarball(current: PinnedNode, out: string): string {
	const given = process.env["FLARE_TARBALL"]
	if (given !== undefined) return given
	return packTarball(stagePackage(join(out, "pack")), out, [current.node, current.npm])
}

export type Project = { dir: string; close: () => void }

// A fresh project under the OS temp dir, so no `node_modules` above it resolves. FLARE_CONSUMER_KEEP keeps it, and
// logs where, for a look at a failed cell's tree.
export function project(name: string): Project {
	const dir = mkdtempSync(join(tmpdir(), `flare-consumer-${name}-`))
	if (process.env["FLARE_CONSUMER_KEEP"] !== undefined) {
		return { dir, close: () => console.log(`kept ${dir}`) }
	}
	return { dir, close: () => rmSync(dir, { recursive: true, force: true }) }
}

// The vite config of the staged minimal app: `flare()` with prerender, since the app has build-time routes, and in
// the Workers cell Cloudflare's plugin first, as a Workers app composes it (B109).
function viteConfig(workers: boolean): string {
	const imports = workers ? 'import { cloudflare } from "@cloudflare/vite-plugin"\n' : ""
	const plugins = workers ? 'cloudflare({ viteEnvironment: { name: "ssr" } }), ' : ""
	return `${imports}import { flare } from "@lovrozagar/flare/vite"\nimport { defineConfig } from "vite"\n\nexport default defineConfig({ plugins: [${plugins}flare({ prerender: true })] })\n`
}

// The minimal app's sources, without its generated code, which codegen writes again. Its configs stay behind: the repo
// tsconfig extends the repo's base, and its vite config reads the e2e harness's env. The project gets its own vite
// config and the README's `serve.js`.
export function copyMinimal(dir: string, options: { workers?: boolean } = {}): void {
	cpSync(join(MINIMAL, "src"), join(dir, "src"), { recursive: true, filter: (path) => !path.includes("/_gen") })
	cpSync(join(MINIMAL, "wrangler.jsonc"), join(dir, "wrangler.jsonc"))
	writeFileSync(join(dir, "vite.config.ts"), viteConfig(options.workers === true))
	writeFileSync(join(dir, "package.json"), '{ "name": "consumer", "private": true, "type": "module" }\n')
	const [serve] = marked(readme, "node-serve")
	writeFileSync(join(dir, serve?.path ?? "serve.js"), serve?.code ?? "")
}

export type Install = { dir: string; packed: string; specs: readonly string[]; legacy: boolean }

// Installs the tarball and `specs` with the pinned npm. A controlled cell passes `legacy`, so npm adds no peer the
// cell did not name.
export function install(node: PinnedNode, options: Install): Run {
	const legacy = options.legacy ? ["--legacy-peer-deps"] : []
	return npm(node, options.dir, ["install", ...legacy, options.packed, ...options.specs])
}

// The installed version of each package, read from the project's own tree.
export function installed(dir: string, names: readonly string[]): Record<string, string> {
	return Object.fromEntries(
		names.map((name) => {
			const path = join(dir, "node_modules", name, "package.json")
			return [name, String(JSON.parse(readFileSync(path, "utf8")).version)]
		}),
	)
}

// codegen, then `vite build`, with the given Node.
export function buildApp(node: PinnedNode, dir: string, env: Record<string, string> = {}): Run {
	const codegen = run(node, {
		cwd: dir,
		args: [join(dir, "node_modules/@lovrozagar/flare/dist/vite/bin/flare.js"), "codegen"],
		env,
	})
	if (codegen.status !== 0) return codegen
	return run(node, { cwd: dir, args: [join(dir, "node_modules/vite/bin/vite.js"), "build"], env })
}

export type Served = { origin: string; output: () => string; stop: () => Promise<void> }

export type Start = { dir: string; args: (port: number) => readonly string[]; timeout: number }

// Starts `args` with the given Node on a free port and waits until GET / answers, at most `timeout` ms. A port taken
// between the pick and the server's listen is picked again (BUGS.md 493).
export function serve(node: PinnedNode, start: Start): Promise<Served> {
	return onFreePort((port) => serveOn(node, start, port))
}

async function serveOn(node: PinnedNode, start: Start, port: number): Promise<Served> {
	const args = start.args(port)
	const child = spawn(node.node, args, { cwd: start.dir, env: envOf(node, { PORT: String(port) }) })
	let output = ""
	child.stdout.on("data", (chunk) => void (output += String(chunk)))
	child.stderr.on("data", (chunk) => void (output += String(chunk)))
	const origin = `http://127.0.0.1:${port}`
	const stop = (): Promise<void> =>
		new Promise((resolve) => {
			if (child.exitCode !== null) return resolve()
			child.once("exit", () => resolve())
			child.kill("SIGTERM")
		})
	const deadline = Date.now() + start.timeout
	while (Date.now() < deadline) {
		if (child.exitCode !== null) break
		const up = await fetch(`${origin}/`).then(
			() => true,
			() => false,
		)
		if (up) return { origin, output: () => output, stop }
		await new Promise((resolve) => setTimeout(resolve, 200))
	}
	await stop()
	throw new Error(`stage: ${args.join(" ")} did not answer on ${origin}:\n${output}`)
}
