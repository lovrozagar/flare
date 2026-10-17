import type { CacheConfig, ParamsFn } from "../../shared/route-builder/chain.ts"
import type { FlareStore, FlareStoreEntry } from "./contract.ts"
import { keyEpochKey, epochKey, type Lookup } from "./epoch.ts"

// A seed file, `{ seed: true, key, renderedAt, tags, data }`, as the entry it stands for: `storedAt` is
// `renderedAt`. A seed with no flag, no numeric `renderedAt`, no `tags` list, or a key other than the one asked
// for is refused. `tags: []` is a seed with no tags.
export function acceptSeed(json: unknown, key: string): FlareStoreEntry | undefined {
	if (typeof json !== "object" || json === null || Reflect.get(json, "key") !== key) return undefined
	const flag: unknown = Reflect.get(json, "seed")
	const renderedAt: unknown = Reflect.get(json, "renderedAt")
	const tags: unknown = Reflect.get(json, "tags")
	if (flag !== true || typeof renderedAt !== "number" || !Array.isArray(tags)) return undefined
	if (!tags.every((tag: unknown) => typeof tag === "string")) return undefined
	return { data: Reflect.get(json, "data"), tags: tags.map(String), storedAt: renderedAt }
}

// The slugs a page lists: `ssg`'s params function in either form, and `isr`'s when `dynamicParams` is false.
function paramsOf(cache: CacheConfig | undefined): ParamsFn | undefined {
	const ssg = cache?.ssg
	if (typeof ssg === "function") return ssg
	if (typeof ssg === "object" && "params" in ssg) return ssg.params
	const isr = cache?.isr
	return typeof isr === "object" && isr.dynamicParams === false ? isr.params : undefined
}

type Params = Record<string, string | string[]>

// A page's slugs grouped by the names each entry sets: per group, the names and its entries' values. A catch-all
// value is its segments joined by `/`, and a name the URL lacks reads as empty.
type Slugs = Map<string, { names: readonly string[]; values: Set<string> }>

const joined = (value: string | string[] | undefined): string => [value ?? []].flat().join("/")

const valuesOf = (names: readonly string[], params: Params): string =>
	JSON.stringify(names.map((name) => joined(params[name])))

function indexed(slugs: readonly Params[]): Slugs {
	const index: Slugs = new Map()
	for (const slug of slugs) {
		const names = Object.keys(slug).toSorted()
		const group = index.get(JSON.stringify(names)) ?? { names, values: new Set<string>() }
		index.set(JSON.stringify(names), group)
		group.values.add(valuesOf(names, slug))
	}
	return index
}

// per-process-constant: each page's `params()` list, indexed, one entry per params function
const lists = new WeakMap<ParamsFn, Promise<Slugs>>()

// A page's slugs. Outside dev `params()` runs once per server and every request reads its list; a failed call is
// not kept, so the next request calls again. Dev calls it on each request, so an edited list shows at once. Either
// way `ctx.params` is `{}`, as at prerender (dx/cache.md, plan 21 16.7).
function slugsOf(list: ParamsFn, dev: boolean): Promise<Slugs> {
	const called = async (): Promise<Slugs> => indexed(await list({ params: {} }))
	if (dev) return called()
	const held = lists.get(list)
	if (held !== undefined) return held
	const fresh = called()
	lists.set(list, fresh)
	fresh.catch(() => lists.delete(list))
	return fresh
}

// Whether this URL's params are a slug the page lists (B86). A page that lists none takes any. A listed entry
// matches when each of its own params equals this URL's, so the check is one lookup per distinct set of names.
export async function listed(cache: CacheConfig | undefined, params: Params, dev: boolean): Promise<boolean> {
	const list = paramsOf(cache)
	if (list === undefined) return true
	const index = await slugsOf(list, dev)
	return [...index.values()].some((group) => group.values.has(valuesOf(group.names, params)))
}

// An ISR seed stands in for the mutable read only when it was rendered after whatever the store holds for the key,
// a purge's tombstone included, and no key or tag epoch since purged it (B86).
export async function seedLookup(
	seeds: FlareStore,
	at: { store: FlareStore; key: string; looked: Lookup | null },
): Promise<Lookup | null> {
	const seed = await seeds.get(at.key)
	if (seed === null) return null
	if (at.looked !== null && seed.storedAt <= at.looked.entry.storedAt) return null
	const epochs = await Promise.all(
		[keyEpochKey(at.key), ...(seed.tags ?? []).map(epochKey)].map((key) => at.store.get(key)),
	)
	const purged = epochs.some((epoch) => typeof epoch?.data === "number" && epoch.data >= seed.storedAt)
	return { entry: seed, purged }
}
