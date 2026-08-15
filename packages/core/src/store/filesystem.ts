import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FlareStore, FlareStoreEntry } from "./index.ts";

interface StoredEntry extends FlareStoreEntry {
	expiresAt?: number;
}

/**
 * Encode a store key to a flat filename.
 * `static:/about` → `static/_about.json`
 * `flare:_root_/[id]:{"id":"42"}` → `loader/_root___[id]__{"id":"42"}.json`
 */
export function keyToPath(key: string): string {
	let subdir: string;
	let rest: string;

	if (key.startsWith("static:")) {
		subdir = "static";
		rest = key.slice(7);
	} else if (key.startsWith("cdn:")) {
		subdir = "cdn";
		rest = key.slice(4);
	} else if (key.startsWith("flare:")) {
		subdir = "loader";
		rest = key.slice(6);
	} else {
		subdir = "other";
		rest = key;
	}

	/* flatten slashes and colons to underscores to keep files flat */
	const encoded = rest.replace(/\//g, "_").replace(/:/g, "__");
	return `${subdir}/${encoded}.json`;
}

export function createFileSystemStore(config?: { cacheDir?: string }): FlareStore {
	const baseDir = config?.cacheDir ?? ".flare/cache";

	function fullPath(key: string): string {
		return join(baseDir, keyToPath(key));
	}

	function ensureDir(filePath: string): void {
		const dir = dirname(filePath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
	}

	function readEntry(filePath: string): StoredEntry | null {
		try {
			const raw = readFileSync(filePath, "utf-8");
			return JSON.parse(raw) as StoredEntry;
		} catch {
			return null;
		}
	}

	function removeFile(fp: string): void {
		try {
			rmSync(fp);
		} catch {
			/* file may not exist */
		}
	}

	return {
		delete(key: string): Promise<void> {
			removeFile(fullPath(key));
			return Promise.resolve();
		},

		deleteByKeys(keys: string[]): Promise<void> {
			for (const key of keys) {
				removeFile(fullPath(key));
			}
			return Promise.resolve();
		},

		deleteByTags(tags: string[]): Promise<void> {
			const tagSet = new Set(tags);
			const subdirs = ["static", "loader", "cdn", "other"];
			for (const sub of subdirs) {
				const dir = join(baseDir, sub);
				if (!existsSync(dir)) continue;

				const files = readdirSync(dir);
				for (const file of files) {
					if (!file.endsWith(".json")) continue;
					const entry = readEntry(join(dir, file));
					if (entry?.tags?.some((t) => tagSet.has(t))) {
						removeFile(join(dir, file));
					}
				}
			}
			return Promise.resolve();
		},

		get(key: string): Promise<FlareStoreEntry | null> {
			const fp = fullPath(key);
			const stored = readEntry(fp);
			if (!stored) return Promise.resolve(null);

			if (stored.expiresAt !== undefined && Date.now() >= stored.expiresAt) {
				removeFile(fp);
				return Promise.resolve(null);
			}

			const result: FlareStoreEntry = {
				data: stored.data,
				storedAt: stored.storedAt,
			};
			if (stored.tags) result.tags = stored.tags;
			return Promise.resolve(result);
		},

		set(key: string, entry: FlareStoreEntry, ttl?: number): Promise<void> {
			const fp = fullPath(key);
			ensureDir(fp);

			const stored: StoredEntry = { ...entry };
			if (ttl !== undefined) {
				stored.expiresAt = Date.now() + ttl * 1000;
			}

			writeFileSync(fp, JSON.stringify(stored));
			return Promise.resolve();
		},
	};
}
