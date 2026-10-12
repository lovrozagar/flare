// One stored value. `storedAt` is milliseconds and the framework sets it (dx/store.md).
export type FlareStoreEntry = { data: unknown; storedAt: number; tags?: readonly string[] };

// What `createServer({ store })` and `createServer({ static })` take. A miss is `null`, not a throw. `ttl` is
// milliseconds. `delete` on a mutable store writes a tombstone. `revalidate` never calls `deleteByTags`.
export type FlareStore = {
	get: (key: string) => Promise<FlareStoreEntry | null>;
	set: (key: string, entry: FlareStoreEntry, ttl?: number) => Promise<void>;
	delete: (key: string) => Promise<void>;
	deleteByTags: (tags: readonly string[]) => Promise<void>;
	deleteByKeys?: (keys: readonly string[]) => Promise<void>;
};
