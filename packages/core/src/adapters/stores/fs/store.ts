import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { FlareStore, FlareStoreEntry } from "../../../server/cache/contract.ts"
import { bumpEpochs, epochKey } from "../../../server/cache/epoch.ts"
import { tombstone } from "../../../server/cache/tombstone.ts"

// The record holds its key, so a file that holds another key is a miss.
type Record = { key: string; entry: FlareStoreEntry; expiresAt: number | null }

// One file per key, named by the SHA-256 hex of the key: no key character reaches the file system, a long key keeps
// a 64-character name, and keys that differ only in case stay two files on a case-insensitive one (dx/store.md).
function fileOf(dir: string, key: string): string {
	return join(dir, `${createHash("sha256").update(key).digest("hex")}.json`)
}

// A filesystem store, for Node. `dir` defaults to `.flare/cache` under the process cwd: production passes an
// absolute directory. `delete` writes a tombstone, and a tag delete bumps the tag's epoch, so nothing lists files.
// The cwd is read through `process.cwd()`, which Bun's `path.resolve` does not call (BUGS.md B46).
export function createFilesystemStore(options: { dir?: string } = {}): FlareStore {
	const dir = resolve(process.cwd(), options.dir ?? ".flare/cache")
	const write = async (key: string, entry: FlareStoreEntry, ttl?: number): Promise<void> => {
		const file = fileOf(dir, key)
		await mkdir(dir, { recursive: true })
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

// A missing file is a miss. Any other read failure is the caller's.
function missing(error: unknown): null {
	if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
	throw error
}
