import { defined } from "../../shared/errors/index.ts";
import { CACHE_HEADER } from "../../shared/protocol/index.ts";
import { withCookies } from "../cacheability/index.ts";
import { runLoaders, type LoaderRun } from "../loaders/run.ts";
import { dataBody, dataFrames, NDJSON } from "../navigation/index.ts";
import {
	cached,
	data,
	dataFrom,
	decided,
	drawn,
	framed,
	HTML,
	loaderInput,
	page,
	painted,
	type Loaded,
	type Policy,
	type Prepared,
} from "../lifecycle/answers.ts";
import { typed, type Exchange } from "../lifecycle/exchange.ts";
import type { StoreOption } from "../lifecycle/options.ts";
import type { FlareStore } from "./contract.ts";
import { buildId, storeKey } from "./key.ts";
import { sharedExchange } from "./scrub.ts";
import { buildEntry, entryTags, storeTiming } from "./write.ts";

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
	if (exchange.kind === "document") return page(exchange, matched, prepared);
	return data(exchange, matched, prepared);
}

type Stored = { prepared: Prepared; store: FlareStore; mode: "isr" | "ssr" };

const NOTHING_STALE: ReadonlySet<string> = new Set();

// A miss runs one shared render that writes both variants, then serves the variant this request asked for: the
// body it stored (dx/cache.md). A render that is not a clean 200 answers as a live one would, and stores nothing.
async function stored(exchange: Exchange, matched: Loaded, at: Stored): Promise<Response> {
	const startedAt = Date.now();
	const shared = sharedExchange(exchange, defined(exchange.options.site, "the site a store requires"));
	const run = await runLoaders({ ...loaderInput(shared, matched), shared: true, stored: true });
	const results = await Promise.allSettled(run.deferred.map((entry) => entry.promise));
	const policy: Policy = { ...at.prepared.policy, rejected: results.some((result) => result.status === "rejected") };
	const rendered = { chain: matched.chain, run, policy };
	if (run.response.status !== 200) {
		if (exchange.kind === "document") return painted(exchange, rendered);
		return dataFrom(exchange, run, { skip: NOTHING_STALE, policy });
	}
	const document = await drawn(exchange, rendered);
	if ("failed" in document) return document.failed;
	// The shell holds every settled value and a `"stream"` hole's fallback. A hole never closes the stream, so the
	// render stops after the shell.
	const html = await shellOf(document.body);
	const ndjson = await new Response(
		dataBody({ ...dataFrames(run, NOTHING_STALE), deferred: run.deferred, project: framed(exchange) }),
	).text();
	write(exchange, matched, { at, run, policy, startedAt, html, ndjson, nonce: document.exchange.secured.nonce });
	const errored = policy.rejected === true || (exchange.kind !== "document" && ndjson.includes('{"t":"e"'));
	const headers = typed(document.exchange, exchange.kind === "document" ? HTML : NDJSON, run.headers);
	headers.set(CACHE_HEADER, "miss");
	const body = exchange.kind === "document" ? html : ndjson;
	return cached({ status: 200, body, render: at.mode, headers }, policy, { run, errored });
}

async function shellOf(body: ReadableStream<Uint8Array>): Promise<string> {
	const reader = body.getReader();
	const first = await reader.read();
	void reader.cancel();
	return new TextDecoder().decode(first.value);
}

type Written = {
	at: Stored;
	run: LoaderRun;
	policy: Policy;
	startedAt: number;
	html: string;
	ndjson: string;
	nonce: string;
};

// The write runs in the background. Only a decision still `shared` after the route's own cookies is stored.
function write(exchange: Exchange, matched: Loaded, written: Written): void {
	const { at, run, policy } = written;
	const cookies = [run.headers["set-cookie"] ?? []].flat();
	if (withCookies(policy.decision, { route: cookies, all: cookies }).policy !== "shared") return;
	const id = defined(matched.id, "the stored page");
	const cache = matched.chain.at(-1)?.module.cache;
	const entry = buildEntry({
		...written,
		status: run.response.status,
		settled: policy.rejected !== true,
		headers: run.headers,
		security: run.security,
		render: at.mode,
		tags: entryTags([cache?.ssr?.tags, policy.decision.cdn.tags], policy.params),
	});
	if (entry === undefined) return;
	const pattern = defined(
		exchange.options.router.routeTree.find((node) => node.id === id),
		"the stored route",
	).path;
	const key = storeKey({
		build: buildId(),
		route: id,
		pattern,
		params: matched.params,
		class: defined(run.class, "the policy class of a rendered run"),
	});
	const timing = defined(storeTiming(id, cache), "the stored page's timing");
	exchange.waitUntil(at.store.set(key, entry, timing.ttl));
}
