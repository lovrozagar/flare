import { spawn } from "node:child_process"
import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { StringDecoder } from "node:string_decoder"
import { join, resolve } from "node:path"
import type { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import { Miniflare } from "miniflare"
import { unstable_getMiniflareWorkerOptions } from "wrangler"
import { exited, exitOf, readOrigin, signalGroup } from "./child.ts"

const apps = fileURLToPath(new URL("./apps/", import.meta.url))

// A prod build's output, under the repo's node_modules so the built server's external imports resolve as a
// deploy's would. It is not the app directory, and nothing is written there (B70).
const outputs = fileURLToPath(new URL("../../../../node_modules/.flare-e2e/", import.meta.url))

export type Boot = {
	origin: string
	appDir: string
	cacheDir: string
	// A prod boot's build output: `client`, `server`, and `worker` under it.
	outDir?: string | undefined
	// What the runtime printed so far, stdout and stderr, one entry per line in the order it arrived. In memory only.
	logs: () => readonly string[]
	close: () => Promise<void>
}

// A runtime's output, split into lines as it arrives. A line still being written is the last entry.
// ANSI escape sequences: Bun colors console.error when the environment forces color, as Playwright's workers do.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g")

function capture(): { attach: (stream: Readable | null) => void; logs: () => readonly string[] } {
	const lines: string[] = []
	const pending: string[] = []
	return {
		attach(stream) {
			const decoder = new StringDecoder("utf8")
			const slot = pending.push("") - 1
			stream?.on("data", (chunk: Buffer) => {
				const parts = `${pending[slot]}${decoder.write(chunk)}`.split("\n")
				pending[slot] = parts.pop() ?? ""
				lines.push(...parts.map((line) => line.replaceAll(ANSI, "")))
			})
		},
		logs: () => [...lines, ...pending.filter((line) => line !== "").map((line) => line.replaceAll(ANSI, ""))],
	}
}

const APPS = new Set(["minimal", "basepath", "docs"])
const RUNTIMES = new Set(["node", "bun", "workers"])

// `dev` is `vite dev`: on Node, under the Bun runtime, or on Node with the app's own Cloudflare plugin, which renders in
// workerd (B109). `prod` is `vite build` on Node, then the runtime's adapter over the output: the Node listener,
// `Bun.serve`, or miniflare from the plugin's generated deploy config (B70, B109).
export async function boot(input: { app: string; runtime: string; mode: string }): Promise<Boot> {
	if (!APPS.has(input.app)) throw new Error(input.app)
	return bootApp({ appDir: join(apps, input.app), runtime: input.runtime, mode: input.mode })
}

type BootInput = { appDir: string; runtime: string; mode: string; dirs?: readonly string[] }

// The same boot over any app directory, as golden.test stages one (bits/14). `dirs` go when a dev boot closes.
export async function bootApp(input: BootInput): Promise<Boot> {
	if (!RUNTIMES.has(input.runtime)) throw new Error(input.runtime)
	if (input.mode !== "dev" && input.mode !== "prod") throw new Error(input.mode)
	const appDir = input.appDir
	const cacheDir = await mkdtemp(join(tmpdir(), "flare-vite-"))
	// A child process, so the app's Vite and the framework it loads stay out of the test process.
	const dirs = input.dirs ?? []
	if (input.mode === "dev") return bootChild({ appDir, cacheDir, dirs, ...devCommand(input.runtime) })
	mkdirSync(outputs, { recursive: true })
	const outDir = await mkdtemp(join(outputs, "out-"))
	try {
		await viteBuild({ appDir, cacheDir, outDir, runtime: input.runtime })
	} catch (error) {
		remove([cacheDir, outDir])
		throw error
	}
	if (input.runtime === "workers") return { ...(await bootWorkers({ appDir, cacheDir, outDir })), outDir }
	const [bin, args] = input.runtime === "bun" ? ["bun", ["-e", BUN_SERVE]] : [process.execPath, NODE_ARGS]
	const env = { FLARE_E2E: "1" }
	return { ...(await bootChild({ appDir, cacheDir, bin, args: [...args, outDir], dirs: [outDir], env })), outDir }
}

const viteBin = fileURLToPath(new URL("../../../../node_modules/.bin/vite", import.meta.url))

// Workers dev builds the worker's env from the Wrangler config and dotenv files only, so the Cloudflare plugin is told
// to add the process env, FLARE_E2E with it (BUGS.md 76). It does not fetch the request `cf` object from Cloudflare,
// which it would cache under `.wrangler` in the app (B70, BUGS.md 85).
const WORKERS_DEV_ENV = { CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", CLOUDFLARE_CF_FETCH_ENABLED: "false" }

// The dev server per runtime. The app's vite.config reads FLARE_E2E_RUNTIME to compose the Cloudflare plugin (B109).
function devCommand(runtime: string): { bin: string; args?: readonly string[]; env: Record<string, string> } {
	const env = {
		FLARE_E2E_RUNTIME: runtime,
		FLARE_E2E: "1",
		...(runtime === "workers" ? WORKERS_DEV_ENV : {}),
	}
	if (runtime === "bun") return { bin: "bun", args: ["--bun", viteJs, "--host", "127.0.0.1", "--port", "0"], env }
	return { bin: viteBin, env }
}
const viteJs = fileURLToPath(new URL("../../../../node_modules/vite/bin/vite.js", import.meta.url))

// The cache dir, and any other dir the boot made, go when the child exits for any reason, when it cannot start, and
// when the test process exits first, so a failed or timed-out run leaves nothing behind. The child leads its own
// process group, so its own children (the Workers dev server's workerd) end with it: when it cannot start, on close,
// and when the test process exits (BUGS.md 128.7).
export function bootChild(input: {
	appDir: string
	cacheDir: string
	bin: string
	args?: readonly string[]
	dirs?: readonly string[]
	env?: Record<string, string>
}): Promise<Boot> {
	const { appDir, cacheDir } = input
	const child = spawn(input.bin, input.args ?? ["--host", "127.0.0.1", "--port", "0"], {
		cwd: appDir,
		// Playwright sets FORCE_COLOR. A colored URL would never match readOrigin, and NO_COLOR wins over it.
		env: { ...process.env, ...input.env, FLARE_VITE_CACHE: cacheDir, NO_COLOR: "1" },
		stdio: ["ignore", "pipe", "pipe"],
		detached: true,
	})
	const output = capture()
	output.attach(child.stdout)
	output.attach(child.stderr)
	const clean = (): void => remove([cacheDir, ...(input.dirs ?? [])])
	// The exiting test process cannot await the child: SIGKILL, and a second removal after a write in flight lands.
	const onExit = (): void => {
		signalGroup(child, "SIGKILL")
		clean()
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
		clean()
	}
	child.once("exit", clean)
	child.once("error", clean)
	process.once("exit", onExit)
	const started = readOrigin(child).catch((error: unknown) => {
		signalGroup(child, "SIGKILL")
		throw error
	})
	return started.then((url) => ({
		origin: url,
		appDir,
		cacheDir,
		logs: output.logs,
		// The group gets SIGTERM, the child is awaited, and whatever of the group ignored it is killed.
		async close() {
			process.off("exit", onExit)
			signalGroup(child, "SIGTERM")
			await exited(child)
			signalGroup(child, "SIGKILL")
			clean()
		},
	}))
}

function remove(dirs: readonly string[]): void {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
}

// `vite build` on Node into `outDir`, as a deploy runs it, with NODE_ENV `production`: a runner's `test` would resolve
// development builds, Solid's dev server among them. vite.config reads FLARE_E2E_RUNTIME to compose the Cloudflare
// plugin for a workers boot (B109). A failed build rejects with its output.
function viteBuild(input: { appDir: string; cacheDir: string; outDir: string; runtime: string }): Promise<void> {
	const child = spawn(process.execPath, [viteJs, "build", "--outDir", input.outDir], {
		cwd: input.appDir,
		env: {
			...process.env,
			NODE_ENV: "production",
			FLARE_VITE_CACHE: input.cacheDir,
			FLARE_E2E_RUNTIME: input.runtime,
			NO_COLOR: "1",
		},
		stdio: ["ignore", "pipe", "pipe"],
	})
	let text = ""
	child.stdout.on("data", (chunk: Buffer) => void (text += chunk.toString()))
	child.stderr.on("data", (chunk: Buffer) => void (text += chunk.toString()))
	return new Promise((resolve, reject) => {
		child.once("error", reject)
		child.once("exit", (code, signal) =>
			code === 0 ? resolve() : reject(new Error(`vite build exited (${exitOf(code, signal)})\n${text}`)),
		)
	})
}

// miniflare runs what `wrangler deploy` would ship: the deploy config the Cloudflare plugin wrote beside the Workers
// bundle, `<outDir>/server/wrangler.json`, read the way wrangler reads it (B109). The harness adds only FLARE_E2E and
// the log capture. The assets binding serves the client output, and a request no file answers reaches the worker.
async function bootWorkers(input: { appDir: string; cacheDir: string; outDir: string }): Promise<Boot> {
	const server = join(input.outDir, "server")
	const deploy = unstable_getMiniflareWorkerOptions(join(server, "wrangler.json"))
	if (deploy.main === undefined) throw new Error(`${server}/wrangler.json names no main`)
	const output = capture()
	const options = deploy.workerOptions
	const runtime = new Miniflare({
		...options,
		// The plugin's output is unbundled (`no_bundle`): every module file ships, the lazy route chunks among them.
		modules: modulesOf(server, resolve(server, deploy.main)),
		modulesRoot: server,
		// workerd's own stdout and stderr, where the worker's console goes, are captured like a child's.
		handleRuntimeStdio: (stdout: Readable, stderr: Readable) => {
			output.attach(stdout)
			output.attach(stderr)
		},
		// The docs app's e2e-only controls answer only under this flag.
		bindings: { ...options.bindings, FLARE_E2E: "1" },
	})
	const clean = (): void => remove([input.cacheDir, input.outDir])
	try {
		const url = await runtime.ready
		return {
			origin: url.origin,
			appDir: input.appDir,
			cacheDir: input.cacheDir,
			logs: output.logs,
			async close() {
				await runtime.dispose()
				clean()
			},
		}
	} catch (error) {
		await runtime.dispose()
		clean()
		throw error
	}
}

// Every JavaScript module of an unbundled Workers output, its main first, as `wrangler deploy` uploads them.
function modulesOf(dir: string, main: string): { type: "ESModule"; path: string }[] {
	const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
		.map((file) => join(dir, file))
		.filter((path) => /\.m?js$/.test(path) && path !== main)
	return [main, ...files.toSorted()].map((path) => ({ type: "ESModule", path }))
}

// The prod servers for Node and Bun. The adapters serve no files (B13), so these serve the client output by path
// first, as a deploy's static layer would, then hand the request to the adapter. Each prints its origin.
const STATIC = `
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
const out = process.argv[1];
const client = join(out, "client");
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".map": "application/json", ".ico": "image/x-icon", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml", ".webmanifest": "application/manifest+json" };
const { server } = await import(pathToFileURL(join(out, "server/server.js")).href);
async function file(pathname) {
	const path = normalize(join(client, decodeURIComponent(pathname)));
	if (!path.startsWith(client + sep)) return undefined;
	const info = await stat(path).catch(() => undefined);
	if (info === undefined || !info.isFile()) return undefined;
	return { body: await readFile(path), type: TYPES[extname(path)] ?? "application/octet-stream" };
}
`

const NODE_SERVE = `${STATIC}
import { createServer } from "node:http";
import { createNodeListener } from "@lovrozagar/flare/adapters/node";
const listener = createNodeListener(server);
const http = createServer(async (req, res) => {
	const found = await file(new URL(req.url ?? "/", "http://host").pathname);
	if (found === undefined) return listener(req, res);
	res.writeHead(200, { "content-type": found.type });
	res.end(found.body);
});
http.listen(0, "127.0.0.1", () => console.log("http://127.0.0.1:" + http.address().port));
`

const NODE_ARGS = ["--input-type=module", "-e", NODE_SERVE]

const BUN_SERVE = `${STATIC}
import { createBunFetch } from "@lovrozagar/flare/adapters/bun";
const app = createBunFetch(server);
const bun = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	maxRequestBodySize: app.maxRequestBodySize,
	async fetch(request) {
		const found = await file(new URL(request.url).pathname);
		if (found === undefined) return app.fetch(request);
		return new Response(found.body, { headers: { "content-type": found.type } });
	},
});
console.log("http://127.0.0.1:" + bun.port);
`
