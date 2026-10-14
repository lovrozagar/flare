import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import type { Plugin, UserConfig } from "vite";
import { boundaryTransform, checkChunk, graphOf, type Graph } from "../boundary/index.ts";
import { chunkReferences, watchGenerated, writeGenerated } from "../codegen/index.ts";
import { inject } from "../css/index.ts";
import { imageEndpoint, imagePlugin } from "../../features/image/vite/index.ts";
import { devEndpoints } from "../dev/guard.ts";
import { prerenderApp } from "../prerender/index.ts";
import { devHead as devHeadOf } from "../dev/dev-head.ts";
import { installDevStyles } from "../dev/dev-styles.ts";
import { installDevHandler } from "../dev/handler.ts";
import { buildInfoSource } from "./build-id.ts";
import { ownModule } from "./own-module.ts";
import { fontsPlugin } from "./fonts.ts";
import { assetUrl, buildConfig, environmentBuild, PRERENDER_ENV, SERVER_BUNDLED } from "./environments.ts";
import { readWrangler } from "./wrangler.ts";
import { realPath } from "./real-path.ts";
import { preloadPlugin } from "./preload.ts";
import { checkCloudflare, composesCloudflare, WORKER_MAIN } from "./cloudflare.ts";
import { parseOptions, type FlareOptions, type ParsedOptions } from "./options.ts";

// The package's `src`, whose server folders a client or worker chunk may not hold (B45).
const PACKAGE_SRC = resolve(fileURLToPath(new URL("../..", import.meta.url)));

// The query keys Vite itself adds to an app module: a hot update's timestamp, a dependency hash, and an import
// marker. Any other query, such as `?raw`, `?url`, `?worker`, or `?inline`, asks for something that is not the module.
const VITE_QUERY = new Set(["t", "v", "import"]);

// The environments that run the server entry. Each loads build-info.ts with the build id and the client entry URL.
const SERVER_ENVIRONMENTS = new Set(["ssr", PRERENDER_ENV]);

// The module the server reads its build id and client entry from. The package ships its source.
const BUILD_INFO = ownModule("../../server/lifecycle/build-info.ts", import.meta.url);

// The cross-tab switch. `flare({ broadcast: false })` replaces it in the client environment (dx/plugin.md).
const SYNC_ENABLED = ownModule("../../client/sync/enabled.ts", import.meta.url);
const BROADCAST_OFF = "export const broadcastEnabled = false;\n";

// The worker entry `@lovrozagar/flare/worker` re-exports: the app's server behind the Workers adapter (B109).
const WORKER_ENTRY = "virtual:flare/worker";
const RESOLVED_WORKER = `\0${WORKER_ENTRY}`;
const WORKERS_HANDLER = ownModule("../../adapters/workers/handler.ts", import.meta.url);

// The generated route module, whose `chunks` map the client build points at hashed files.
const ROUTES_GEN = "src/_gen/routes.gen.ts";

// Cloudflare Workers is the app's own plugin beside this one (B109).
export function flare(options?: FlareOptions): Plugin[] {
	return flarePlugins(parseOptions(options));
}

function flarePlugins(parsed: ParsedOptions): Plugin[] {
	const state: State = {
		base: "/",
		manifest: "",
		workerSource: "",
		root: process.cwd(),
		cloudflare: false,
		devHead: Promise.withResolvers(),
	};
	// `image` turns optimization on. Absent, no image plugin runs and sharp is never loaded (dx/plugin.md image).
	const image = parsed.image;
	return [
		chunks(),
		workerEntry(state),
		preloadPlugin(parsed.entry.client),
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
// `devHead` settles when the dev server starts (B95 (b)); a production run never reads it.
type State = {
	base: string;
	manifest: string;
	workerSource: string;
	root: string;
	// The app composes the Cloudflare plugin, found in the config hook (B109).
	cloudflare: boolean;
	devHead: PromiseWithResolvers<string>;
};

function core(parsed: ParsedOptions, state: State): Plugin {
	return {
		name: "flare",
		config(config: UserConfig): UserConfig {
			return flareConfig(config, parsed, state);
		},
		configResolved(config) {
			state.base = config.base;
			state.root = config.root;
			if (composesCloudflare(config.plugins) !== state.cloudflare) {
				throw new Error("flare() did not see the Cloudflare plugin in the config's plugins: list cloudflare() there");
			}
			const conditions = config.environments["ssr"]?.resolve.conditions ?? [];
			if (state.cloudflare) checkCloudflare({ conditions, main: readWrangler(config.root)?.main });
		},
		// Codegen is always on: a build and `vite dev` write src/_gen first, and a failure fails the start (B89).
		buildStart() {
			writeGenerated(this.environment.config.root);
		},
		// A build's server environments read the manifest the client build wrote, so the client builds first.
		load(id) {
			const { name, config } = this.environment;
			if (id === SYNC_ENABLED) return parsed.broadcast || graphOf(name) !== "client" ? null : BROADCAST_OFF;
			if (id !== BUILD_INFO || !SERVER_ENVIRONMENTS.has(name)) return null;
			const urls = { base: state.base, assetsBase: parsed.assetsBase };
			const input = { command: config.command, entry: parsed.entry.client, manifest: state.manifest, urls };
			if (config.command !== "serve") return buildInfoSource({ ...input, devHead: "" });
			// In dev, the module waits for devHead, which the dev server computes as it starts.
			return state.devHead.promise.then((devHead) => buildInfoSource({ ...input, devHead }));
		},
		// First among the plugins' server hooks: the Cloudflare plugin's starts the worker, whose server info module waits
		// for devHead, so devHead starts before it (B95 (b)).
		configureServer: {
			order: "pre",
			handler(server) {
				watchGenerated(server, server.config.root);
				devHeadOf(server).then(state.devHead.resolve, state.devHead.reject);
				installDevStyles(server, resolve(server.config.root, parsed.entry.client));
				const listen = installDevHandler(server, parsed.entry.server);
				// With the Cloudflare plugin, workerd answers through its post middleware, which a listener added from this
				// earlier hook would shadow (BUGS.md 76, B109).
				return state.cloudflare ? undefined : listen;
			},
		},
	};
}

// The Vite config flare owns. Flare owns the entries and the dev server, so Vite serves no index.html (B89).
function flareConfig(config: UserConfig, parsed: ParsedOptions, state: State): UserConfig {
	assertHost(config.server?.host);
	// Vite gives module ids as real paths, so the root is one too: a root reached through a symlink would otherwise
	// put every app module outside it (BUGS.md B51).
	const root = realPath(resolve(config.root ?? process.cwd()));
	assertEntry(root, parsed.entry.client, "entry.client");
	assertEntry(root, parsed.entry.server, "entry.server");
	const entry = { client: resolve(root, parsed.entry.client), server: resolve(root, parsed.entry.server) };
	const user = { outDir: config.build?.outDir, assetsDir: config.build?.assetsDir };
	const client = environmentBuild({ assetsBase: parsed.assetsBase, ...user }).client.outDir;
	state.manifest = resolve(root, client, ".vite/manifest.json");
	state.cloudflare = composesCloudflare(config.plugins);
	state.workerSource = state.cloudflare ? workerModule(entry.server, readWrangler(root)?.binding) : "";
	// Prerender runs once the server is built, and writes its seeds into the client output (bits/12). With the
	// Cloudflare plugin it runs only when on, from its own Node build of the server.
	const afterBuild = (built: { clientDir: string; serverFile: string }): Promise<void> =>
		prerenderApp({
			root,
			...built,
			assetsBase: parsed.assetsBase,
			config: parsed.prerender,
			...(state.cloudflare ? { workers: true } : {}),
		});
	const prerender = !state.cloudflare || parsed.prerender !== false;
	return {
		root,
		appType: "custom",
		resolve: { dedupe: ["solid-js", "@solidjs/web"] },
		ssr: { noExternal: SERVER_BUNDLED },
		optimizeDeps: { exclude: ["@lovrozagar/flare"] },
		...buildConfig({
			assetsBase: parsed.assetsBase,
			entry,
			user,
			cloudflare: state.cloudflare,
			...(prerender ? { afterBuild } : {}),
		}),
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

// The Wrangler config's `main`, `@lovrozagar/flare/worker`, is the app's server behind the Workers adapter. Resolved
// here, before Vite's own resolver reaches the package file, which only throws (B109).
function workerEntry(state: State): Plugin {
	return {
		name: "flare:worker-entry",
		enforce: "pre",
		resolveId(id) {
			return state.cloudflare && (id === WORKER_MAIN || id === WORKER_ENTRY) ? RESOLVED_WORKER : null;
		},
		load(id) {
			return id === RESOLVED_WORKER ? state.workerSource : null;
		},
	};
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
	// The root as configured and as a real path, so an id in either form is an app module (BUGS.md B51).
	let roots = { from: "", paths: [] as string[] };
	const rootsOf = (root: string): string[] => {
		if (roots.from !== root) roots = { from: root, paths: [...new Set([realPath(root), root])] };
		return roots.paths;
	};
	return {
		name: "flare:boundary",
		enforce: "pre",
		transform(code, id) {
			const file = appModule(rootsOf(this.environment.config.root), id);
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
function appModule(roots: readonly string[], id: string): string | undefined {
	const path = id.replace(/\?.*$/s, "");
	const query = id.slice(path.length + 1);
	if (![...new URLSearchParams(query).keys()].every((key) => VITE_QUERY.has(key))) return undefined;
	if (path.startsWith("\0") || !/\.[cm]?[jt]sx?$/.test(path)) return undefined;
	for (const root of roots) {
		const file = relative(root, path).split(sep).join("/");
		if (!file.startsWith("../") && !isAbsolute(file))
			return file.split("/").includes("node_modules") ? undefined : file;
	}
	return undefined;
}

// A public bind would expose the dev server.
function assertHost(host: string | boolean | undefined): void {
	if (host === true || host === "0.0.0.0" || host === "::") throw new Error(String(host));
}

function assertEntry(root: string, entryPath: string, label: string): void {
	if (isAbsolute(entryPath)) throw new Error(label);
	if (!existsSync(resolve(root, entryPath))) throw new Error(`${label} ${entryPath}`);
}
