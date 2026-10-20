import type { FlareStore, FlareStoreEntry } from "./contract.ts"
import { tombstone } from "./tombstone.ts"

// `bytes` is the UTF-8 length of the entry's JSON; an epoch's is 0, outside the bound (B147).
type Slot = { entry: FlareStoreEntry; expiresAt: number; bytes: number }

// How many slots each write looks at for an expired entry. A pass over the map takes about as many writes as the map
// holds slots, so an entry nothing reads again is dropped within two passes (BUGS.md 380).
const SWEEP = 2

// The default bound: Next.js's in-memory incremental cache default (B147).
const MAX_BYTES = 50 * 1024 * 1024

// A string's UTF-8 byte length without encoding it: what TextEncoder writes, a lone surrogate as U+FFFD's 3 bytes.
export function utf8Length(text: string): number {
	let bytes = 0
	for (let index = 0; index < text.length; index++) {
		const unit = text.charCodeAt(index)
		if (unit < 0x80) bytes += 1
		else if (unit < 0x800) bytes += 2
		else if (unit >= 0xd800 && unit < 0xdc00 && (text.charCodeAt(index + 1) & 0xfc00) === 0xdc00) {
			bytes += 4
			index += 1
		} else bytes += 3
	}
	return bytes
}

// An epoch record is never evicted and never counted: evicting one would let an entry it purged read as fresh. There
// is one per tag or key something revalidated, so they grow only with purges, not with requests (B147).
function isEpoch(key: string): boolean {
	return key.startsWith("epoch:")
}

// The map lives as long as the store. Build it once, outside a request: a store built per request starts empty
// every time (dx/store.md). `ttl` expires an entry on read, and the sweep each write runs drops the ones no read
// reaches. The map is an LRU bounded by `maxBytes` (B147, BUGS.md 380).
export function createMemoryStore(options: { maxBytes?: number } = {}): FlareStore {
	const maxBytes = options.maxBytes ?? MAX_BYTES
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
		throw new Error(`createMemoryStore: maxBytes must be a positive whole number of bytes, not ${String(maxBytes)}`)
	}
	const slots = lruSlots(maxBytes)
	return {
		get: (key) => Promise.resolve(slots.read(key)),
		set(key, entry, ttl) {
			slots.write(key, entry, ttl)
			return Promise.resolve()
		},
		delete(key) {
			slots.write(key, tombstone(Date.now()))
			return Promise.resolve()
		},
		deleteByKeys(keys) {
			for (const key of keys) slots.write(key, tombstone(Date.now()))
			return Promise.resolve()
		},
		// The memory map can see its own tags. `revalidate` still purges through epochs (dx/store.md).
		deleteByTags(tags) {
			slots.dropTagged(tags)
			return Promise.resolve()
		},
	}
}

// The slots in order of last use. A read makes an entry the most recent, a write past the bound evicts the least
// recent, and an entry larger than the bound is not stored.
function lruSlots(maxBytes: number) {
	const slots = new Map<string, Slot>()
	let bytes = 0
	let cursor = slots.entries()
	const drop = (key: string): void => {
		bytes -= slots.get(key)?.bytes ?? 0
		slots.delete(key)
	}
	const sweep = (now: number): void => {
		for (let step = 0; step < SWEEP; step++) {
			const next = cursor.next()
			// A finished iterator stays finished, even after a set: the next pass starts a new one.
			if (next.done === true) return void (cursor = slots.entries())
			const [key, slot] = next.value
			if (slot.expiresAt <= now) drop(key)
		}
	}
	const evict = (): void => {
		for (const key of slots.keys()) {
			if (bytes <= maxBytes) return
			if (!isEpoch(key)) drop(key)
		}
	}
	return {
		read(key: string): FlareStoreEntry | null {
			const slot = slots.get(key)
			if (slot === undefined) return null
			drop(key)
			if (slot.expiresAt <= Date.now()) return null
			slots.set(key, slot)
			bytes += slot.bytes
			return slot.entry
		},
		write(key: string, entry: FlareStoreEntry, ttl = Number.POSITIVE_INFINITY): void {
			const now = Date.now()
			sweep(now)
			drop(key)
			const size = isEpoch(key) ? 0 : utf8Length(JSON.stringify(entry))
			if (size > maxBytes) return
			slots.set(key, { entry, expiresAt: now + ttl, bytes: size })
			bytes += size
			evict()
		},
		dropTagged(tags: readonly string[]): void {
			for (const [key, slot] of slots) if (slot.entry.tags?.some((tag) => tags.includes(tag)) === true) drop(key)
		},
	}
}
