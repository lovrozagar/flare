import { existsSync } from "fs";
import { isAbsolute, resolve } from "path";
import solid from "@solidjs/vite-plugin";
import type { Plugin, UserConfig } from "vite";
import { parseOptions, type FlareOptions } from "./options.ts";

export function flare(options?: FlareOptions): Plugin[] {
	const parsed = parseOptions(options);
	return [
		...solid({ ssr: true, extensions: [".tsx", ".jsx"] }),
		{
			name: "flare",
			config(config: UserConfig): void {
				assertHost(config.server?.host);
				const root = `${config.root}`;
				assertEntry(root, parsed.entry.client, "entry.client");
				assertEntry(root, parsed.entry.server, "entry.server");
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
