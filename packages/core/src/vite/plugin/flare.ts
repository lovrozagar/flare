import { existsSync } from "fs";
import { isAbsolute, resolve } from "path";
import solid from "@solidjs/vite-plugin";
import type { Plugin, UserConfig } from "vite";
import { installDevHandler } from "../dev/handler.ts";
import { clientUrl } from "./environments.ts";
import { parseOptions, type FlareOptions } from "./options.ts";

// The environments that run the server entry. Each gets the client entry URL as a literal (dx/plugin.md).
const SERVER_ENVIRONMENTS = new Set(["ssr", "worker"]);

export function flare(options?: FlareOptions): Plugin[] {
	const parsed = parseOptions(options);
	return [
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

// A public bind would expose the dev server.
function assertHost(host: string | boolean | undefined): void {
	if (host === true || host === "0.0.0.0" || host === "::") throw new Error(String(host));
}

function assertEntry(root: string, entryPath: string, label: string): void {
	if (isAbsolute(entryPath)) throw new Error(label);
	if (!existsSync(resolve(root, entryPath))) throw new Error(`${label} ${entryPath}`);
}
