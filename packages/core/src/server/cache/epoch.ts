import type { FlareStore, FlareStoreEntry } from "./contract.ts"

// A tag purge writes `epoch:<tag>`, a number. An entry whose render started at or before its tag's epoch is purged:
// a purge in the render's start millisecond may follow its data read. There is no tag index and no key listing
// (dx/store.md).
export function epochKey(tag: string): string {
	return `epoch:${tag}`
}

// A key purge also sets the key's own epoch, so a render that started before the purge and writes after its
// tombstone is still a miss (dx/cache.md). A tag named `key:<key>` shares that epoch, which can only purge more.
export function keyEpochKey(key: string): string {
	return `epoch:key:${key}`
}

export type Lookup = { entry: FlareStoreEntry; purged: boolean }

// One get for the key and one for its own epoch, in parallel, then one per tag of the entry, in parallel.
export async function lookup(store: FlareStore, key: string): Promise<Lookup | null> {
	const [entry, own] = await Promise.all([store.get(key), store.get(keyEpochKey(key))])
	if (entry === null) return null
	const epochs = await Promise.all((entry.tags ?? []).map((tag) => store.get(epochKey(tag))))
	const purged = [own, ...epochs].some((epoch) => typeof epoch?.data === "number" && epoch.data >= entry.storedAt)
	return { entry, purged }
}

// Each epoch key becomes now, and never goes back past a later epoch already there. One get and one set per key.
// A purge never calls `deleteByTags` and never lists keys.
export async function bumpEpochs(store: FlareStore, keys: readonly string[]): Promise<void> {
	const now = Date.now()
	await Promise.all(
		keys.map(async (key) => {
			const previous = await store.get(key)
			const epoch = Math.max(typeof previous?.data === "number" ? previous.data : 0, now)
			await store.set(key, { data: epoch, storedAt: now })
		}),
	)
}
