import type { CdnPurgeAdapter } from "@lovrozagar/flare/server";
import { createServer } from "@lovrozagar/flare/server";
import type { FlareStore, FlareStoreEntry } from "@lovrozagar/flare/store";
import { router } from "./router";

const kvStore = new Map<string, { entry: FlareStoreEntry; expiresAt?: number }>();

const store: FlareStore = {
	delete(key) {
		kvStore.delete(key);
		return Promise.resolve();
	},
	deleteByTags(tags) {
		for (const [key, item] of kvStore) {
			if (item.entry.tags?.some((tag) => tags.includes(tag))) {
				kvStore.delete(key);
			}
		}
		return Promise.resolve();
	},
	get(key) {
		const item = kvStore.get(key);
		if (!item) return Promise.resolve(null);
		if (item.expiresAt !== undefined && Date.now() > item.expiresAt) {
			kvStore.delete(key);
			return Promise.resolve(null);
		}
		return Promise.resolve(item.entry);
	},
	set(key, entry, ttl) {
		kvStore.set(key, {
			entry,
			expiresAt: ttl !== undefined ? Date.now() + ttl * 1000 : undefined,
		});
		return Promise.resolve();
	},
};

const cdnPurgeAdapter: CdnPurgeAdapter = {
	purgeByKeys() {
		return Promise.resolve();
	},
	purgeByTags() {
		return Promise.resolve();
	},
};

export const handler = createServer(router)
	.cache({
		cdn: cdnPurgeAdapter,
		headers: true,
		store,
	})
	.keepalive({ interval: 60_000 });

export default handler;
