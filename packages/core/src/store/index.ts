/**
 * Unified store — platform-agnostic KV interface for both
 * loader-data cache and ISR/static page artifacts.
 *
 * Key prefixes (`static:`, `flare:`) namespace entry types internally;
 * users configure a single store adapter.
 */

export interface FlareStoreEntry {
	data: unknown;
	storedAt: number;
	tags?: string[];
}

export interface FlareStore {
	delete(key: string): Promise<void>;
	deleteByKeys?(keys: string[], callerData?: unknown): Promise<void>;
	deleteByTags(tags: string[], callerData?: unknown): Promise<void>;
	get(key: string): Promise<FlareStoreEntry | null>;
	set(key: string, entry: FlareStoreEntry, ttl?: number): Promise<void>;
}

/** Internal shape for ISR/static entries stored as `FlareStoreEntry.data` */
export interface StaticEntryData {
	etag?: string;
	headers: Record<string, string>;
	html: string;
	ndjson: string;
}
