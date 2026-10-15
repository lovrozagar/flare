import type { FlareStore, FlareStoreEntry } from "../../../server/cache/contract.ts"
import { bumpEpochs, epochKey } from "../../../server/cache/epoch.ts"
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
			const found = await (await opened()).match(urlOf(key))
			if (found === undefined) return null
			const entry: FlareStoreEntry = await found.json()
			return entry
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
