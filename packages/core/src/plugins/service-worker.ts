import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ViteManifest } from "../module-graph/index.ts";
import { generateSwSource } from "../service-worker/template.ts";
import type { VitePlugin } from "./types.ts";

/* ── Config ──────────────────────────────────────────────────────── */

export interface ServiceWorkerConfig {
	offlineFallback?: string;
	runtimeCacheMax?: number;
	scope?: string;
	skipWaiting?: boolean;
}

interface ResolvedServiceWorkerConfig {
	offlineFallback?: string;
	runtimeCacheMax: number;
	scope: string;
	skipWaiting: boolean;
}

const SW_DEFAULTS: ResolvedServiceWorkerConfig = {
	runtimeCacheMax: 32,
	scope: "/",
	skipWaiting: true,
};

export function normalizeSwConfig(
	input: ServiceWorkerConfig | boolean | undefined,
): ResolvedServiceWorkerConfig | undefined {
	if (input === false || input === undefined) return undefined;
	if (input === true) return { ...SW_DEFAULTS };
	return { ...SW_DEFAULTS, ...input };
}

/* ── Manifest utilities ──────────────────────────────────────────── */

export function extractPrecacheUrls(manifest: ViteManifest): string[] {
	const urls = new Set<string>();

	for (const entry of Object.values(manifest)) {
		if (entry.file) {
			urls.add(`/${entry.file}`);
		}
		if (entry.css) {
			for (const css of entry.css) {
				urls.add(`/${css}`);
			}
		}
	}

	return [...urls];
}

export function computeBuildId(urls: string[]): string {
	const sorted = [...urls].sort();
	const hash = createHash("sha256").update(sorted.join("\n")).digest("hex");
	return hash.slice(0, 12);
}

/* ── Dev SW ──────────────────────────────────────────────────────── */

function generateDevSw(offlineFallback?: string): string {
	if (!offlineFallback) {
		return `self.addEventListener("install", function () { self.skipWaiting() })
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()) })
`;
	}

	return `var OFFLINE_PAGE = ${JSON.stringify(offlineFallback)}
var CACHE = "flare-dev-offline"

self.addEventListener("install", function (event) {
	event.waitUntil(
		caches.open(CACHE).then(function (cache) {
			return fetch(OFFLINE_PAGE).then(function (res) {
				if (res.ok) return cache.put(OFFLINE_PAGE, res)
			}).catch(function () {})
		}).then(function () { self.skipWaiting() })
	)
})

self.addEventListener("activate", function (event) {
	event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", function (event) {
	if (event.request.mode !== "navigate") return
	event.respondWith(
		fetch(event.request).catch(function () {
			return caches.match(OFFLINE_PAGE)
		})
	)
})
`;
}

interface NodeReq {
	url?: string;
}

interface NodeRes {
	end: (data?: unknown) => void;
	writeHead: (status: number, headers: Record<string, string>) => void;
}

interface ViteDevServer {
	middlewares: {
		use: (fn: (req: NodeReq, res: NodeRes, next: () => void) => void) => void;
	};
}

export function createServiceWorkerPlugin(
	swConfig: ResolvedServiceWorkerConfig,
	assetsBase: string = "/assets",
): VitePlugin {
	return {
		closeBundle(this: { environment?: { config?: { root?: string }; name?: string } }): void {
			const envName = this.environment?.name;
			/* Multi-env: SSR closes last, manifest already written. Single-env: no "ssr" env, fire on "client". */
			if (envName !== "ssr" && envName !== "client") return;

			const root = this.environment?.config?.root ?? process.cwd();
			const manifestPath = join(root, "dist/client/.vite/manifest.json");

			if (!existsSync(manifestPath)) return;

			const raw = readFileSync(manifestPath, "utf-8");
			const manifest = JSON.parse(raw) as ViteManifest;
			const urls = extractPrecacheUrls(manifest);
			const buildId = computeBuildId(urls);

			const swSource = generateSwSource(urls, buildId, {
				assetsBase,
				offlineFallback: swConfig.offlineFallback ?? null,
				runtimeCacheMax: swConfig.runtimeCacheMax,
				skipWaiting: swConfig.skipWaiting,
			});

			writeFileSync(join(root, "dist/client/sw.js"), swSource, "utf-8");
			process.stderr.write(`[flare:service-worker] Generated sw.js (${urls.length} assets, build ${buildId})\n`);
		},

		configurePreviewServer(server: unknown) {
			const preview = server as {
				config?: { root?: string };
				middlewares: ViteDevServer["middlewares"];
			};
			const root = preview.config?.root ?? process.cwd();
			const swPath = join(root, "dist/client/sw.js");

			preview.middlewares.use((req, res, next) => {
				if (req.url === "/sw.js" && existsSync(swPath)) {
					const content = readFileSync(swPath, "utf-8");
					res.writeHead(200, {
						"cache-control": "no-cache",
						"content-type": "application/javascript",
					});
					res.end(content);
					return;
				}
				next();
			});
			return undefined;
		},

		configureServer(server: unknown) {
			const vite = server as ViteDevServer;
			const devSwSource = generateDevSw(swConfig.offlineFallback);
			vite.middlewares.use((req, res, next) => {
				if (req.url === "/sw.js") {
					res.writeHead(200, {
						"cache-control": "no-cache",
						"content-type": "application/javascript",
					});
					res.end(devSwSource);
					return;
				}
				next();
			});
			return undefined;
		},

		load(id: string): { code: string; moduleType: string } | null {
			if (id === "\0virtual:flare-sw-config") {
				return {
					code: `export default ${JSON.stringify({
						enabled: true,
						path: "/sw.js",
						scope: swConfig.scope,
					})}`,
					moduleType: "js",
				};
			}
			return null;
		},

		name: "flare:service-worker",

		resolveId(id: string): string | null {
			if (id === "virtual:flare-sw-config") return "\0virtual:flare-sw-config";
			return null;
		},
	};
}

export function createServiceWorkerDisabledPlugin(): VitePlugin {
	return {
		load(id: string): { code: string; moduleType: string } | null {
			if (id === "\0virtual:flare-sw-config") {
				return { code: "export default { enabled: false }", moduleType: "js" };
			}
			return null;
		},

		name: "flare:service-worker",

		resolveId(id: string): string | null {
			if (id === "virtual:flare-sw-config") return "\0virtual:flare-sw-config";
			return null;
		},
	};
}
