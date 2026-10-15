import { defined } from "../../shared/errors/index.ts"
import { CACHE_HEADER } from "../../shared/protocol/index.ts"
import { withCookies } from "../cacheability/index.ts"
import {
	cached,
	data,
	dataFrom,
	decided,
	HTML,
	page,
	painted,
	type Loaded,
	type Policy,
	type Prepared,
	notFound,
} from "../lifecycle/answers.ts"
import { definedParams } from "../render/matches.ts"
import { runLoaders } from "../loaders/run.ts"
import { answer, routeSecured, typed, type Exchange } from "../lifecycle/exchange.ts"
import type { StoreOption } from "../lifecycle/options.ts"
import { NDJSON } from "../navigation/index.ts"
import type { FlareStore } from "./contract.ts"
import { lookup, type Lookup } from "./epoch.ts"
import { inflight, type Landing } from "./inflight.ts"
import { buildId, storeKey } from "./key.ts"
import { hitOf, storedPageOf, type Hit } from "./read.ts"
import type { Capture } from "./prerender.ts"
import { listed, seedLookup } from "./seed.ts"
import { fromSentinel } from "./nonce.ts"
import { INCOMPLETE, sharedRender, type SharedRender } from "./scrub.ts"
import {
	buildEntry,
	entryTags,
	replayable,
	storedPage,
	storeTiming,
	type EntryInput,
	type StoredPage,
	type StoreTiming,
} from "./write.ts"

// The request's mutable store. A function is called once, on the first read, with the request's env.
export function requestStore(option: StoreOption | undefined, env: unknown): () => FlareStore | undefined {
	let resolved: { store: FlareStore | undefined } | undefined
	return () => (resolved ??= { store: typeof option === "function" ? option(env) : option }).store
}

// A page's answer. A slug the page does not list is the normal 404. A prerender request captures what a stored miss
// writes (bit 12). Otherwise the cache mode picks the answer.
export async function pageAnswer(exchange: Exchange, matched: Loaded): Promise<Response> {
	const cache = matched.chain.at(-1)?.module.cache
	if (!(await listed(cache, definedParams(matched.params)))) return unlisted(exchange, matched)
	const prepared = await decided(exchange, matched)
	if (exchange.prerender !== undefined) {
		return prerendered(exchange, matched, { prepared, capture: exchange.prerender })
	}
	return modeAnswer(exchange, matched, prepared)
}

// A `shared` decision on an `ssg` page with `static` reads its seed. One on an `ssr` or `isr` page with a store goes
// through the store. Every other answer renders live (bit 09).
function modeAnswer(exchange: Exchange, matched: Loaded, prepared: Prepared): Promise<Response> {
	const cache = matched.chain.at(-1)?.module.cache
	const shared = prepared.policy.decision.policy === "shared"
	const seeds = shared && cache?.ssg !== undefined ? staticSeeds(exchange, matched) : undefined
	if (seeds !== undefined) return seeded(exchange, matched, { prepared, seeds })
	const mode = cache?.ssr === undefined ? (cache?.isr === undefined ? undefined : "isr") : "ssr"
	const store = shared && mode !== undefined ? exchange.store() : undefined
	if (store !== undefined && mode !== undefined) return stored(exchange, matched, { prepared, store, mode })
	return live(exchange, matched, prepared)
}

// per-process-constant: the ssg routes each server has reported as having no static store
const reported = new WeakMap<Exchange["options"], Set<string>>()

// The `static` store of an ssg page. Without one the page renders per request (dx/cache.md), and the server says so
// once per route, at error level, so a production log shows it (B89).
function staticSeeds(exchange: Exchange, matched: Loaded): FlareStore | undefined {
	const seeds = exchange.seeds()
	if (seeds === undefined) reportNoStatic(exchange, defined(matched.id, "the ssg page"))
	return seeds
}

function reportNoStatic(exchange: Exchange, id: string): void {
	const seen = reported.get(exchange.options) ?? new Set<string>()
	reported.set(exchange.options, seen)
	if (seen.has(id)) return
	seen.add(id)
	exchange.sink.log.error("cache", `${id} is ssg and createServer has no static store: it renders per request`)
}

// The normal 404, as for an unknown path: a document paints the layouts' not-found, and a data request is the status
// alone (B73, B86). Nothing is stored.
function unlisted(exchange: Exchange, matched: Loaded): Promise<Response> {
	if (exchange.kind !== "document") return Promise.resolve(answer(exchange, 404))
	return notFound(exchange, { ...matched, chain: matched.chain.filter((entry) => entry.kind !== "page") })
}

// An SSG page reads only its static seed, so a tombstone or an epoch never hides it. A listed slug with no seed
// renders live, and nothing is written.
async function seeded(
	exchange: Exchange,
	matched: Loaded,
	at: { prepared: Prepared; seeds: FlareStore },
): Promise<Response> {
	const key = keyOf(exchange, matched, defined(matched.id, "the static page"))
	const read = async (): Promise<Lookup | null> => {
		const seed = await at.seeds.get(key)
		return seed === null ? null : { entry: seed, purged: false }
	}
	const looked = await gated(exchange, matched, { prepared: at.prepared, read })
	if (looked instanceof Response) return looked
	const page = looked === null ? undefined : storedPageOf(looked.entry.data)
	if (page === undefined) return live(exchange, matched, at.prepared)
	return served(exchange, page, { policy: at.prepared.policy, cache: "hit", cookies: [] })
}

// A prerender (bit 12): the shared render and the entry a stored miss writes, handed to prerender instead of a store.
// Prerender asks only for an ssg page or an isr page with params. An answer that is not shared, or a render with
// nothing to store, answers live, and its status tells prerender why nothing was captured.
async function prerendered(
	exchange: Exchange,
	matched: Loaded,
	at: { prepared: Prepared; capture: Capture },
): Promise<Response> {
	if (at.prepared.policy.decision.policy !== "shared") return live(exchange, matched, at.prepared)
	const shared = await sharedRender(exchange, matched)
	if (shared === undefined) return live(exchange, matched, at.prepared)
	if (shared === INCOMPLETE) return live(exchange, matched, uncached(at.prepared))
	const mode = matched.chain.at(-1)?.module.cache?.ssg === undefined ? "isr" : "ssg"
	const policy: Policy = { ...at.prepared.policy, rejected: !shared.settled }
	const input = entryInput(shared, matched, { mode, policy })
	const page = storedPage(input)
	const entry = buildEntry(input, page)
	if (entry !== undefined) at.capture(keyOf(exchange, matched, defined(matched.id, "the prerendered page")), entry)
	return served(exchange, page, { policy, cache: "miss", cookies: [] })
}

function live(exchange: Exchange, matched: Loaded, prepared: Prepared): Promise<Response> {
	if (exchange.kind === "document") return page(exchange, matched, prepared)
	return data(exchange, matched, prepared)
}

// A shared render that did not complete is served as the live render it is, `private, no-store` (B15).
function uncached(prepared: Prepared): Prepared {
	return { ...prepared, policy: { ...prepared.policy, rejected: true } }
}

type Stored = { prepared: Prepared; store: FlareStore; mode: "isr" | "ssr" }

// What a read and a shared render of one key share: its store key and timing.
type Keyed = Stored & { key: string; timing: StoreTiming }

const NOTHING_STALE: ReadonlySet<string> = new Set()

// A stored page's answer. A chain with `authorize` runs it, after preloader, on this request before the read, so a
// `false` is 403 and the stored body is not used (B73). A hit is served as stored. A stale hit is still served, and
// one refresh starts behind it. A miss runs one shared render, coalesced per key, that writes both variants and
// serves this request's variant exactly as a hit would. A render with nothing to serve answers live.
async function stored(exchange: Exchange, matched: Loaded, at: Stored): Promise<Response> {
	const id = defined(matched.id, "the stored page")
	const timing = defined(storeTiming(id, matched.chain.at(-1)?.module.cache), "the stored page's timing")
	const keyed = { ...at, key: keyOf(exchange, matched, id), timing }
	const looked = await gated(exchange, matched, { prepared: at.prepared, read: () => lookup(at.store, keyed.key) })
	if (looked instanceof Response) return looked
	const hit = hitOf(looked, timing, Date.now()) ?? (await seedHit(exchange, { ...keyed, looked }))
	if (hit !== undefined) {
		if (hit.stale) exchange.waitUntil(inflight(keyed.key, () => flight(exchange, matched, keyed)))
		return served(exchange, hit.page, { policy: at.prepared.policy, cache: "hit", cookies: [] })
	}
	const landed = await inflight(keyed.key, () => flight(exchange, matched, keyed))
	if (landed === undefined) return live(exchange, matched, at.prepared)
	if (landed === INCOMPLETE) return live(exchange, matched, uncached(at.prepared))
	if ("stored" in landed)
		return served(exchange, landed.stored, { policy: at.prepared.policy, cache: "hit", cookies: [] })
	const cookies = [landed.shared.run.headers["set-cookie"] ?? []].flat()
	const policy = { ...at.prepared.policy, rejected: !landed.shared.settled }
	return served(exchange, landed.page, { policy, cache: "miss", cookies })
}

// The key has no identity class segment: a shared chain never requires auth, so its class is `anonymous` (B32).
function keyOf(exchange: Exchange, matched: Loaded, id: string): string {
	const node = defined(
		exchange.options.router.routeTree.find((route) => route.id === id),
		"the stored route",
	)
	return storeKey({ build: buildId(), route: id, pattern: node.path, params: matched.params, class: "anonymous" })
}

// A build-time ISR seed stands in when the mutable read gives no hit and the seed is newer than what the store holds
// (B86). It turns stale and expires on the same timing.
async function seedHit(exchange: Exchange, at: Keyed & { looked: Lookup | null }): Promise<Hit | undefined> {
	const seeds = at.mode === "isr" ? exchange.seeds() : undefined
	if (seeds === undefined) return undefined
	return hitOf(await seedLookup(seeds, at), at.timing, Date.now())
}

// The store read. Behind `authorize` it is the gate's last step, and a gate that stops answers here.
async function gated(
	exchange: Exchange,
	matched: Loaded,
	at: { prepared: Prepared; read: () => Promise<Lookup | null> },
): Promise<Lookup | null | Response> {
	if (!matched.chain.some((entry) => entry.module.authorize !== undefined)) return at.read()
	const run = await runLoaders({ ...at.prepared.input, readStore: at.read })
	if (run.looked !== undefined) return run.looked
	const policy = at.prepared.policy
	if (exchange.kind === "document") return painted(exchange, { chain: matched.chain, run, policy })
	return dataFrom(exchange, run, { skip: NOTHING_STALE, policy })
}

// One shared render and its write. Only a decision still `shared` after the route's own cookies is stored, and
// only when the render passes the write rule (B46). The store is read again first: a fresh entry written since this
// request's own read is served as it is, and nothing renders (B31).
async function flight(exchange: Exchange, matched: Loaded, at: Keyed): Promise<Landing> {
	const fresh = hitOf(await lookup(at.store, at.key), at.timing, Date.now())
	if (fresh !== undefined && !fresh.stale) return { flight: { stored: fresh.page }, written: Promise.resolve() }
	const shared = await sharedRender(exchange, matched)
	if (shared === undefined || shared === INCOMPLETE) return { flight: shared, written: Promise.resolve() }
	const policy: Policy = { ...at.prepared.policy, rejected: !shared.settled }
	const input = entryInput(shared, matched, { mode: at.mode, policy })
	const page = storedPage(input)
	const cookies = [shared.run.headers["set-cookie"] ?? []].flat()
	const entry = buildEntry(input, page)
	const shareable = withCookies(policy.decision, { route: cookies, all: cookies }).policy === "shared"
	const written = entry !== undefined && shareable ? at.store.set(at.key, entry, at.timing.ttl) : Promise.resolve()
	exchange.waitUntil(written)
	return { flight: { shared, page }, written }
}

function entryInput(
	shared: SharedRender,
	matched: Loaded,
	at: { mode: "isr" | "ssr" | "ssg"; policy: Policy },
): EntryInput {
	const cache = matched.chain.at(-1)?.module.cache
	return {
		...shared,
		status: shared.run.response.status,
		headers: shared.run.headers,
		security: shared.run.security,
		render: at.mode,
		tags: entryTags([cache?.ssr?.tags, at.policy.decision.cdn.tags], at.policy.params),
	}
}

// The one way a stored page is served, a hit or a miss: the entry's HTML with its sentinel replaced by this
// request's nonce, or its NDJSON, under the route's security set rebuilt for this request. Only replayable headers
// come back. Cache-Control and Cache-Tag come from the current decision. A miss also carries the route's own
// cookies, which are never stored.
export function served(
	exchange: Exchange,
	stored: StoredPage,
	at: { policy: Policy; cache: "hit" | "miss"; cookies: readonly string[] },
): Response {
	const secured = routeSecured(exchange, stored.security)
	const document = exchange.kind === "document"
	const body = document ? fromSentinel(stored.html, stored.sentinel, secured.secured.nonce) : stored.ndjson
	const headers = typed(secured, document ? HTML : NDJSON, Object.fromEntries(replayable(stored.headers)))
	for (const cookie of at.cookies) headers.append("set-cookie", cookie)
	headers.set(CACHE_HEADER, at.cache)
	const errored = at.policy.rejected === true || (!document && stored.ndjson.includes('{"t":"e"'))
	const run = { headers: { "set-cookie": [...at.cookies] } }
	return cached({ status: 200, body, render: stored.render, headers }, at.policy, { run, errored })
}
