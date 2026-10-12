// Where prerender writes a seed and createAssetsStore reads it (dx/store.md). The only path formatter.
export const ARTIFACT_BASE = "/assets/_flare-static";

// The SHA-256 hex of the text, through Web Crypto, which every runtime and browser has.
async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// `${base}/${build}/${sha256Hex(tail)}.json`, where `tail` is everything after `static:<build>:`. The hash keeps the
// name to one 64-character segment whatever the route id or a param holds, and keeps two tails that differ only in
// case apart on a case-insensitive file system. A key of another build, or one with no tail, has no path.
export async function artifactPath(key: string, options: { build: string; base?: string }): Promise<string | null> {
	const prefix = `static:${options.build}:`;
	if (!key.startsWith(prefix)) return null;
	const tail = key.slice(prefix.length);
	if (tail === "") return null;
	return `${options.base ?? ARTIFACT_BASE}/${options.build}/${await sha256Hex(tail)}.json`;
}
