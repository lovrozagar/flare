import type { Plugin } from "vite";

// An optional peer: only `flare({ workersDev: true })` loads it (dx/plugin.md workersDev, B95).
const PEER = "@cloudflare/vite-plugin";

export type CloudflareOptions = { viteEnvironment: { name: string }; config: { main: string } };

// The Cloudflare plugin runs in flare's worker environment, so the build-info module serves it the client entry, and
// its main is flare's worker entry, so the app's wrangler config needs none (B95 (a)).
export function cloudflareOptions(workerEntry: string): CloudflareOptions {
	return { viteEnvironment: { name: "worker" }, config: { main: workerEntry } };
}

// How the peer is found and loaded. The package exports only an `import` condition, so it is resolved and imported
// as ESM; tests pass their own.
export type PeerLoader = { resolve: (specifier: string) => string; load: (specifier: string) => Promise<unknown> };

const NATIVE: PeerLoader = {
	resolve: (specifier) => import.meta.resolve(specifier),
	load: (specifier) => import(specifier),
};

// The Cloudflare plugin's plugins, which Vite awaits. A missing peer throws now, when flare() is created, and names the
// install.
export function workersDevPlugins(workerEntry: string, loader: PeerLoader = NATIVE): Promise<Plugin[]> {
	try {
		loader.resolve(PEER);
	} catch {
		throw new Error(`flare({ workersDev: true }) needs ${PEER}: npm install -D ${PEER}`);
	}
	return loader.load(PEER).then((module) => {
		const cloudflare: unknown = Reflect.get(Object(module), "cloudflare");
		if (typeof cloudflare !== "function") throw new Error(`${PEER} exports no cloudflare()`);
		return Reflect.apply(cloudflare, undefined, [cloudflareOptions(workerEntry)]) as Plugin[];
	});
}
