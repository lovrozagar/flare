/**
 * Service workers are the app's own: `src/service-worker.ts` (or `serviceWorker.entry`) is
 * bundled to `/service-worker.js` after the client build and registered by the client. It can
 * import this build's facts from `@lovrozagar/flare/service-worker`: `build` (hashed files),
 * `files` (public files), `version` (build id). Flare adds no worker logic of its own.
 *
 * Earlier Flare versions generated `/sw.js`. Until an app ships its own file there, a cleanup
 * worker at that path deletes the old caches and unregisters itself.
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { buildIdFromManifest, findClientDir, readClientManifest } from "./build-id.ts";
import { manifestFiles } from "./retain-assets.ts";
import type { VitePlugin } from "./types.ts";

export interface ServiceWorkerConfig {
	/** Worker source, relative to the project root. Default `src/service-worker.ts`. */
	entry?: string;
	/** Register it from the client. Default `true`; `false` leaves registration to the app. */
	register?: boolean;
}

export const SERVICE_WORKER_URL = "/service-worker.js";
const DEFAULT_ENTRY = "src/service-worker.ts";
const FACTS_MODULE = "@lovrozagar/flare/service-worker";
const FACTS_VIRTUAL = "virtual:flare-service-worker";
const FACTS_ID = "\0flare-service-worker-facts";

/** Files under `public/` as URL paths. */
function publicFiles(root: string): string[] {
	const dir = join(root, "public");
	if (!existsSync(dir)) return [];
	return (
		readdirSync(dir, { recursive: true, withFileTypes: true }) as Array<{
			isFile(): boolean;
			name: string;
			parentPath: string;
		}>
	)
		.filter((e) => e.isFile())
		.map((e) => `/${relative(dir, join(e.parentPath, e.name)).split(sep).join("/")}`)
		.sort();
}

/** Bundle the app's worker into the client output. Returns its URL, or undefined without one. */
export async function buildServiceWorker(options: { entry: string; root: string }): Promise<string | undefined> {
	const entry = resolve(options.root, options.entry);
	const manifest = readClientManifest(options.root);
	const clientDir = findClientDir(options.root);
	if (!existsSync(entry) || !manifest || !clientDir) return undefined;

	const facts = {
		build: manifestFiles(manifest).sort(),
		files: publicFiles(options.root),
		version: buildIdFromManifest(manifest),
	};
	const { build } = await import("vite");
	await build({
		build: {
			copyPublicDir: false,
			emptyOutDir: false,
			lib: { entry, fileName: () => SERVICE_WORKER_URL.slice(1), formats: ["iife"], name: "flareServiceWorker" },
			outDir: clientDir,
		},
		configFile: false,
		define: { "process.env.NODE_ENV": JSON.stringify("production") },
		logLevel: "warn",
		plugins: [
			{
				/* Before Vite's resolver, so the package path never reaches its real module. */
				enforce: "pre" as const,
				load: (id: string) =>
					id === FACTS_ID
						? Object.entries(facts)
								.map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};`)
								.join("\n")
						: null,
				name: "flare:service-worker-facts",
				resolveId: (id: string) => (id === FACTS_MODULE || id === FACTS_VIRTUAL ? FACTS_ID : null),
			},
		],
		publicDir: false,
		root: options.root,
	});
	return SERVICE_WORKER_URL;
}

const CLEANUP_WORKER = `/* Flare: the built-in service worker was removed. This replaces it once:
   clear its caches, then unregister so the page is uncontrolled again. */
self.addEventListener("install", function () { self.skipWaiting() })
self.addEventListener("activate", function (event) {
	event.waitUntil(
		caches.keys()
			.then(function (names) {
				return Promise.all(names.filter(function (n) {
					return n.indexOf("flare-assets-") === 0 || n.indexOf("flare-runtime-") === 0 || n === "flare-dev-offline"
				}).map(function (n) { return caches.delete(n) }))
			})
			.then(function () { return self.registration.unregister() })
	)
})
`;

/** Write the cleanup worker at `/sw.js` unless the app ships its own file there. */
export function writeCleanupServiceWorker(clientDir: string): boolean {
	const path = join(clientDir, "sw.js");
	if (existsSync(path)) return false;
	writeFileSync(path, CLEANUP_WORKER, "utf-8");
	return true;
}

export function createServiceWorkerPlugin(config: ServiceWorkerConfig | false | undefined): VitePlugin {
	return {
		async closeBundle(this: { environment?: { config?: { root?: string }; name?: string } }): Promise<void> {
			if (this.environment?.name !== "client") return;
			const root = this.environment.config?.root ?? process.cwd();
			const clientDir = findClientDir(root);
			if (!clientDir) return;
			if (config !== false) {
				const url = await buildServiceWorker({ entry: config?.entry ?? DEFAULT_ENTRY, root });
				if (url) process.stderr.write(`[flare:service-worker] built ${url}\n`);
			}
			writeCleanupServiceWorker(clientDir);
		},
		name: "flare:service-worker",
	};
}

/** Whether the client should register the built worker. */
export function serviceWorkerToRegister(
	root: string,
	config: ServiceWorkerConfig | false | undefined,
): string | undefined {
	if (config === false || config?.register === false) return undefined;
	const clientDir = findClientDir(root);
	return clientDir && existsSync(join(clientDir, SERVICE_WORKER_URL.slice(1))) ? SERVICE_WORKER_URL : undefined;
}
