import type { FlareStoreEntry } from "./contract.ts";

// What `delete` writes on a mutable store, so a purge `get` is not null (B86). A build-time seed stays hidden while
// the tombstone is newer than its `renderedAt`.
export function tombstone(storedAt: number): FlareStoreEntry {
	return { data: { tombstone: true }, storedAt };
}

export function isTombstone(entry: FlareStoreEntry | null): boolean {
	const data = entry?.data;
	return typeof data === "object" && data !== null && "tombstone" in data && data.tombstone === true;
}
