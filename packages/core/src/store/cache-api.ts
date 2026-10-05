/**
 * FlareStore on the standard Web Cache API (`caches.open`), available in Cloudflare Workers,
 * Deno and browsers. No platform SDK.
 *
 * On Cloudflare the Cache API is local to each data center: every location fills its own copy,
 * and `delete`/`deleteByTags` (revalidation) only clear the location that handles the call.
 * Deploys are still safe everywhere because keys carry the build id; for global on-demand
 * purges use a globally replicated store instead.
 *
 * Tags are indexed as one cached key list per tag. Updates to a tag's list are serialized within
 * an isolate (the common race: a layout and its page written together); isolates do not
 * coordinate, so a concurrent write elsewhere can still drop a key from the list.
 */
import type { FlareStore, FlareStoreEntry } from "./index.ts";

export interface CacheApiStoreOptions {
	/** Cache name passed to `caches.open`. Default `"flare"`. */
	cacheName?: string;
	/** CacheStorage to use. Default: the global `caches`. */
	caches?: CacheStorage;
}

interface Stored {
	entry: FlareStoreEntry;
	expiresAt?: number;
}

/* Long enough to mean "until evicted or replaced" for entries without a ttl. */
const NO_TTL_MAX_AGE = 31_536_000;
const ORIGIN = "https://flare.store/";

/* Per CacheStorage: one promise chain per "<cache>\0<tag>" so read-modify-write never interleaves. */
const tagLocks = new WeakMap<object, Map<string, Promise<void>>>();

function withTagLock(storage: object, id: string, run: () => Promise<void>): Promise<void> {
	let locks = tagLocks.get(storage);
	if (!locks) tagLocks.set(storage, (locks = new Map()));
	const queue = locks;
	const next = (queue.get(id) ?? Promise.resolve()).then(run, run);
	const settled = next.catch(() => {});
	queue.set(id, settled);
	void settled.then(() => {
		if (queue.get(id) === settled) queue.delete(id);
	});
	return next;
}

function entryUrl(key: string): string {
	return `${ORIGIN}entry/${encodeURIComponent(key)}`;
}

function tagUrl(tag: string): string {
	return `${ORIGIN}tag/${encodeURIComponent(tag)}`;
}

export function createCacheApiStore(options: CacheApiStoreOptions = {}): FlareStore {
	const name = options.cacheName ?? "flare";
	let opened: Promise<Cache> | undefined;
	const storage = (): CacheStorage => options.caches ?? caches;
	const open = (): Promise<Cache> => {
		opened ??= storage().open(name);
		return opened;
	};
	const lockTag = (tag: string, run: () => Promise<void>) => withTagLock(storage(), `${name}\0${tag}`, run);

	async function readJson<T>(url: string): Promise<T | undefined> {
		const res = await (await open()).match(url);
		return res ? ((await res.json()) as T) : undefined;
	}

	async function writeJson(url: string, value: unknown, maxAge: number): Promise<void> {
		const response = new Response(JSON.stringify(value), {
			headers: { "Cache-Control": `max-age=${maxAge}`, "Content-Type": "application/json" },
		});
		await (await open()).put(url, response);
	}

	async function deleteKey(key: string): Promise<void> {
		await (await open()).delete(entryUrl(key));
	}

	return {
		delete: deleteKey,
		async deleteByKeys(keys) {
			await Promise.all(keys.map(deleteKey));
		},
		async deleteByTags(tags) {
			const cache = await open();
			await Promise.all(
				tags.map((tag) =>
					lockTag(tag, async () => {
						const keys = (await readJson<string[]>(tagUrl(tag))) ?? [];
						await Promise.all(keys.map(deleteKey));
						await cache.delete(tagUrl(tag));
					}),
				),
			);
		},
		async get(key) {
			const stored = await readJson<Stored>(entryUrl(key));
			if (!stored) return null;
			if (stored.expiresAt !== undefined && Date.now() > stored.expiresAt) {
				await deleteKey(key);
				return null;
			}
			return stored.entry;
		},
		async set(key, entry, ttl) {
			const maxAge = ttl ?? NO_TTL_MAX_AGE;
			const stored: Stored = { entry, expiresAt: ttl !== undefined ? Date.now() + ttl * 1000 : undefined };
			await writeJson(entryUrl(key), stored, maxAge);
			await Promise.all(
				(entry.tags ?? []).map((tag) =>
					lockTag(tag, async () => {
						const keys = new Set((await readJson<string[]>(tagUrl(tag))) ?? []);
						keys.add(key);
						await writeJson(tagUrl(tag), [...keys], NO_TTL_MAX_AGE);
					}),
				),
			);
		},
	};
}
