import { defined } from "../../shared/errors/index.ts";
import { CACHE_HEADER } from "../../shared/protocol/index.ts";
import { withCookies } from "../cacheability/index.ts";
import { cached, data, decided, HTML, page, type Loaded, type Policy, type Prepared } from "../lifecycle/answers.ts";
import { routeSecured, typed, type Exchange } from "../lifecycle/exchange.ts";
import type { StoreOption } from "../lifecycle/options.ts";
import { NDJSON } from "../navigation/index.ts";
import type { FlareStore } from "./contract.ts";
import { buildId, storeKey } from "./key.ts";
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

// A miss runs one shared render that writes both variants, then serves the variant this request asked for exactly
// as a hit serves the entry (dx/cache.md). A render that is not a clean 200 answers as a live render of this request,
// and stores nothing.
async function stored(exchange: Exchange, matched: Loaded, at: Stored): Promise<Response> {
	const shared = await sharedRender(exchange, matched);
	if (shared === undefined) return live(exchange, matched, at.prepared);
	const cookies = [shared.run.headers["set-cookie"] ?? []].flat();
	const policy: Policy = { ...at.prepared.policy, rejected: !shared.settled };
	const input = entryInput(shared, matched, { mode: at.mode, policy });
	const stored = storedPage(input);
	if (withCookies(policy.decision, { route: cookies, all: cookies }).policy === "shared") {
		write(exchange, matched, { store: at.store, input, page: stored, run: shared.run });
	}
	return served(exchange, stored, { policy, cache: "miss", cookies });
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

type Written = { store: FlareStore; input: EntryInput; page: StoredPage; run: SharedRender["run"] };

// The write runs in the background, under the page's ttl, when the render passes the write rule (B46).
function write(exchange: Exchange, matched: Loaded, written: Written): void {
	const entry = buildEntry(written.input, written.page);
	if (entry === undefined) return;
	const id = defined(matched.id, "the stored page");
	const pattern = defined(
		exchange.options.router.routeTree.find((node) => node.id === id),
		"the stored route",
	).path;
	const key = storeKey({
		build: buildId(),
		route: id,
		pattern,
		params: matched.params,
		class: defined(written.run.class, "the policy class of a rendered run"),
	});
	const timing = defined(storeTiming(id, matched.chain.at(-1)?.module.cache), "the stored page's timing");
	exchange.waitUntil(written.store.set(key, entry, timing.ttl));
}
