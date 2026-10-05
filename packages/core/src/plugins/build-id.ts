import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ViteManifest } from "../module-graph/index.ts";

/** Build id outside a production build: dev server, tests, or no client manifest. */
export const DEV_BUILD_ID = "dev";

/** 12-char sha256 of the sorted URL list — same files, same id. */
export function computeBuildId(urls: string[]): string {
	const sorted = [...urls].sort();
	return createHash("sha256").update(sorted.join("\n")).digest("hex").slice(0, 12);
}

/** Every JS and CSS file the client build emitted, as root-relative URLs. */
export function manifestUrls(manifest: ViteManifest): string[] {
	const urls = new Set<string>();
	for (const entry of Object.values(manifest)) {
		if (entry.file) urls.add(`/${entry.file}`);
		for (const css of entry.css ?? []) urls.add(`/${css}`);
	}
	return [...urls];
}

/** Content id of a client build: changes whenever any emitted file changes. */
export function buildIdFromManifest(manifest: ViteManifest): string {
	return computeBuildId(manifestUrls(manifest));
}

/**
 * Read the client entry path from Vite's build manifest.
 * buildApp() builds client before SSR, so manifest.json exists
 * when the SSR build loads this virtual module.
 */
export function readClientManifest(root: string): ViteManifest | undefined {
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

/** Build id of the client build under `root`, or `DEV_BUILD_ID` when there is none. */
export function readClientBuildId(root: string): string {
	const manifest = readClientManifest(root);
	return manifest ? buildIdFromManifest(manifest) : DEV_BUILD_ID;
}
