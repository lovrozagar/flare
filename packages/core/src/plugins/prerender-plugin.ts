import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scanSourceFiles } from "../generators/index.ts";
import { buildPrerenderRoutes, prerender, writePrerenderOutput } from "../prerender/index.ts";
import { buildSitemapFromDefs, type ChangeFreq, generateRobotsTxt, type SitemapEntry } from "../sitemap/index.ts";
import type { VitePlugin } from "./types.ts";

interface ServerModuleHandler {
	fetch: (request: Request, env?: unknown) => Promise<Response>;
	getStaticParams?: () => Promise<Map<string, Record<string, string | string[]>[]>>;
}

interface ServerModule {
	handler?: ServerModuleHandler;
	server?: ServerModuleHandler;
}

export interface SitemapPluginConfig {
	additionalEntries?: SitemapEntry[];
	changefreq?: ChangeFreq | Record<string, ChangeFreq>;
	exclude?: string[];
	origin: string;
	priority?: number | Record<string, number>;
	robotsTxt?: boolean | string;
}

export interface PrerenderPluginConfig {
	concurrency?: number;
	env?: Record<string, unknown> | (() => Record<string, unknown> | Promise<Record<string, unknown>>);
	exclude?: string[];
	origin?: string;
	sitemap?: SitemapPluginConfig;
}

export function createPrerenderPlugin(config: {
	ignorePrefix?: string;
	prerender?: PrerenderPluginConfig | boolean;
}): VitePlugin {
	const prerenderConfig = typeof config.prerender === "object" ? config.prerender : ({} as PrerenderPluginConfig);

	return {
		async closeBundle(this: { environment?: { config?: { root?: string }; name?: string } }): Promise<void> {
			/* Only run during SSR build (after client is already built) */
			const envName = this.environment?.name;
			if (envName !== "ssr") return;

			const root = this.environment?.config?.root ?? process.cwd();
			const ignorePrefix = config.ignorePrefix ?? "_";

			/* 1. Scan source for route definitions (needed by both sitemap and prerender) */
			const defs = scanSourceFiles({ ignorePrefix, rootDir: root });
			const staticDir = join(root, "dist/static");

			/* 2. Generate sitemap if configured */
			const sitemapConfig = prerenderConfig.sitemap;
			if (sitemapConfig) {
				mkdirSync(staticDir, { recursive: true });
				const sitemapResult = buildSitemapFromDefs(defs, {
					additionalEntries: sitemapConfig.additionalEntries,
					changefreq: sitemapConfig.changefreq,
					exclude: sitemapConfig.exclude,
					origin: sitemapConfig.origin,
					priority: sitemapConfig.priority,
				});

				for (const file of sitemapResult.files) {
					writeFileSync(join(staticDir, file.path), file.content, "utf-8");
				}

				if (sitemapConfig.robotsTxt !== false && sitemapConfig.robotsTxt !== undefined) {
					const sitemapUrl = `${sitemapConfig.origin}/sitemap.xml`;
					const rules = typeof sitemapConfig.robotsTxt === "string" ? sitemapConfig.robotsTxt : undefined;
					writeFileSync(join(staticDir, "robots.txt"), generateRobotsTxt(sitemapUrl, rules), "utf-8");
				}

				process.stderr.write(`[flare:prerender] Generated sitemap with ${sitemapResult.urls.length} URL(s)\n`);
			}

			/* 3. Import built server handler (needed for getStaticParams before buildPrerenderRoutes) */
			const serverPath = join(root, "dist/server/server.js");
			if (!existsSync(serverPath)) return;

			/* Cloudflare Workers unenv polyfills access globalThis.Cloudflare at module
			   evaluation time. Shim it so the server module can load in plain Node.js. */
			const g = globalThis as Record<string, unknown>;
			if (!g.Cloudflare || typeof g.Cloudflare !== "object") {
				g.Cloudflare = { compatibilityFlags: {} };
			} else if (!(g.Cloudflare as Record<string, unknown>).compatibilityFlags) {
				(g.Cloudflare as Record<string, unknown>).compatibilityFlags = {};
			}

			const mod = (await import(`${serverPath}?t=${Date.now()}`)) as ServerModule;

			/* 4. Resolve static params for dynamic routes */
			const hasDynamic = defs.some(
				(d) => d.type === "page" && (d.cache.ssg === "dynamic" || d.cache.isr === "dynamic"),
			);
			const resolvedHandler = mod.server ?? mod.handler;
			if (!resolvedHandler) return;
			const staticParams =
				hasDynamic && resolvedHandler.getStaticParams ? await resolvedHandler.getStaticParams() : undefined;

			/* 5. Convert to prerender routes */
			const routes = buildPrerenderRoutes(defs, staticParams);
			if (routes.length === 0) return;

			/* 6. Run prerender engine */
			const origin = prerenderConfig.origin ?? "http://localhost";
			const result = await prerender({
				concurrency: prerenderConfig.concurrency,
				env: prerenderConfig.env,
				exclude: prerenderConfig.exclude,
				handler: resolvedHandler,
				origin,
				routes,
			});

			/* Log errors */
			for (const err of result.errors) {
				process.stderr.write(`[flare:prerender] Error ${err.pathname}: ${err.message}\n`);
			}

			if (result.entries.length === 0) return;

			/* 7. Generate output files + manifest */
			const output = writePrerenderOutput(result.entries);

			/* 8. Write to dist/static/ */
			mkdirSync(staticDir, { recursive: true });

			for (const file of output.files) {
				const filePath = join(staticDir, file.path);
				mkdirSync(dirname(filePath), { recursive: true });
				writeFileSync(filePath, file.content, "utf-8");
			}

			/* 9. Write manifest */
			writeFileSync(join(staticDir, "manifest.json"), JSON.stringify(output.manifest, null, 2), "utf-8");

			process.stderr.write(`[flare:prerender] Pre-rendered ${result.entries.length} route(s)\n`);
		},
		name: "flare:prerender",
	};
}
