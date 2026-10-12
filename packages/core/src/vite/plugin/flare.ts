import { existsSync } from "fs";
import { isAbsolute, relative, resolve, sep } from "path";
import solid from "@solidjs/vite-plugin";
import type { Plugin, UserConfig } from "vite";
import { boundaryTransform, type Graph } from "../boundary/index.ts";
import { installDevHandler } from "../dev/handler.ts";
import { clientUrl } from "./environments.ts";
import { parseOptions, type FlareOptions } from "./options.ts";

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
	};
}

// A script module of the app: under the root, outside its dependencies, and with no query. The path is
// root-relative with forward slashes, the form the B41 id hashes.
function appModule(root: string, id: string): string | undefined {
	if (id.includes("?") || id.startsWith("\0") || !/\.[cm]?[jt]sx?$/.test(id)) return undefined;
	const file = relative(root, id).split(sep).join("/");
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
