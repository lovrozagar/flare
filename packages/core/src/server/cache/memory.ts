import type { FlareStore, FlareStoreEntry } from "./contract.ts"
import { tombstone } from "./tombstone.ts"

type Slot = { entry: FlareStoreEntry; expiresAt: number }

// The map lives as long as the store. Build it once, outside a request: a store built per request starts empty
// every time (dx/store.md). `ttl` expires an entry on read.
export function createMemoryStore(): FlareStore {
	const slots = new Map<string, Slot>()
	const write = (key: string, entry: FlareStoreEntry, ttl = Number.POSITIVE_INFINITY): void => {
		slots.set(key, { entry, expiresAt: Date.now() + ttl })
	}
	return {
		get(key) {
			const slot = slots.get(key)
			if (slot !== undefined && slot.expiresAt <= Date.now()) slots.delete(key)
			return Promise.resolve(slots.get(key)?.entry ?? null)
		},
		set(key, entry, ttl) {
			write(key, entry, ttl)
			return Promise.resolve()
		},
		delete(key) {
			write(key, tombstone(Date.now()))
			return Promise.resolve()
		},
		deleteByKeys(keys) {
			for (const key of keys) write(key, tombstone(Date.now()))
			return Promise.resolve()
		},
		// The memory map can see its own tags. `revalidate` still purges through epochs (dx/store.md).
		deleteByTags(tags) {
			for (const [key, slot] of slots) {
				if (slot.entry.tags?.some((tag) => tags.includes(tag)) === true) slots.delete(key)
			}
			return Promise.resolve()
		},
	}
}
