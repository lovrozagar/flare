import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { findEntryKey, resolveModulePreloads, type ViteManifest } from "../module-graph/index.ts";
import type { SxCssManifest } from "../ssr/critical-css.ts";
import type { ResolvedEntries, VitePlugin } from "./types.ts";

/**
 * Read the client entry path from Vite's build manifest.
 * buildApp() builds client before SSR, so manifest.json exists
 * when the SSR build loads this virtual module.
 */
function readClientManifest(root: string): ViteManifest | undefined {
	const candidates = [
		join(root, "dist/client/.vite/manifest.json"),
		/* Nitro writes the client build under `.output/public`. */
		join(root, ".output/public/.vite/manifest.json"),
	];
	for (const manifestPath of candidates) {
		try {
			return JSON.parse(readFileSync(manifestPath, "utf-8")) as ViteManifest;
		} catch {
			/* try next location */
		}
	}
	return undefined;
}

/** Read the sx CSS manifest emitted by the sx-ast plugin during the client build. */
function readSxManifest(root: string): SxCssManifest | undefined {
	const manifestPath = join(root, "dist/client/flare-sx-manifest.json");
	try {
		const raw = readFileSync(manifestPath, "utf-8");
		/* Trust bundleHref written by sx-ast — it knows assetsBase. */
		return JSON.parse(raw) as SxCssManifest;
	} catch {
		/* sx plugin not enabled or client not built yet */
	}
	return undefined;
}

function resolveClientEntryFromManifest(root: string, clientEntry: string): string | undefined {
	const manifest = readClientManifest(root);
	if (!manifest) return undefined;

	const entry = manifest[clientEntry];
	if (entry?.file) return `/${entry.file}`;

	/* Fallback: find any entry chunk */
	for (const value of Object.values(manifest)) {
		if (value.isEntry && value.file) return `/${value.file}`;
	}
	return undefined;
}

export function createVirtualPlugin(
	config: { ignorePrefix?: string; logLevel?: string },
	entries: ResolvedEntries,
	codegen?: { routesFilePath?: string },
): VitePlugin {
	const routesFilePath = codegen?.routesFilePath ?? "src/_gen/routes.gen.ts";
	const serializedConfig = JSON.stringify({
		clientEntryFilePath: entries.client,
		ignorePrefix: config.ignorePrefix ?? "_",
	});

	/* Captured from the parent ResolvedConfig — use this instead of `environment.config.mode`,
	   because under cf-vite-plugin (Vite 8) the SSR worker environment reports `mode: "production"`
	   even during `vite serve`, which silently flips Flare into prod-CSP mode (no unsafe-inline,
	   nonces added) and breaks dev HMR + third-party widgets. */
	let isDevMode = false;

	return {
		config(_userConfig: unknown, env: { command?: string; mode?: string }) {
			if (env.command === "serve" || env.mode === "development") isDevMode = true;
			/* Inject `__FLARE_IS_DEV__` as a Vite define — survives cf-vite-plugin's SSR worker
			   bundle where `import.meta.env.DEV` is forced to `false` (SSR env mode defaults to
			   `production` even during `vite serve`). Define replacement is per-environment but
			   always honored, so this single source-of-truth flag works in every env. */
			return {
				define: {
					__FLARE_IS_DEV__: JSON.stringify(isDevMode),
				},
			};
		},
		configResolved(resolvedConfig: { command?: string; mode?: string }) {
			if (resolvedConfig.command === "serve" || resolvedConfig.mode === "development") {
				isDevMode = true;
			}
		},
		load(
			this: {
				environment?: {
					config?: { build?: { outDir?: string }; mode?: string; root?: string };
					name?: string;
				};
			},
			id: string,
		): { code: string; moduleType: string } | null {
			if (id === "\0virtual:flare-config") {
				return { code: `export default ${serializedConfig}`, moduleType: "js" };
			}
			if (id === "\0virtual:flare-client-entry") {
				const mode = this.environment?.config?.mode ?? "production";
				if (mode === "development") {
					return { code: `export default "/${entries.client}"`, moduleType: "js" };
				}
				/* Prod: read hashed filename from client build manifest */
				const root = this.environment?.config?.root ?? process.cwd();
				const resolved = resolveClientEntryFromManifest(root, entries.client);
				return {
					code: `export default "${resolved ?? `/${entries.client}`}"`,
					moduleType: "js",
				};
			}
			if (id === "\0virtual:flare-generated") {
				const root = this.environment?.config?.root ?? process.cwd();
				/* file:// URL gives rolldown an unambiguous filesystem anchor so relative imports
				   inside routes.gen.ts resolve from the real file location, not from the virtual
				   module's synthetic base (which otherwise produced 13-deep ../ traversals under
				   vite 8 + rolldown) */
				const genFileUrl = pathToFileURL(resolve(root, routesFilePath)).href;
				return {
					code: `export { routeTree, layouts, layoutModuleIds } from "${genFileUrl}"`,
					moduleType: "js",
				};
			}
			if (id === "\0virtual:flare-is-dev") {
				const dev = isDevMode || this.environment?.config?.mode === "development";
				return { code: `export default ${dev}`, moduleType: "js" };
			}
			if (id === "\0virtual:flare-log-level") {
				const dev = isDevMode || this.environment?.config?.mode === "development";
				const level = config.logLevel ?? (dev ? "warn" : "error");
				return { code: `export default "${level}"`, moduleType: "js" };
			}
			if (id === "\0virtual:flare-module-preloads") {
				const mode = this.environment?.config?.mode ?? "production";
				if (mode === "development") {
					return {
						code: ["export const entryPreloads = { js: [], css: [] }", "export const clientManifest = null"].join("\n"),
						moduleType: "js",
					};
				}
				const root = this.environment?.config?.root ?? process.cwd();
				const manifest = readClientManifest(root);
				if (!manifest) {
					return {
						code: ["export const entryPreloads = { js: [], css: [] }", "export const clientManifest = null"].join("\n"),
						moduleType: "js",
					};
				}
				const entryKey = findEntryKey(manifest);
				const preloads = entryKey ? resolveModulePreloads(manifest, entryKey) : { css: [], js: [] };
				return {
					code: [
						`export const entryPreloads = ${JSON.stringify(preloads)}`,
						`export const clientManifest = ${JSON.stringify(manifest)}`,
					].join("\n"),
					moduleType: "js",
				};
			}
			if (id === "\0virtual:flare-sx-manifest") {
				const mode = this.environment?.config?.mode ?? "production";
				if (mode === "development") {
					return { code: "export const sxManifest = null", moduleType: "js" };
				}
				const root = this.environment?.config?.root ?? process.cwd();
				const manifest = readSxManifest(root);
				return {
					code: `export const sxManifest = ${manifest ? JSON.stringify(manifest) : "null"}`,
					moduleType: "js",
				};
			}
			return null;
		},
		name: "flare:virtual",
		resolveId(id: string): string | null {
			if (id === "virtual:flare-config") return "\0virtual:flare-config";
			if (id === "virtual:flare-client-entry") return "\0virtual:flare-client-entry";
			if (id === "virtual:flare-generated") return "\0virtual:flare-generated";
			if (id === "virtual:flare-is-dev") return "\0virtual:flare-is-dev";
			if (id === "virtual:flare-log-level") return "\0virtual:flare-log-level";
			if (id === "virtual:flare-module-preloads") return "\0virtual:flare-module-preloads";
			if (id === "virtual:flare-sx-manifest") return "\0virtual:flare-sx-manifest";
			return null;
		},
	};
}
