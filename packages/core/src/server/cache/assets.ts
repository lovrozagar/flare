import { ARTIFACT_BASE, artifactPath } from "../../shared/cache/index.ts"
import { defined } from "../../shared/errors/index.ts"
import type { FlareStoreEntry, FlareStore } from "./contract.ts"
import { buildId } from "./key.ts"
import { acceptSeed } from "./seed.ts"

// What a read hands back: the file's bytes, a Response from a binding, or nothing for a missing file.
export type AssetRead = (path: string) => Promise<Response | Uint8Array | null | undefined>

// The seeds a store keeps parsed: a page's few kilobytes each, so a few megabytes at most.
const KEPT = 512

function readOnly(): Promise<never> {
	return Promise.reject(new Error("createAssetsStore is read-only: SSG seeds ship with the build"))
}

// One fixed directory, as the URL path a read uses: it starts with `/`, ends without one, and holds no query, hash, `//`,
// or backslash. A space or a character outside ASCII is written percent-encoded, as a URL writes it, and a `%HH`
// already there stays; a URL must then read the base back as written, so no `..` or `.` in any spelling moves a read
// out of it or to another host (BUGS.md 403).
function baseOf(base: string): string {
	const fixed = base.startsWith("/") && !base.endsWith("/") && !/[?#\\]|\/\//.test(base)
	const written = fixed ? encodedPath(base) : undefined
	if (written === undefined || new URL(`${written}/x`, "http://assets").pathname !== `${written}/x`) {
		throw new Error(`createAssetsStore: base ${base} is not one directory`)
	}
	return written
}

// The path with every character a URL path would encode written as `%HH`, `%` itself kept; undefined for a lone
// surrogate, which no URL can carry.
function encodedPath(path: string): string | undefined {
	try {
		return path.replaceAll(/[^\w\-.~!$&'()*+,;=:@/%]/gu, (char) => encodeURIComponent(char))
	} catch {
		return undefined
	}
}

// The read-only store over the SSG seeds prerender wrote into the client output (dx/store.md). `get` reads the one
// artifact path for a key of this build. A missing file, a Response that is not ok, JSON that does not parse, and
// a seed the checker refuses are all a miss, never a 500. A throw from `read` propagates.
export function createAssetsStore(read: AssetRead, options: { base?: string } = {}): FlareStore {
	const base = baseOf(options.base ?? ARTIFACT_BASE)
	const kept = new Map<string, Promise<FlareStoreEntry | null>>()
	const load = async (key: string): Promise<FlareStoreEntry | null> => {
		const path = await artifactPath(key, { build: buildId(), base })
		if (path === null) return null
		const text = await textOf(await read(path))
		if (text === undefined) return null
		try {
			return acceptSeed(JSON.parse(text), key) ?? null
		} catch {
			return null
		}
	}
	return {
		// A seed ships with the deploy and never changes, so each key's read, hit or miss, is kept: a hit reads no file
		// and parses nothing (plan 21 15.2). The latest KEPT keys stay, the least recently read go first, and a read that
		// throws is not kept.
		get(key) {
			const known = kept.get(key)
			if (known !== undefined) {
				kept.delete(key)
				kept.set(key, known)
				return known
			}
			const loading = load(key)
			kept.set(key, loading)
			loading.catch(() => kept.delete(key))
			if (kept.size > KEPT) kept.delete(defined(kept.keys().next().value, "the oldest kept seed"))
			return loading
		},
		set: readOnly,
		delete: readOnly,
		deleteByKeys: readOnly,
		deleteByTags: readOnly,
	}
}

async function textOf(found: Response | Uint8Array | null | undefined): Promise<string | undefined> {
	if (found === null || found === undefined) return undefined
	if (found instanceof Uint8Array) return new TextDecoder().decode(found)
	if (found.ok) return found.text()
	await found.body?.cancel()
	return undefined
}
