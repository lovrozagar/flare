import { existsSync } from "fs";
import { isAbsolute, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import solid from "@solidjs/vite-plugin";
import type { Plugin, UserConfig } from "vite";
import { boundaryTransform, checkChunk, type Graph } from "../boundary/index.ts";
import { chunkReferences } from "../codegen/index.ts";
import { inject } from "../css/index.ts";
import { installDevHandler } from "../dev/handler.ts";
import { buildInfoSource } from "./build-id.ts";
import { assetUrl, buildConfig, environmentBuild } from "./environments.ts";
import { parseOptions, type FlareOptions } from "./options.ts";

// The package's `src`, whose server folders a client or worker chunk may not hold (B45).
const PACKAGE_SRC = resolve(fileURLToPath(new URL("../..", import.meta.url)));

// The query keys Vite itself adds to an app module: a hot update's timestamp, a dependency hash, and an import
// marker. Any other query, such as `?raw`, `?url`, `?worker`, or `?inline`, asks for something that is not the module.
const VITE_QUERY = new Set(["t", "v", "import"]);

// The environments that run the server entry. Each loads build-info.ts with the build id and the client entry URL.
const SERVER_ENVIRONMENTS = new Set(["ssr", "worker"]);

// The module the server reads its build id and client entry from. The package ships its source.
const BUILD_INFO = fileURLToPath(new URL("../../server/lifecycle/build-info.ts", import.meta.url));

// The generated route module, whose `chunks` map the client build points at hashed files.
const ROUTES_GEN = "src/_gen/routes.gen.ts";

export function flare(options?: FlareOptions): Plugin[] {
	const parsed = parseOptions(options);
	// Vite's resolved `base`, which every built URL starts with, and where the client build writes its manifest.
	let base = "/";
	let manifest = "";
	return [
		chunks(),
		boundary(),
		...solid({ ssr: true, extensions: [".tsx", ".jsx"] }),
		...inject({ reset: parsed.css.reset, clientEntry: parsed.entry.client, assetsBase: parsed.assetsBase }),
		{
			name: "flare",
			config(config: UserConfig): UserConfig {
				assertHost(config.server?.host);
				const root = config.root ?? process.cwd();
				assertEntry(root, parsed.entry.client, "entry.client");
				assertEntry(root, parsed.entry.server, "entry.server");
				const entry = { client: resolve(root, parsed.entry.client), server: resolve(root, parsed.entry.server) };
				const user = { outDir: config.build?.outDir, assetsDir: config.build?.assetsDir };
				manifest = resolve(
					root,
					environmentBuild({ assetsBase: parsed.assetsBase, ...user }).client.outDir,
					".vite/manifest.json",
				);
				// Flare owns the entries and the dev server, so Vite serves no index.html (B89).
				return {
					appType: "custom",
					resolve: { dedupe: ["solid-js", "@solidjs/web"] },
					ssr: { noExternal: ["solid-js", "@solidjs/web", "@lovrozagar/flare", "@tanstack/solid-query"] },
					optimizeDeps: { exclude: ["@lovrozagar/flare"] },
					...buildConfig({ assetsBase: parsed.assetsBase, entry, user }),
					// Every URL Vite writes into CSS and JavaScript comes from the same resolver as the server's.
					experimental: { renderBuiltUrl: (file) => assetUrl(file, { base, assetsBase: parsed.assetsBase }) },
				};
			},
			configResolved(config) {
				base = config.base;
			},
			// A build's server environments read the manifest the client build wrote, so the client builds first.
			load(id) {
				const { name, config } = this.environment;
				if (id !== BUILD_INFO || !SERVER_ENVIRONMENTS.has(name)) return null;
				const urls = { base, assetsBase: parsed.assetsBase };
				return buildInfoSource({ command: config.command, entry: parsed.entry.client, manifest, urls });
			},
			configureServer(server) {
				return installDevHandler(server, parsed.entry.server);
			},
		},
	];
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
function boundary(): Plugin {
	return {
		name: "flare:boundary",
		enforce: "pre",
		transform(code, id) {
			const file = appModule(this.environment.config.root, id);
			if (file === undefined) return null;
			return boundaryTransform(file, code, graphOf(this.environment.name)) ?? null;
		},
		// Every module of every chunk, with its final code, before the chunk is written.
		renderChunk(_code, chunk) {
			const modules = chunk.moduleIds.map((id) => ({ id, code: this.getModuleInfo(id)?.code ?? null }));
			checkChunk({ graph: graphOf(this.environment.name), chunk: chunk.fileName, modules, packageSrc: PACKAGE_SRC });
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

function graphOf(name: string): Graph {
	return name === "ssr" || name === "worker" ? name : "client";
}

// A public bind would expose the dev server.
function assertHost(host: string | boolean | undefined): void {
	if (host === true || host === "0.0.0.0" || host === "::") throw new Error(String(host));
}

function assertEntry(root: string, entryPath: string, label: string): void {
	if (isAbsolute(entryPath)) throw new Error(label);
	if (!existsSync(resolve(root, entryPath))) throw new Error(`${label} ${entryPath}`);
}
