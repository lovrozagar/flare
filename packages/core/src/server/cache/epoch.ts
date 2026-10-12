import type { FlareStore, FlareStoreEntry } from "./contract.ts";

// A tag purge writes `epoch:<tag>`, a number. An entry stored before its tag's epoch is purged. There is no tag
// index and no key listing (dx/store.md).
export function epochKey(tag: string): string {
	return `epoch:${tag}`;
}

export type Lookup = { entry: FlareStoreEntry; purged: boolean };

// One get for the key, then one per tag of the entry, in parallel.
export async function lookup(store: FlareStore, key: string): Promise<Lookup | null> {
	const entry = await store.get(key);
	if (entry === null) return null;
	const epochs = await Promise.all((entry.tags ?? []).map((tag) => store.get(epochKey(tag))));
	const purged = epochs.some((epoch) => typeof epoch?.data === "number" && epoch.data > entry.storedAt);
	return { entry, purged };
}
