import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { StringDecoder } from "node:string_decoder";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { readWrangler } from "../../src/vite/plugin/wrangler.ts";

const apps = fileURLToPath(new URL("./apps/", import.meta.url));

// A prod build's output, under the repo's node_modules so the built server's external imports resolve as a
// deploy's would. It is not the app directory, and nothing is written there (B70).
const outputs = fileURLToPath(new URL("../../../../node_modules/.flare-e2e/", import.meta.url));

export type Boot = {
	origin: string;
	appDir: string;
	cacheDir: string;
	// A prod boot's build output: `client`, `server`, and `worker` under it.
	outDir?: string | undefined;
	// What the runtime printed so far, stdout and stderr, one entry per line in the order it arrived. In memory only.
	logs: () => readonly string[];
	close: () => Promise<void>;
};

// A runtime's output, split into lines as it arrives. A line still being written is the last entry.
function capture(): { attach: (stream: Readable | null) => void; logs: () => readonly string[] } {
	const lines: string[] = [];
	const pending: string[] = [];
	return {
		attach(stream) {
			const decoder = new StringDecoder("utf8");
			const slot = pending.push("") - 1;
			stream?.on("data", (chunk: Buffer) => {
				const parts = `${pending[slot]}${decoder.write(chunk)}`.split("\n");
				pending[slot] = parts.pop() ?? "";
				lines.push(...parts);
			});
		},
		logs: () => [...lines, ...pending.filter((line) => line !== "")],
	};
}

const APPS = new Set(["minimal", "basepath", "docs"]);
const RUNTIMES = new Set(["node", "bun", "workers"]);

// `dev` is `vite dev`: on Node, under the Bun runtime, or on Node with the app's flare({ workersDev }) on, which renders
// in workerd (B95). `prod` is `vite build` on Node, then the runtime's adapter over the output: the Node listener,
// `Bun.serve`, or miniflare from the app's wrangler.jsonc (B70).
export async function boot(input: { app: string; runtime: string; mode: string }): Promise<Boot> {
	if (!APPS.has(input.app)) throw new Error(input.app);
	return bootApp({ appDir: join(apps, input.app), runtime: input.runtime, mode: input.mode });
}

// The same boot over any app directory. The golden test boots an app staged with the installed tarball (bits/14).
export async function bootApp(input: { appDir: string; runtime: string; mode: string }): Promise<Boot> {
	if (!RUNTIMES.has(input.runtime)) throw new Error(input.runtime);
	if (input.mode !== "dev" && input.mode !== "prod") throw new Error(input.mode);
	const appDir = input.appDir;
	const cacheDir = await mkdtemp(join(tmpdir(), "flare-vite-"));
	// A child process, so the app's Vite and the framework it loads stay out of the test process.
	if (input.mode === "dev") return bootChild({ appDir, cacheDir, ...devCommand(input.runtime) });
	mkdirSync(outputs, { recursive: true });
	const outDir = await mkdtemp(join(outputs, "out-"));
	try {
		await viteBuild({ appDir, cacheDir, outDir });
	} catch (error) {
		remove([cacheDir, outDir]);
		throw error;
	}
	if (input.runtime === "workers") return { ...(await bootWorkers({ appDir, cacheDir, outDir })), outDir };
	const [bin, args] = input.runtime === "bun" ? ["bun", ["-e", BUN_SERVE]] : [process.execPath, NODE_ARGS];
	return { ...(await bootChild({ appDir, cacheDir, bin, args: [...args, outDir], dirs: [outDir] })), outDir };
}

const viteBin = fileURLToPath(new URL("../../../../node_modules/.bin/vite", import.meta.url));

// The dev server per runtime. The app's vite.config reads FLARE_E2E_RUNTIME to turn workersDev on (B95).
function devCommand(runtime: string): { bin: string; args?: readonly string[]; env: Record<string, string> } {
	const env = { FLARE_E2E_RUNTIME: runtime };
	if (runtime === "bun") return { bin: "bun", args: ["--bun", viteJs, "--host", "127.0.0.1", "--port", "0"], env };
	return { bin: viteBin, env };
}
const viteJs = fileURLToPath(new URL("../../../../node_modules/vite/bin/vite.js", import.meta.url));

// The cache dir, and any other dir the boot made, go when the child exits for any reason, when it cannot start, and
// when the test process exits first, so a failed or timed-out run leaves nothing behind.
export function bootChild(input: {
	appDir: string;
	cacheDir: string;
	bin: string;
	args?: readonly string[];
	dirs?: readonly string[];
	env?: Record<string, string>;
}): Promise<Boot> {
	const { appDir, cacheDir } = input;
	const child = spawn(input.bin, input.args ?? ["--host", "127.0.0.1", "--port", "0"], {
		cwd: appDir,
		// Playwright sets FORCE_COLOR. A colored URL would never match readOrigin, and NO_COLOR wins over it.
		env: { ...process.env, ...input.env, FLARE_VITE_CACHE: cacheDir, NO_COLOR: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	const output = capture();
	output.attach(child.stdout);
	output.attach(child.stderr);
	const clean = (): void => remove([cacheDir, ...(input.dirs ?? [])]);
	const onExit = (): void => {
		child.kill("SIGTERM");
		clean();
	};
	child.once("exit", clean);
	child.once("error", clean);
	process.once("exit", onExit);
	return readOrigin(child).then((url) => ({
		origin: url,
		appDir,
		cacheDir,
		logs: output.logs,
		async close() {
			process.off("exit", onExit);
			child.kill("SIGTERM");
			await exited(child);
			clean();
		},
	}));
}

function remove(dirs: readonly string[]): void {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

// `vite build` on Node into `outDir`, as a deploy runs it. A test runner's NODE_ENV of `test` would make Vite resolve
// development builds, Solid's dev server build among them, so the build runs with `production`. A failed build
// rejects with its output.
function viteBuild(input: { appDir: string; cacheDir: string; outDir: string }): Promise<void> {
	const child = spawn(process.execPath, [viteJs, "build", "--outDir", input.outDir], {
		cwd: input.appDir,
		env: { ...process.env, NODE_ENV: "production", FLARE_VITE_CACHE: input.cacheDir, NO_COLOR: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let text = "";
	child.stdout.on("data", (chunk: Buffer) => void (text += chunk.toString()));
	child.stderr.on("data", (chunk: Buffer) => void (text += chunk.toString()));
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`vite build exited ${code}\n${text}`))));
	});
}

// miniflare runs the worker bundle with the app's compatibility settings. The assets binding serves the client
// output, and a request no file answers reaches the worker.
async function bootWorkers(input: { appDir: string; cacheDir: string; outDir: string }): Promise<Boot> {
	const config = readWrangler(input.appDir);
	if (config === undefined) throw new Error(`${input.appDir} has no wrangler.jsonc`);
	const worker = join(input.outDir, "worker");
	const assets = { directory: join(input.outDir, "client"), routerConfig: { has_user_worker: true } };
	const output = capture();
	const runtime = new Miniflare({
		modules: true,
		// workerd's own stdout and stderr, where the worker's console goes, are captured like a child's.
		handleRuntimeStdio: (stdout: Readable, stderr: Readable) => {
			output.attach(stdout);
			output.attach(stderr);
		},
		scriptPath: join(worker, "index.js"),
		modulesRoot: worker,
		...(config.compatibilityDate === undefined ? {} : { compatibilityDate: config.compatibilityDate }),
		compatibilityFlags: config.compatibilityFlags,
		...(config.binding === undefined ? {} : { assets: { ...assets, binding: config.binding } }),
	});
	const clean = (): void => remove([input.cacheDir, input.outDir]);
	try {
		const url = await runtime.ready;
		return {
			origin: url.origin,
			appDir: input.appDir,
			cacheDir: input.cacheDir,
			logs: output.logs,
			async close() {
				await runtime.dispose();
				clean();
			},
		};
	} catch (error) {
		await runtime.dispose();
		clean();
		throw error;
	}
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
`;

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
`;

const NODE_ARGS = ["--input-type=module", "-e", NODE_SERVE];

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
`;

function readOrigin(child: ChildProcess): Promise<string> {
	return new Promise((resolve, reject) => {
		let text = "";
		const onData = (chunk: Buffer) => {
			text += chunk.toString();
			const found = text.match(/http:\/\/127\.0\.0\.1:\d+/);
			if (!found) return;
			resolve(found[0]);
		};
		child.stdout?.on("data", onData);
		child.stderr?.on("data", onData);
		child.once("exit", () => reject(new Error(text || "vite exited")));
		child.once("error", reject);
	});
}

function exited(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null) return Promise.resolve();
	return new Promise((resolve) => {
		child.once("exit", () => resolve());
	});
}
