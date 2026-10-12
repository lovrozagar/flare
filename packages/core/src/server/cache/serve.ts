import { defined } from "../../shared/errors/index.ts";
import { CACHE_HEADER } from "../../shared/protocol/index.ts";
import { withCookies } from "../cacheability/index.ts";
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
} from "../lifecycle/answers.ts";
import { runLoaders } from "../loaders/run.ts";
import { routeSecured, typed, type Exchange } from "../lifecycle/exchange.ts";
import type { StoreOption } from "../lifecycle/options.ts";
import { NDJSON } from "../navigation/index.ts";
import type { FlareStore } from "./contract.ts";
import { lookup, type Lookup } from "./epoch.ts";
import { inflight, type Flight } from "./inflight.ts";
import { buildId, storeKey } from "./key.ts";
import { hitOf } from "./read.ts";
import { fromSentinel } from "./nonce.ts";
import { sharedRender, type SharedRender } from "./scrub.ts";
import {
	buildEntry,
	entryTags,
	replayable,
	storedPage,
	storeTiming,
	type EntryInput,
	type StoredPage,
	type StoreTiming,
} from "./write.ts";

// The request's mutable store. A function is called once, on the first read, with the request's env.
export function requestStore(option: StoreOption | undefined, env: unknown): () => FlareStore | undefined {
	let resolved: { store: FlareStore | undefined } | undefined;
	return () => (resolved ??= { store: typeof option === "function" ? option(env) : option }).store;
}

// A page's answer. A `shared` decision on an `ssr` or `isr` page with a store goes through the store. Every other
// answer renders live (bit 09).
export async function pageAnswer(exchange: Exchange, matched: Loaded): Promise<Response> {
	const prepared = await decided(exchange, matched);
	const cache = matched.chain.at(-1)?.module.cache;
	const mode = cache?.ssr === undefined ? (cache?.isr === undefined ? undefined : "isr") : "ssr";
	const store = prepared.policy.decision.policy === "shared" && mode !== undefined ? exchange.store() : undefined;
	if (store !== undefined && mode !== undefined) return stored(exchange, matched, { prepared, store, mode });
	return live(exchange, matched, prepared);
}

function live(exchange: Exchange, matched: Loaded, prepared: Prepared): Promise<Response> {
	if (exchange.kind === "document") return page(exchange, matched, prepared);
	return data(exchange, matched, prepared);
}

type Stored = { prepared: Prepared; store: FlareStore; mode: "isr" | "ssr" };

// What a read and a shared render of one key share: its store key and timing.
type Keyed = Stored & { key: string; timing: StoreTiming };

const NOTHING_STALE: ReadonlySet<string> = new Set();

// A stored page's answer. A chain with `authorize` runs it, after preloader, on this request before the read, so a
// `false` is 403 and the stored body is not used (B73). A hit is served as stored. A stale hit is still served, and
// one refresh starts behind it. A miss runs one shared render, coalesced per key, that writes both variants and
// serves this request's variant exactly as a hit would. A render with nothing to serve answers live.
async function stored(exchange: Exchange, matched: Loaded, at: Stored): Promise<Response> {
	const id = defined(matched.id, "the stored page");
	const timing = defined(storeTiming(id, matched.chain.at(-1)?.module.cache), "the stored page's timing");
	const keyed = { ...at, key: keyOf(exchange, matched, id), timing };
	const looked = await lookedUp(exchange, matched, keyed);
	if (looked instanceof Response) return looked;
	const hit = hitOf(looked, timing, Date.now());
	if (hit !== undefined) {
		if (hit.stale) exchange.waitUntil(inflight(keyed.key, () => flight(exchange, matched, keyed)));
		return served(exchange, hit.page, { policy: at.prepared.policy, cache: "hit", cookies: [] });
	}
	const landed = await inflight(keyed.key, () => flight(exchange, matched, keyed));
	if (landed === undefined) return live(exchange, matched, at.prepared);
	const cookies = [landed.shared.run.headers["set-cookie"] ?? []].flat();
	const policy = { ...at.prepared.policy, rejected: !landed.shared.settled };
	return served(exchange, landed.page, { policy, cache: "miss", cookies });
}

// The key has no identity class segment: a shared chain never requires auth, so its class is `anonymous` (B32).
function keyOf(exchange: Exchange, matched: Loaded, id: string): string {
	const node = defined(
		exchange.options.router.routeTree.find((route) => route.id === id),
		"the stored route",
	);
	return storeKey({ build: buildId(), route: id, pattern: node.path, params: matched.params, class: "anonymous" });
}

// The store read. Behind `authorize` it is the gate's last step, and a gate that stops answers here.
async function lookedUp(exchange: Exchange, matched: Loaded, at: Keyed): Promise<Lookup | null | Response> {
	const read = (): Promise<Lookup | null> => lookup(at.store, at.key);
	if (!matched.chain.some((entry) => entry.module.authorize !== undefined)) return read();
	const run = await runLoaders({ ...at.prepared.input, readStore: read });
	if (run.looked !== undefined) return run.looked;
	const policy = at.prepared.policy;
	if (exchange.kind === "document") return painted(exchange, { chain: matched.chain, run, policy });
	return dataFrom(exchange, run, { skip: NOTHING_STALE, policy });
}

// One shared render and its write. Only a decision still `shared` after the route's own cookies is stored, and
// only when the render passes the write rule (B46).
async function flight(exchange: Exchange, matched: Loaded, at: Keyed): Promise<Flight> {
	const shared = await sharedRender(exchange, matched);
	if (shared === undefined) return undefined;
	const policy: Policy = { ...at.prepared.policy, rejected: !shared.settled };
	const input = entryInput(shared, matched, { mode: at.mode, policy });
	const page = storedPage(input);
	const cookies = [shared.run.headers["set-cookie"] ?? []].flat();
	const entry = buildEntry(input, page);
	if (entry !== undefined && withCookies(policy.decision, { route: cookies, all: cookies }).policy === "shared") {
		exchange.waitUntil(at.store.set(at.key, entry, at.timing.ttl));
	}
	return { shared, page };
}

function entryInput(shared: SharedRender, matched: Loaded, at: { mode: "isr" | "ssr"; policy: Policy }): EntryInput {
	const cache = matched.chain.at(-1)?.module.cache;
	return {
		...shared,
		status: shared.run.response.status,
		headers: shared.run.headers,
		security: shared.run.security,
		render: at.mode,
		tags: entryTags([cache?.ssr?.tags, at.policy.decision.cdn.tags], at.policy.params),
	};
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
	const secured = routeSecured(exchange, stored.security);
	const document = exchange.kind === "document";
	const body = document ? fromSentinel(stored.html, stored.sentinel, secured.secured.nonce) : stored.ndjson;
	const headers = typed(secured, document ? HTML : NDJSON, Object.fromEntries(replayable(stored.headers)));
	for (const cookie of at.cookies) headers.append("set-cookie", cookie);
	headers.set(CACHE_HEADER, at.cache);
	const errored = at.policy.rejected === true || (!document && stored.ndjson.includes('{"t":"e"'));
	const run = { headers: { "set-cookie": [...at.cookies] } };
	return cached({ status: 200, body, render: stored.render, headers }, at.policy, { run, errored });
}
