import { defined as required } from "../../shared/errors/index.ts"
import { parseDuration } from "../../shared/duration/index.ts"
import type { ClientCache, EffectPlace, Effects } from "../../shared/route-builder/index.ts"
import type { HeadConfig } from "../../shared/route-builder/types.ts"
import { matchId } from "../../shared/route-tree/index.ts"
import type { Match, Router } from "../../shared/router/create-router.ts"
import { loadedModule } from "../../shared/router/load-chain.ts"
import { readSearch, type Location } from "../../shared/url/index.ts"
import type { Landed, Values } from "../navigation/frames.ts"

type Raw = Record<string, string | string[]>

type RouterClientCache = Router["cache"]["client"]

export type { Effects } from "../../shared/route-builder/index.ts"

// One match of a navigation target. `route` is the route id and `id` the match id (B31). `client` is the route's
// `cache.client`.
export type CachedMatch = {
	route: string
	id: string
	layout: boolean
	params: Raw
	search: Raw
	effects?: Effects
	client?: ClientCache
}

// `staleTime` and `gcTime` are the entry's own clock in ms, when its route sets one. Else the cache's applies.
export type CacheEntry = {
	data: unknown
	deferred: boolean
	deps?: string
	head?: HeadConfig
	preloader?: Record<string, unknown>
	values?: Values
	staleTime?: number
	gcTime?: number
}

type Stored = CacheEntry & { at: number; touched: number }

export type Plan = {
	matches: readonly CachedMatch[]
	trigger: "initial" | "navigation" | "revalidation"
	revalidate: boolean
	current: EffectPlace
	next: EffectPlace
}

export type MatchCache = {
	store: (match: CachedMatch, entry: CacheEntry) => void
	evict: (match: CachedMatch) => void
	// The entry still holding this data now has every deferred value settled. It keeps its clock.
	filled: (match: CachedMatch, data: unknown) => void
	read: (match: CachedMatch) => Stored | undefined
	deps: (match: CachedMatch) => string | undefined
	plan: (plan: Plan) => { fetch: boolean; stale: string[]; fresh: boolean }
}

// Only successful `l` payloads are stored. An `e` evicts. `staleTime` decides whether a held page may skip its
// loader. `gcTime` drops an entry nobody read. Past `max`, the least recently used entry goes.
export function createMatchCache(options: {
	staleTime: number
	gcTime: number
	max?: number
	now?: () => number
}): MatchCache {
	if (options.gcTime < 0) throw new Error("gcTime is at least 0 ms")
	const now = options.now ?? Date.now
	const max = options.max ?? 100
	const entries = new Map<string, Stored>()
	const read = (match: CachedMatch): Stored | undefined => {
		const key = matchKey(match)
		const entry = entries.get(key)
		if (entry === undefined) return undefined
		entries.delete(key)
		if (now() - entry.touched > (entry.gcTime ?? options.gcTime)) return undefined
		entries.set(key, { ...entry, touched: now() })
		return entry
	}
	return {
		store(match, entry) {
			entries.delete(matchKey(match))
			entries.set(matchKey(match), { ...entry, at: now(), touched: now() })
			if (entries.size > max) entries.delete(required(entries.keys().next().value, "the oldest entry"))
		},
		evict: (match) => void entries.delete(matchKey(match)),
		filled: (match, data) => fill(entries, matchKey(match), data),
		read,
		deps,
		// A page the client holds fresh is listed in _flare_stale, so the server skips its loader (B30). A layout
		// never is. Hydrate fetches only when a page asks to refetch on "initial".
		plan(plan) {
			const asks = (match: CachedMatch): boolean =>
				match.effects?.shouldRefetch?.({
					trigger: plan.trigger,
					location: { current: plan.current, next: plan.next },
					params: match.params,
					search: match.search,
				}) === true
			const held = (match: CachedMatch): boolean => {
				const entry = read(match)
				// `0` is never fresh, not even within the millisecond the entry was stored (dx/cache.md, B19).
				const staleTime = entry?.staleTime ?? options.staleTime
				if (entry === undefined || plan.revalidate || staleTime === 0 || now() - entry.at > staleTime) return false
				// A deferred entry is reused only once filled, which only `cacheDeferred: true` marks (B19).
				return entry.deps === deps(match) && !entry.deferred
			}
			const pages = plan.matches.filter((match) => !match.layout)
			const kept = pages.filter((match) => held(match) && !asks(match))
			const fetch = plan.trigger !== "initial" || pages.some(asks)
			// Every match fresh on its own clock, layouts included: no request at all. Mounted is not fresh (B19).
			const layouts = plan.matches.filter((match) => match.layout)
			const fresh = kept.length === pages.length && layouts.every(held)
			return { fetch, stale: kept.map((match) => match.id), fresh }
		},
	}
}

// A newer landing replaced the entry when its data is not this one, and the newer entry has its own watch.
function fill(entries: Map<string, Stored>, key: string, data: unknown): void {
	const entry = entries.get(key)
	if (entry !== undefined && entry.data === data) entries.set(key, { ...entry, deferred: false })
}

// One match of one URL: the route id and the match id.
function matchKey(match: CachedMatch): string {
	return `${match.route}\n${match.id}`
}

// loaderDeps values compared as JSON: a new array with the same values is the same deps.
function deps(match: CachedMatch): string | undefined {
	const loaderDeps = match.effects?.loaderDeps
	return loaderDeps === undefined
		? undefined
		: JSON.stringify(loaderDeps({ search: match.search, params: match.params }))
}

// The cache and the stale plan key a match alike: raw params plus the raw search (B31). A module loadChain already
// imported gives its effects and its `cache.client`. One not yet imported has no entry to hold. The page's
// `cache.client` also comes from the tree node, so a prefetch reads it before the import.
export function cachedMatches(match: Match, location: Location): CachedMatch[] {
	const params = defined(match.params)
	const search = readSearch(location.search)
	const id = matchId(params, location.search.slice(1))
	return match.chain.map((entry) => {
		const cached: CachedMatch = { route: entry.id, id, layout: entry.kind === "layout", params, search }
		const record = loadedModule(entry.module)
		const client = (entry.kind === "page" ? match.client : undefined) ?? record?.cache?.client
		if (record?.effects !== undefined) cached.effects = record.effects
		if (client !== undefined) cached.client = client
		return cached
	})
}

// Only successful `l` payloads are cached, with their head, on the route's clock. A failed match is evicted. A
// route whose `cache.client` is false is not cached.
export function remember(cache: MatchCache, matches: readonly CachedMatch[], landing: Landed): void {
	for (const match of matches) {
		if (landing.failure?.route === match.route || match.client === false) cache.evict(match)
		else if (match.route in landing.data) {
			const entry = entryOf(match, landing)
			cache.store(match, entry)
			// `cacheDeferred: true`: once every deferred value settles, the entry counts as filled (dx/cache.md, B19).
			if (entry.deferred && clientOf(match.client).cacheDeferred === true) {
				void Promise.allSettled(deferredOf(entry.data)).then(() => cache.filled(match, entry.data))
			}
		}
	}
}

// The live promises a match's data still waits on. A raw placeholder never settles on its own.
function deferredOf(value: unknown): Promise<unknown>[] {
	if (Array.isArray(value)) return value.flatMap(deferredOf)
	if (typeof value !== "object" || value === null) return []
	if (Reflect.get(value, "__deferred") !== true) return Object.values(value).flatMap(deferredOf)
	const promise: unknown = Reflect.get(value, "promise")
	return [promise instanceof Promise ? promise : new Promise<never>(() => undefined)]
}

function entryOf(match: CachedMatch, landing: Landed): CacheEntry {
	const data = landing.data[match.route]
	const entry: CacheEntry = { data, deferred: holds(data) }
	const head = landing.heads[match.route]
	const preloader = landing.preloaders?.[match.route]
	const values = landing.values?.[match.route]
	const client = clientOf(match.client)
	// The deps the page was cached under. Without them a page with `loaderDeps` never counts as fresh (B19).
	const cachedDeps = deps(match)
	if (cachedDeps !== undefined) entry.deps = cachedDeps
	if (head !== undefined) entry.head = head
	if (preloader !== undefined) entry.preloader = preloader
	if (values !== undefined) entry.values = values
	if (client.staleTime !== undefined) entry.staleTime = parseDuration(client.staleTime)
	if (client.gcTime !== undefined) entry.gcTime = parseDuration(client.gcTime)
	return entry
}

// The fields of a route's `cache.client`. Absent and `false` both set none.
export function clientOf(client: ClientCache | undefined): Exclude<ClientCache, false> {
	return client === undefined || client === false ? {} : client
}

// A value that still holds a deferred placeholder (B80).
export function holds(data: unknown): boolean {
	return JSON.stringify({ d: data }).includes('"__deferred":true')
}

// Route params without the optional ones that are absent.
export function defined(params: Record<string, string | string[] | undefined>): Raw {
	return Object.fromEntries(
		Object.entries(params).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
	)
}

// The router's client cache. `false` keeps nothing.
export function cacheFor(client: RouterClientCache, max: number): MatchCache {
	if (client === false) return createMatchCache({ staleTime: 0, gcTime: 0, max: 0 })
	return createMatchCache({ staleTime: client.staleTime, gcTime: parseDuration(client.gcTime), max })
}
