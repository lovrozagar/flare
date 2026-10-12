// Where prerender writes a seed and createAssetsStore reads it (dx/store.md). The only path formatter.
export const ARTIFACT_BASE = "/assets/_flare-static";

// `${base}/${build}/${encodeURIComponent(tail)}.json`, where `tail` is everything after `static:<build>:`. Encoding
// keeps a route id's `/` inside one segment. A key of another build, or one with no tail, has no path.
export function artifactPath(key: string, options: { build: string; base?: string }): string | null {
	const prefix = `static:${options.build}:`;
	if (!key.startsWith(prefix)) return null;
	const tail = key.slice(prefix.length);
	if (tail === "") return null;
	return `${options.base ?? ARTIFACT_BASE}/${options.build}/${encodeURIComponent(tail)}.json`;
}
