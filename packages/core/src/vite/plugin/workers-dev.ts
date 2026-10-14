import * as nodeModule from "node:module";
import type { Plugin } from "vite";
import type { WorkersDevOptions } from "./options.ts";

// An optional peer: only `flare({ workersDev: true })` loads it (dx/plugin.md workersDev, B95).
const PEER = "@cloudflare/vite-plugin";

export type CloudflareOptions = {
	viteEnvironment: { name: string };
	config: { main: string };
	inspectorPort?: number | false;
	persistState?: boolean | { path: string };
};

// The Cloudflare plugin runs in flare's worker environment, so the build-info module serves it the client entry, and
// its main is flare's worker entry, so the app's wrangler config needs none (B95 (a)). The inspector port and the
// persisted state pass through as the app set them, parsed already (BUGS.md 85).
export function cloudflareOptions(workerEntry: string, options: WorkersDevOptions = {}): CloudflareOptions {
	return { viteEnvironment: { name: "worker" }, config: { main: workerEntry }, ...options };
}

// How the peer is found and loaded, and whether this runtime can run it. The package exports only an `import`
// condition, so it is resolved and imported as ESM. It needs `node:module`'s `registerHooks`, which is detected, not
// inferred from a version. Tests pass their own.
export type PeerLoader = {
	resolve: (specifier: string) => string;
	load: (specifier: string) => Promise<unknown>;
	hooks: () => boolean;
};

const NATIVE: PeerLoader = {
	resolve: (specifier) => import.meta.resolve(specifier),
	load: (specifier) => import(specifier),
	hooks: () => typeof Reflect.get(nodeModule, "registerHooks") === "function",
};

// The Cloudflare plugin's plugins, which Vite awaits. A missing peer throws now, when flare() is created, and names the
// install.
export function workersDevPlugins(
	workerEntry: string,
	options: WorkersDevOptions,
	loader: PeerLoader = NATIVE,
): Promise<Plugin[]> {
	try {
		loader.resolve(PEER);
	} catch {
		throw new Error(`flare({ workersDev: true }) needs ${PEER}: npm install -D ${PEER}`);
	}
	// Bun 1.4.3 and Node before 22.15 have no registerHooks, which the peer imports (B95).
	if (!loader.hooks()) {
		throw new Error(
			`flare({ workersDev: true }) runs Vite on Node 22.15 or later; this runtime is ${runtimeName(process.versions)}`,
		);
	}
	return loader.load(PEER).then((module) => {
		const cloudflare: unknown = Reflect.get(Object(module), "cloudflare");
		if (typeof cloudflare !== "function") throw new Error(`${PEER} exports no cloudflare()`);
		return Reflect.apply(cloudflare, undefined, [cloudflareOptions(workerEntry, options)]) as Plugin[];
	});
}

// The runtime's name and version, as the hooks error names it.
export function runtimeName(versions: Readonly<Record<string, string | undefined>>): string {
	const bun = versions["bun"];
	return bun === undefined ? `Node ${String(versions["node"])}` : `Bun ${bun}`;
}
