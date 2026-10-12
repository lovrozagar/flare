import type { FlareStore, FlareStoreEntry } from "./contract.ts";

// A tag purge writes `epoch:<tag>`, a number. An entry whose render started at or before its tag's epoch is purged:
// a purge in the render's start millisecond may follow its data read. There is no tag index and no key listing
// (dx/store.md).
export function epochKey(tag: string): string {
	return `epoch:${tag}`;
}

export type Lookup = { entry: FlareStoreEntry; purged: boolean };

// One get for the key, then one per tag of the entry, in parallel.
export async function lookup(store: FlareStore, key: string): Promise<Lookup | null> {
	const entry = await store.get(key);
	if (entry === null) return null;
	const epochs = await Promise.all((entry.tags ?? []).map((tag) => store.get(epochKey(tag))));
	const purged = epochs.some((epoch) => typeof epoch?.data === "number" && epoch.data >= entry.storedAt);
	return { entry, purged };
}

// A tag purge: each `epoch:<tag>` becomes now, and never goes back past a later epoch already there. One get and
// one set per tag. It never calls `deleteByTags` and never lists keys.
export async function bumpEpochs(store: FlareStore, tags: readonly string[]): Promise<void> {
	const now = Date.now();
	await Promise.all(
		tags.map(async (tag) => {
			const previous = await store.get(epochKey(tag));
			const epoch = Math.max(typeof previous?.data === "number" ? previous.data : 0, now);
			await store.set(epochKey(tag), { data: epoch, storedAt: now });
		}),
	);
}
