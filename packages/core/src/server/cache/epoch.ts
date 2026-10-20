import { createLogger } from "../lifecycle/logger.ts"
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

// One get for the key and one for its own epoch, in parallel, then one per tag of the entry, in parallel. A record
// whose envelope the store was never given, a `storedAt` that is no number or `tags` that are no list of strings, is
// reported and read as a miss, so the render writes a good record over it (plan 21 3.3).
export async function lookup(
	store: FlareStore,
	key: string,
	report: (message: string) => void = () => undefined,
): Promise<Lookup | null> {
	const [entry, own] = await Promise.all([store.get(key), store.get(keyEpochKey(key))])
	if (entry === null) return null
	if (!isEnvelope(entry)) {
		report(`the store holds a corrupt record for ${key}: rendered again`)
		return null
	}
	const epochs = await Promise.all((entry.tags ?? []).map((tag) => store.get(epochKey(tag))))
	const purged = [own, ...epochs].some((epoch) => typeof epoch?.data === "number" && epoch.data >= entry.storedAt)
	return { entry, purged }
}

function isEnvelope(entry: unknown): entry is FlareStoreEntry {
	if (typeof entry !== "object" || entry === null) return false
	const tags: unknown = Reflect.get(entry, "tags")
	const listed = tags === undefined || (Array.isArray(tags) && tags.every((tag) => typeof tag === "string"))
	return Number.isFinite(Reflect.get(entry, "storedAt")) && listed
}

// How long a stored page waits for its store read (plan 21 3.3).
const READ_MS = 2000

// Where a guarded read reports, and what it marks when it fails.
export type ReadGuard = { report: (message: string) => void; unread: { failed: boolean } }

// The read a stored page makes of its mutable store.
export function readStored(store: FlareStore, key: string, at: ReadGuard): Promise<Lookup | null> {
	return guardedRead(() => lookup(store, key, at.report), key, at)
}

// A stored page's read of a store, mutable or static (BUGS.md 391). One that throws, or does not answer within
// READ_MS, is reported, marks `unread`, and reads as nothing, so the caller can render live: a failing or hung store
// is never a 500 or a hung request.
export async function guardedRead<T>(read: () => Promise<T>, key: string, at: ReadGuard): Promise<T | null> {
	const late = Promise.withResolvers<"late">()
	const timer = setTimeout(() => late.resolve("late"), READ_MS)
	try {
		const answered = await Promise.race([read(), late.promise])
		if (answered !== "late") return answered
		at.report(`the store did not answer for ${key} within 2 s: served live`)
	} catch (error) {
		at.report(`the store read for ${key} failed: served live: ${String(error)}`)
	} finally {
		clearTimeout(timer)
	}
	at.unread.failed = true
	return null
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

// A record a built-in store holds but cannot read, bytes that do not parse or a shape it never wrote (BUGS.md 394). A
// page's is a miss, so the next render writes a good one. An epoch's reads as a purge now: reading it as absent would
// bring back every page that purge hid, and now is never earlier than the purge it stood for.
export function damagedEpoch(now: number): FlareStoreEntry {
	return { data: now, storedAt: now }
}

// How many damaged keys a process remembers having logged: a flood of them never grows memory (B147).
const DAMAGED_LOGGED = 1024

// per-process-constant: the damaged keys this process has logged
const damagedLogged = new Set<string>()

// One error line per damaged key, until the set is full; then it starts again.
export function reportDamaged(key: string): void {
	if (damagedLogged.has(key)) return
	if (damagedLogged.size >= DAMAGED_LOGGED) damagedLogged.clear()
	damagedLogged.add(key)
	const read = key.startsWith("epoch:") ? "read as a purge now" : "read as a miss"
	createLogger({ dev: false }).error("cache", `the store held a damaged record for ${key}: ${read}`)
}
