import { ARTIFACT_BASE, artifactPath } from "../../shared/cache/index.ts";
import type { FlareStore } from "./contract.ts";
import { buildId } from "./key.ts";
import { acceptSeed } from "./seed.ts";

// What a read hands back: the file's bytes, a Response from a binding, or nothing for a missing file.
export type AssetRead = (path: string) => Promise<Response | Uint8Array | null | undefined>;

function readOnly(): Promise<never> {
	return Promise.reject(new Error("createAssetsStore is read-only: SSG seeds ship with the build"));
}

// One fixed directory: it starts with `/`, ends without one, and holds no `..`, query, or hash.
function checkBase(base: string): void {
	const fixed = base.startsWith("/") && !base.endsWith("/") && !/[?#]/.test(base);
	if (!fixed || base.split("/").includes("..")) throw new Error(`createAssetsStore: base ${base} is not one directory`);
}

// The read-only store over the SSG seeds prerender wrote into the client output (dx/store.md). `get` reads the one
// artifact path for a key of this build. A missing file, a Response that is not ok, JSON that does not parse, and
// a seed the checker refuses are all a miss, never a 500. A throw from `read` propagates.
export function createAssetsStore(read: AssetRead, options: { base?: string } = {}): FlareStore {
	const base = options.base ?? ARTIFACT_BASE;
	checkBase(base);
	return {
		async get(key) {
			const path = await artifactPath(key, { build: buildId(), base });
			if (path === null) return null;
			const text = await textOf(await read(path));
			if (text === undefined) return null;
			try {
				return acceptSeed(JSON.parse(text), key) ?? null;
			} catch {
				return null;
			}
		},
		set: readOnly,
		delete: readOnly,
		deleteByKeys: readOnly,
		deleteByTags: readOnly,
	};
}

async function textOf(found: Response | Uint8Array | null | undefined): Promise<string | undefined> {
	if (found === null || found === undefined) return undefined;
	if (found instanceof Uint8Array) return new TextDecoder().decode(found);
	if (found.ok) return found.text();
	await found.body?.cancel();
	return undefined;
}
