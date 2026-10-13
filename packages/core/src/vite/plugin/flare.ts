import { existsSync } from "fs";
import { isAbsolute, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import solid from "@solidjs/vite-plugin";
import type { Plugin, UserConfig } from "vite";
import { boundaryTransform, checkChunk, graphOf, type Graph } from "../boundary/index.ts";
import { chunkReferences, watchGenerated, writeGenerated } from "../codegen/index.ts";
import { inject } from "../css/index.ts";
import { imageEndpoint, imagePlugin } from "../../features/image/vite/index.ts";
import { devEndpoints } from "../dev/guard.ts";
import { prerenderApp } from "../prerender/index.ts";
import { installDevHandler } from "../dev/handler.ts";
import { buildInfoSource } from "./build-id.ts";
import { fontsPlugin } from "./fonts.ts";
import { assetUrl, buildConfig, environmentBuild } from "./environments.ts";
import { readWrangler } from "./wrangler.ts";
import { parseOptions, type FlareOptions, type ParsedOptions } from "./options.ts";

// The package's `src`, whose server folders a client or worker chunk may not hold (B45).
const PACKAGE_SRC = resolve(fileURLToPath(new URL("../..", import.meta.url)));

// The query keys Vite itself adds to an app module: a hot update's timestamp, a dependency hash, and an import
// marker. Any other query, such as `?raw`, `?url`, `?worker`, or `?inline`, asks for something that is not the module.
const VITE_QUERY = new Set(["t", "v", "import"]);

// The environments that run the server entry. Each loads build-info.ts with the build id and the client entry URL.
const SERVER_ENVIRONMENTS = new Set(["ssr", "worker"]);

// The module the server reads its build id and client entry from. The package ships its source.
const BUILD_INFO = fileURLToPath(new URL("../../server/lifecycle/build-info.ts", import.meta.url));

// The cross-tab switch. `flare({ broadcast: false })` replaces it in the client environment (dx/plugin.md).
const SYNC_ENABLED = fileURLToPath(new URL("../../client/sync/enabled.ts", import.meta.url));
const BROADCAST_OFF = "export const broadcastEnabled = false;\n";

// The worker environment's entry: the app's server behind the Workers adapter.
const WORKER_ENTRY = "virtual:flare/worker";
const RESOLVED_WORKER = `\0${WORKER_ENTRY}`;
const WORKERS_HANDLER = fileURLToPath(new URL("../../adapters/workers/handler.ts", import.meta.url));

// The generated route module, whose `chunks` map the client build points at hashed files.
const ROUTES_GEN = "src/_gen/routes.gen.ts";

export function flare(options?: FlareOptions): Plugin[] {
	const parsed = parseOptions(options);
	const state: State = { base: "/", manifest: "", workerSource: "", root: process.cwd() };
	// `image` turns optimization on. Absent, no image plugin runs and sharp is never loaded (dx/plugin.md image).
	const image = parsed.image;
	return [
		chunks(),
		boundary(),
		...(image === undefined ? [] : [imagePlugin(image, parsed.assetsBase)]),
		...solid({ ssr: true, extensions: [".tsx", ".jsx"] }),
		...inject({ reset: parsed.css.reset, clientEntry: parsed.entry.client, assetsBase: parsed.assetsBase }),
		core(parsed, state),
		devEndpoints(image === undefined ? [] : [imageEndpoint(image, state)]),
		// `fonts` turns the build-time font copy on. Absent, the app serves `/fonts/...` itself (dx/plugin.md fonts).
		...(parsed.fonts === undefined ? [] : [fontsPlugin(parsed.fonts.dir)]),
	];
}

// The config, the build environments, the server's build info, the worker entry, and the dev server.
// What the config hook settles for the later hooks: Vite's resolved `base`, which every built URL starts with, where
// the client build writes its manifest, and the worker entry's source.
type State = { base: string; manifest: string; workerSource: string; root: string };

function core(parsed: ParsedOptions, state: State): Plugin {
	return {
		name: "flare",
		config(config: UserConfig): UserConfig {
			return flareConfig(config, parsed, state);
		},
		configResolved(config) {
			state.base = config.base;
			state.root = config.root;
		},
		// Codegen is always on: a build and `vite dev` write src/_gen first, and a failure fails the start (B89).
		buildStart() {
			writeGenerated(this.environment.config.root);
		},
		resolveId(id) {
			return id === WORKER_ENTRY && state.workerSource !== "" ? RESOLVED_WORKER : null;
		},
		// A build's server environments read the manifest the client build wrote, so the client builds first.
		load(id) {
			if (id === RESOLVED_WORKER) return state.workerSource;
			const { name, config } = this.environment;
			if (id === SYNC_ENABLED) return parsed.broadcast || graphOf(name) !== "client" ? null : BROADCAST_OFF;
			if (id !== BUILD_INFO || !SERVER_ENVIRONMENTS.has(name)) return null;
			const urls = { base: state.base, assetsBase: parsed.assetsBase };
			const input = { command: config.command, entry: parsed.entry.client, manifest: state.manifest, urls };
			return buildInfoSource(input);
		},
		configureServer(server) {
			watchGenerated(server, server.config.root);
			return installDevHandler(server, parsed.entry.server);
		},
	};
}

// The Vite config flare owns. Flare owns the entries and the dev server, so Vite serves no index.html (B89).
function flareConfig(config: UserConfig, parsed: ParsedOptions, state: State): UserConfig {
	assertHost(config.server?.host);
	const root = config.root ?? process.cwd();
	assertEntry(root, parsed.entry.client, "entry.client");
	assertEntry(root, parsed.entry.server, "entry.server");
	const entry = { client: resolve(root, parsed.entry.client), server: resolve(root, parsed.entry.server) };
	const user = { outDir: config.build?.outDir, assetsDir: config.build?.assetsDir };
	const client = environmentBuild({ assetsBase: parsed.assetsBase, ...user }).client.outDir;
	state.manifest = resolve(root, client, ".vite/manifest.json");
	const workers = readWrangler(root);
	state.workerSource = workers === undefined ? "" : workerModule(entry.server, workers.binding);
	const worker = workers === undefined ? undefined : WORKER_ENTRY;
	// Prerender runs once the server is built, and writes its seeds into the client output (bits/12).
	const afterBuild = (built: { clientDir: string; serverFile: string }): Promise<void> =>
		prerenderApp({ root, ...built, assetsBase: parsed.assetsBase, config: parsed.prerender });
	return {
		appType: "custom",
		resolve: { dedupe: ["solid-js", "@solidjs/web"] },
		ssr: { noExternal: ["solid-js", "@solidjs/web", "@lovrozagar/flare", "@tanstack/solid-query"] },
		optimizeDeps: { exclude: ["@lovrozagar/flare"] },
		...buildConfig({ assetsBase: parsed.assetsBase, entry, user, worker, afterBuild }),
		// A Web Worker bundle is a client graph: rewritten and scanned like the client (B9, B45).
		worker: { plugins: () => [boundary("client")] },
		// Every URL Vite writes into CSS and JavaScript comes from the same resolver as the server's.
		experimental: { renderBuiltUrl: (file) => assetUrl(file, { base: state.base, assetsBase: parsed.assetsBase }) },
	};
}

// The worker entry: the app's `server` export behind createWorkersHandler, forwarding an unmatched GET to the
// config's assets binding (dx/adapters.md).
function workerModule(server: string, binding: string | undefined): string {
	const options = binding === undefined ? "{}" : `{ assets: ${JSON.stringify(binding)} }`;
	return [
		`import { server } from ${JSON.stringify(server)};`,
		`import { createWorkersHandler } from ${JSON.stringify(WORKERS_HANDLER)};`,
		`export default createWorkersHandler(server, ${options});`,
		"",
	].join("\n");
}

// A client build points the generated `chunks` map at the hashed files, before any other transform reprints the module.
function chunks(): Plugin {
	return {
		name: "flare:chunks",
		enforce: "pre",
		transform(code, id) {
			const { name, config } = this.environment;
			if (name !== "client" || config.command !== "build" || id !== resolve(config.root, ROUTES_GEN)) return null;
			return chunkReferences(code, (path) => this.emitFile({ type: "chunk", id: resolve(config.root, path.slice(1)) }));
		},
	};
}

// Before Solid compiles JSX, each app module is rewritten for the graph that loads it: split, the env helpers, and
// the server function ids (B8, B9, B41).
// A Web Worker bundle passes `client`: a `?worker` module is a client graph whatever environment imports it (B9).
function boundary(fixed?: Graph): Plugin {
	return {
		name: "flare:boundary",
		enforce: "pre",
		transform(code, id) {
			const file = appModule(this.environment.config.root, id);
			if (file === undefined) return null;
			return boundaryTransform(file, code, fixed ?? graphOf(this.environment.name)) ?? null;
		},
		// Every module of every chunk, with its final code, before the chunk is written.
		renderChunk(_code, chunk) {
			const modules = chunk.moduleIds.map((id) => ({ id, code: this.getModuleInfo(id)?.code ?? null }));
			const graph = fixed ?? graphOf(this.environment.name);
			checkChunk({ graph, chunk: chunk.fileName, modules, packageSrc: PACKAGE_SRC });
			return null;
		},
	};
}

// A script module of the app: under the root, outside its dependencies, and with no query but Vite's own. The path
// is root-relative with forward slashes, the form the B41 id hashes.
function appModule(root: string, id: string): string | undefined {
	const path = id.replace(/\?.*$/s, "");
	const query = id.slice(path.length + 1);
	if (![...new URLSearchParams(query).keys()].every((key) => VITE_QUERY.has(key))) return undefined;
	if (path.startsWith("\0") || !/\.[cm]?[jt]sx?$/.test(path)) return undefined;
	const file = relative(root, path).split(sep).join("/");
	if (file.startsWith("../") || isAbsolute(file) || file.split("/").includes("node_modules")) return undefined;
	return file;
}

// A public bind would expose the dev server.
function assertHost(host: string | boolean | undefined): void {
	if (host === true || host === "0.0.0.0" || host === "::") throw new Error(String(host));
}

function assertEntry(root: string, entryPath: string, label: string): void {
	if (isAbsolute(entryPath)) throw new Error(label);
	if (!existsSync(resolve(root, entryPath))) throw new Error(`${label} ${entryPath}`);
}
