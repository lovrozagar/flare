import { existsSync } from "fs";
import { isAbsolute, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import solid from "@solidjs/vite-plugin";
import type { Plugin, UserConfig } from "vite";
import { boundaryTransform, checkChunk, type Graph } from "../boundary/index.ts";
import { installDevHandler } from "../dev/handler.ts";
import { clientUrl } from "./environments.ts";
import { parseOptions, type FlareOptions } from "./options.ts";

// The package's `src`, whose server folders a client or worker chunk may not hold (B45).
const PACKAGE_SRC = resolve(fileURLToPath(new URL("../..", import.meta.url)));

// The query keys Vite itself adds to an app module: a hot update's timestamp, a dependency hash, and an import
// marker. Any other query, such as `?raw`, `?url`, `?worker`, or `?inline`, asks for something that is not the module.
const VITE_QUERY = new Set(["t", "v", "import"]);

// The environments that run the server entry. Each gets the client entry URL as a literal (dx/plugin.md).
const SERVER_ENVIRONMENTS = new Set(["ssr", "worker"]);

export function flare(options?: FlareOptions): Plugin[] {
	const parsed = parseOptions(options);
	return [
		boundary(),
		...solid({ ssr: true, extensions: [".tsx", ".jsx"] }),
		{
			name: "flare",
			config(config: UserConfig): UserConfig {
				assertHost(config.server?.host);
				const root = config.root ?? process.cwd();
				assertEntry(root, parsed.entry.client, "entry.client");
				assertEntry(root, parsed.entry.server, "entry.server");
				// Flare owns the entries and the dev server, so Vite serves no index.html (B89).
				return {
					appType: "custom",
					resolve: { dedupe: ["solid-js", "@solidjs/web"] },
					ssr: { noExternal: ["solid-js", "@solidjs/web", "@lovrozagar/flare", "@tanstack/solid-query"] },
					optimizeDeps: { exclude: ["@lovrozagar/flare"] },
				};
			},
			// A build defines the manifest's hashed file once the client is built (bit 12).
			configEnvironment(name, _config, env) {
				if (env.command !== "serve" || !SERVER_ENVIRONMENTS.has(name)) return undefined;
				const url = clientUrl({ entry: parsed.entry.client });
				return { define: { "import.meta.env.FLARE_CLIENT_ENTRY": JSON.stringify(url) } };
			},
			configureServer(server) {
				return installDevHandler(server, parsed.entry.server);
			},
		},
	];
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
