/**
 * Build time: the list behind `modules: "all"` — every page and layout chunk with its static
 * imports and CSS, minus what the entry already loads. Lazy components inside routes stay out
 * (they load when rendered). Written content-hashed into the client output.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scanSourceFiles } from "../generators/index.ts";
import { findEntryKey, resolveModulePreloads, type ViteManifest } from "../module-graph/index.ts";
import { findClientDir, readClientManifest } from "../plugins/build-id.ts";

export interface PrefetchList {
	css: string[];
	js: string[];
}

export function buildPrefetchList(manifest: ViteManifest, routeFiles: string[]): PrefetchList {
	const entryKey = findEntryKey(manifest);
	const loaded = entryKey ? resolveModulePreloads(manifest, entryKey) : { css: [], js: [] };
	const skipJs = new Set(loaded.js);
	const skipCss = new Set(loaded.css);
	const js = new Set<string>();
	const css = new Set<string>();
	for (const file of routeFiles) {
		if (!manifest[file]) continue;
		const preloads = resolveModulePreloads(manifest, file);
		for (const f of preloads.js) if (!skipJs.has(f)) js.add(f);
		for (const f of preloads.css) if (!skipCss.has(f)) css.add(f);
	}
	return { css: [...css].sort(), js: [...js].sort() };
}

/** Write `<assetsBase>/_flare-prefetch.<hash>.json` into the client output; returns its URL. */
export function writePrefetchList(options: {
	assetsBase: string;
	ignorePrefix: string;
	root: string;
}): string | undefined {
	const manifest = readClientManifest(options.root);
	const clientDir = findClientDir(options.root);
	if (!manifest || !clientDir) return undefined;
	const routeFiles = scanSourceFiles({ ignorePrefix: options.ignorePrefix, rootDir: options.root })
		.filter((d) => (d.type === "page" || d.type === "layout" || d.type === "root-layout") && !d.responseRoute)
		.map((d) => d.filePath);
	const body = JSON.stringify(buildPrefetchList(manifest, [...new Set(routeFiles)]));
	const hash = createHash("sha256").update(body).digest("hex").slice(0, 8);
	const url = `${options.assetsBase}/_flare-prefetch.${hash}.json`;
	const file = join(clientDir, url);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, body, "utf-8");
	return url;
}
