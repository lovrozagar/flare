import type { FlareStore, FlareStoreEntry } from "../../../server/cache/contract.ts"
import { bumpEpochs, damagedEpoch, epochKey, reportDamaged } from "../../../server/cache/epoch.ts"
import { tombstone } from "../../../server/cache/tombstone.ts"

// The origin every key's cache URL sits under. It is never fetched.
const ORIGIN = "https://flare.cache/"

// How long a record with no ttl, a tombstone or an epoch, is kept: a year.
const KEEP = 365 * 24 * 60 * 60

const urlOf = (key: string): string => `${ORIGIN}${encodeURIComponent(key)}`

// A store over the Cache API. Each key is one cached Response, and a ttl is its `max-age`. Tombstones and epochs
// live in the same cache, and nothing lists its entries. On Cloudflare a cache is local to one data center, so a
// purge that must reach every location needs a store that replicates (dx/store.md).
export function createCacheApiStore(options: { cacheName?: string; caches?: CacheStorage } = {}): FlareStore {
	const name = options.cacheName ?? "flare"
	const opened = (): Promise<Cache> => (options.caches ?? caches).open(name)
	const write = async (key: string, entry: FlareStoreEntry, ttl?: number): Promise<void> => {
		const seconds = ttl === undefined ? KEEP : Math.max(1, Math.ceil(ttl / 1000))
		const headers = { "content-type": "application/json", "cache-control": `max-age=${seconds}` }
		await (await opened()).put(urlOf(key), new Response(JSON.stringify(entry), { headers }))
	}
	const store: FlareStore = {
		async get(key) {
			const cache = await opened()
			const found = await cache.match(urlOf(key))
			if (found === undefined) return null
			return (await entryOf(found, key)) ?? damaged(cache, key, write)
		},
		set: write,
		delete: (key) => write(key, tombstone(Date.now())),
		deleteByKeys: async (list) => {
			await Promise.all(list.map((key) => write(key, tombstone(Date.now()))))
		},
		deleteByTags: (tags) => bumpEpochs(store, tags.map(epochKey)),
	}
	return store
}

// A cached body that is no entry, JSON that does not parse or is not an object, or an epoch with no finite number
// (BUGS.md 394).
async function entryOf(found: Response, key: string): Promise<FlareStoreEntry | undefined> {
	const entry: unknown = await found.json().catch(() => undefined)
	if (typeof entry !== "object" || entry === null) return undefined
	const counted = !key.startsWith("epoch:") || Number.isFinite(Reflect.get(entry, "data"))
	return counted ? (entry as FlareStoreEntry) : undefined
}

// A damaged page entry is removed and read as a miss. A damaged epoch is replaced by a purge now, unless a purge
// wrote a good one meanwhile, which stands (BUGS.md 394).
async function damaged(
	cache: Cache,
	key: string,
	write: (key: string, entry: FlareStoreEntry) => Promise<void>,
): Promise<FlareStoreEntry | null> {
	reportDamaged(key)
	if (!key.startsWith("epoch:")) {
		await cache.delete(urlOf(key))
		return null
	}
	const entry = damagedEpoch(Date.now())
	const again = await cache.match(urlOf(key))
	const meanwhile = again === undefined ? undefined : await entryOf(again, key)
	if (meanwhile !== undefined) return meanwhile
	await write(key, entry)
	return entry
}
