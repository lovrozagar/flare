import { createHash } from "node:crypto";
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
