import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FlareStore, FlareStoreEntry } from "../../../server/cache/contract.ts";
import { bumpEpochs, epochKey } from "../../../server/cache/epoch.ts";
import { tombstone } from "../../../server/cache/tombstone.ts";

// The longest file name most filesystems take, in bytes.
const NAME_LIMIT = 255;

type Record = { entry: FlareStoreEntry; expiresAt: number | null };

// One file per key. The name is the key percent-encoded, so `a/b` and `a_b` stay two files, and a key it would
// have to shorten throws instead (dx/store.md).
function fileOf(dir: string, key: string): string {
	if (key.includes("\\")) throw new Error(`createFilesystemStore: a key holds a backslash: ${key}`);
	const name = `${encodeURIComponent(key)}.json`;
	if (new TextEncoder().encode(name).length > NAME_LIMIT)
		throw new Error(`createFilesystemStore: key too long: ${key}`);
	return join(dir, name);
}

// A filesystem store, for Node. `dir` defaults to `.flare/cache` under the process cwd: production passes an
// absolute directory. `delete` writes a tombstone, and a tag delete bumps the tag's epoch, so nothing lists files.
export function createFilesystemStore(options: { dir?: string } = {}): FlareStore {
	const dir = resolve(options.dir ?? ".flare/cache");
	const write = async (key: string, entry: FlareStoreEntry, ttl?: number): Promise<void> => {
		const file = fileOf(dir, key);
		await mkdir(dir, { recursive: true });
		const record: Record = { entry, expiresAt: ttl === undefined ? null : Date.now() + ttl };
		// A reader never sees half a file: the write lands under another name, then takes this one.
		const pending = `${file}.${crypto.randomUUID()}.tmp`;
		await writeFile(pending, JSON.stringify(record));
		await rename(pending, file);
	};
	const store: FlareStore = {
		async get(key) {
			const text = await readFile(fileOf(dir, key), "utf8").catch((error: unknown) => missing(error));
			if (text === null) return null;
			const record: Record = JSON.parse(text);
			return record.expiresAt !== null && record.expiresAt <= Date.now() ? null : record.entry;
		},
		set: write,
		delete: (key) => write(key, tombstone(Date.now())),
		deleteByKeys: async (keys) => {
			await Promise.all(keys.map((key) => write(key, tombstone(Date.now()))));
		},
		deleteByTags: (tags) => bumpEpochs(store, tags.map(epochKey)),
	};
	return store;
}

// A missing file is a miss. Any other read failure is the caller's.
function missing(error: unknown): null {
	if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
	throw error;
}
