import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { FlareStore, FlareStoreEntry } from "../../../server/cache/contract.ts"
import { bumpEpochs, epochKey } from "../../../server/cache/epoch.ts"
import { tombstone } from "../../../server/cache/tombstone.ts"

// The record holds its key, so a file that holds another key is a miss.
type Record = { key: string; entry: FlareStoreEntry; expiresAt: number | null }

// One file per key, named by the SHA-256 hex of the key: no key character reaches the file system, a long key keeps
// a 64-character name, and keys that differ only in case stay two files on a case-insensitive one (dx/store.md). An
// epoch record's name starts `epoch-`, so a pass knows it without reading it (B147).
function fileOf(dir: string, key: string): string {
	const hash = createHash("sha256").update(key).digest("hex")
	return join(dir, key.startsWith("epoch:") ? `epoch-${hash}.json` : `${hash}.json`)
}

// How many files each write reads for an expired record. A pass over the directory takes about as many writes as it
// holds files, and lists it once, so a record nothing reads again is removed within two passes (BUGS.md 380).
const SWEEP = 2

// The default bound on the directory's records (B147).
const MAX_BYTES = 1024 * 1024 * 1024

// A filesystem store, for Node. `dir` defaults to `.flare/cache` under the process cwd: production passes an
// absolute directory. `delete` writes a tombstone, and a tag delete bumps the tag's epoch. The cwd is read through
// `process.cwd()`, which Bun's `path.resolve` does not call (BUGS.md B46). Each pass of the sweep lists the directory
// once; past `maxBytes` it removes the oldest-written records first, never an epoch (B147).
export function createFilesystemStore(options: { dir?: string; maxBytes?: number } = {}): FlareStore {
	const dir = resolve(process.cwd(), options.dir ?? ".flare/cache")
	const maxBytes = options.maxBytes ?? MAX_BYTES
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
		throw new Error(`createFilesystemStore: maxBytes must be a positive whole number of bytes, not ${String(maxBytes)}`)
	}
	let queue: string[] = []
	// A few files of the current pass. A file that fails to read or parse is never the write's failure: the next pass
	// reads it again.
	const sweep = async (now: number): Promise<void> => {
		if (queue.length === 0) queue = await bounded(dir, maxBytes)
		for (const name of queue.splice(0, SWEEP)) await expire(join(dir, name), now).catch(() => undefined)
	}
	const write = async (key: string, entry: FlareStoreEntry, ttl?: number): Promise<void> => {
		const file = fileOf(dir, key)
		await mkdir(dir, { recursive: true })
		await sweep(Date.now())
		const record: Record = { key, entry, expiresAt: ttl === undefined ? null : Date.now() + ttl }
		// A reader never sees half a file: the write lands under another name, then takes this one.
		const pending = `${file}.${crypto.randomUUID()}.tmp`
		await writeFile(pending, JSON.stringify(record))
		await rename(pending, file)
	}
	const store: FlareStore = {
		async get(key) {
			const text = await readFile(fileOf(dir, key), "utf8").catch((error: unknown) => missing(error))
			if (text === null) return null
			const record: Record = JSON.parse(text)
			if (record.key !== key) return null
			return record.expiresAt !== null && record.expiresAt <= Date.now() ? null : record.entry
		},
		set: write,
		delete: (key) => write(key, tombstone(Date.now())),
		deleteByKeys: async (keys) => {
			await Promise.all(keys.map((key) => write(key, tombstone(Date.now()))))
		},
		deleteByTags: (tags) => bumpEpochs(store, tags.map(epochKey)),
	}
	return store
}

// A pass's start: the directory's records, after the oldest-written are removed until the rest fit `maxBytes`. An
// epoch is outside the bound: there is one per tag or key something revalidated, so epochs grow with purges, not with
// requests. A file gone before its stat is skipped. The removed ones leave the pass.
async function bounded(dir: string, maxBytes: number): Promise<string[]> {
	const names = (await readdir(dir)).filter((name) => name.endsWith(".json"))
	const sized = await Promise.all(
		names
			.filter((name) => !name.startsWith("epoch-"))
			.map(async (name) => {
				const stats = await stat(join(dir, name)).catch(() => undefined)
				return stats === undefined ? [] : [{ name, size: stats.size, written: stats.mtimeMs }]
			}),
	)
	const counted = sized.flat().toSorted((a, b) => a.written - b.written)
	let bytes = counted.reduce((total, file) => total + file.size, 0)
	const removed = new Set<string>()
	for (const file of counted) {
		if (bytes <= maxBytes) break
		await rm(join(dir, file.name), { force: true })
		bytes -= file.size
		removed.add(file.name)
	}
	return names.filter((name) => !removed.has(name))
}

// Removes the file when its record has expired. A write that lands between the read and the removal is lost, which
// is a miss of that key and nothing more: a file only ever holds its own key's record.
async function expire(file: string, now: number): Promise<void> {
	const record: Record = JSON.parse(await readFile(file, "utf8"))
	if (record.expiresAt !== null && record.expiresAt <= now) await rm(file, { force: true })
}

// A missing file is a miss. Any other read failure is the caller's.
function missing(error: unknown): null {
	if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
	throw error
}
