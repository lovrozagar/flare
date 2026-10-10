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

/**
 * ISR/SSG entry key: `static:<buildId>:<pathname>`. Markup from one build references that
 * build's hashed assets, so an entry is only ever read by the build that wrote it; old builds'
 * entries are never matched again and age out.
 */
export function staticStoreKey(buildId: string, pathname: string): string {
	return `static:${buildId}:${pathname}`;
}

/** Map a user-facing `static:/path` key to this build's key; scoped or other keys pass through. */
export function scopeStaticKey(key: string, buildId: string): string {
	return key.startsWith("static:/") ? staticStoreKey(buildId, key.slice("static:".length)) : key;
}
