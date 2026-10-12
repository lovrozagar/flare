import type { CacheConfig, ParamsFn } from "../../shared/route-builder/chain.ts";
import type { FlareStore, FlareStoreEntry } from "./contract.ts";
import { keyEpochKey, epochKey, type Lookup } from "./epoch.ts";

// A seed file, `{ seed: true, key, renderedAt, tags, data }`, as the entry it stands for: `storedAt` is
// `renderedAt`. A seed with no flag, no numeric `renderedAt`, no `tags` list, or a key other than the one asked
// for is refused. `tags: []` is a seed with no tags.
export function acceptSeed(json: unknown, key: string): FlareStoreEntry | undefined {
	if (typeof json !== "object" || json === null || Reflect.get(json, "key") !== key) return undefined;
	const flag: unknown = Reflect.get(json, "seed");
	const renderedAt: unknown = Reflect.get(json, "renderedAt");
	const tags: unknown = Reflect.get(json, "tags");
	if (flag !== true || typeof renderedAt !== "number" || !Array.isArray(tags)) return undefined;
	if (!tags.every((tag: unknown) => typeof tag === "string")) return undefined;
	return { data: Reflect.get(json, "data"), tags: tags.map(String), storedAt: renderedAt };
}

// The slugs a page lists: `ssg`'s params function in either form, and `isr`'s when `dynamicParams` is false.
function paramsOf(cache: CacheConfig | undefined): ParamsFn | undefined {
	const ssg = cache?.ssg;
	if (typeof ssg === "function") return ssg;
	if (typeof ssg === "object" && "params" in ssg) return ssg.params;
	const isr = cache?.isr;
	return typeof isr === "object" && isr.dynamicParams === false ? isr.params : undefined;
}

function same(left: string | string[] | undefined, right: string | string[]): boolean {
	return [left ?? []].flat().join("/") === [right].flat().join("/");
}

// Whether this URL's params are a slug the page lists, checked on each request (B86). A page that lists none takes
// any. A listed entry matches when each of its own params equals this URL's.
export async function listed(
	cache: CacheConfig | undefined,
	params: Record<string, string | string[]>,
): Promise<boolean> {
	const list = paramsOf(cache);
	if (list === undefined) return true;
	const slugs = await list({ params });
	return slugs.some((slug) => Object.entries(slug).every(([name, value]) => same(params[name], value)));
}

// An ISR seed stands in for the mutable read only when it was rendered after whatever the store holds for the key,
// a purge's tombstone included, and no key or tag epoch since purged it (B86).
export async function seedLookup(
	seeds: FlareStore,
	at: { store: FlareStore; key: string; looked: Lookup | null },
): Promise<Lookup | null> {
	const seed = await seeds.get(at.key);
	if (seed === null) return null;
	if (at.looked !== null && seed.storedAt <= at.looked.entry.storedAt) return null;
	const epochs = await Promise.all(
		[keyEpochKey(at.key), ...(seed.tags ?? []).map(epochKey)].map((key) => at.store.get(key)),
	);
	const purged = epochs.some((epoch) => typeof epoch?.data === "number" && epoch.data >= seed.storedAt);
	return { entry: seed, purged };
}
