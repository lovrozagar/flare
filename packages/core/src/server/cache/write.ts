import { parseDuration } from "../../shared/duration/index.ts";
import type { CacheConfig, CacheTags } from "../../shared/route-builder/chain.ts";
import type { SecurityConfig } from "../../shared/route-builder/types.ts";
import { defaultHeaders } from "../security/defaults.ts";
import type { FlareStoreEntry } from "./contract.ts";
import { newSentinel, toSentinel } from "./nonce.ts";
import { isDocument } from "../render/shape.ts";

// How long a stored entry lives, and when it turns stale, in milliseconds.
export type StoreTiming = { ttl: number; stale: number };

// The ISR ceiling: on demand, an omitted `revalidate`, and the cap on `revalidate * 2` (B47).
const DAY = 24 * 60 * 60 * 1000;

// The mutable store's timing for a page, checked when the server loads the chain, before any render. A bad config
// is a bug that names the route. The check lives here, not in the chain, so createPage carries no bytes for it.
// `ssg` and a page with no mode have none: ssg reads the static seeds.
export function storeTiming(route: string, cache: CacheConfig | undefined): StoreTiming | undefined {
	if (cache?.ssr !== undefined) {
		if (cache.ssr.ttl === undefined) throw new Error(`${route}: cache.ssr needs a ttl`);
		const ttl = parseDuration(cache.ssr.ttl);
		const stale = parseDuration(cache.ssr.staleTime ?? "0s");
		if (stale > ttl) throw new Error(`${route}: cache.ssr.staleTime is longer than its ttl`);
		return { ttl, stale };
	}
	if (cache?.isr === undefined) return undefined;
	const revalidate = cache.isr === true ? undefined : cache.isr.revalidate;
	// Nothing turns stale before an on-demand entry expires: the 24h ttl is a real miss.
	if (revalidate === undefined) return { ttl: DAY, stale: DAY };
	const ttl = Math.min(parseDuration(revalidate) * 2, DAY);
	return { ttl, stale: Math.min(parseDuration(revalidate), ttl) };
}

// One stored page: the document and the data variant of one URL, from one shared render. `headers` are the route's
// replayable headers. `security` is the route's merged `.security()` config, so a hit rebuilds the set with its own
// nonce. `sentinel` is this entry's nonce placeholder.
export type StoredPage = {
	html: string;
	ndjson: string;
	headers: readonly (readonly [string, string])[];
	security: SecurityConfig;
	sentinel: string;
	render: "isr" | "ssr" | "ssg";
};

// What a finished shared render hands the write. `settled` is every "resolve" value fulfilled.
export type EntryInput = {
	status: number;
	html: string;
	ndjson: string;
	settled: boolean;
	headers: Readonly<Record<string, string | string[]>>;
	security: SecurityConfig;
	nonce: string;
	render: "isr" | "ssr" | "ssg";
	startedAt: number;
	tags: readonly string[];
};

// Never stored: a redirect target, a cookie, the decision's own headers, and the security set, which finalize
// writes on every answer (B46).
const NEVER_STORED = new Set([
	"location",
	"set-cookie",
	"cache-control",
	"cache-tag",
	"content-security-policy",
	...defaultHeaders("https://flare.invalid").keys(),
]);

// The page a shared render left: its nonce becomes this page's own sentinel. Never-stored headers are dropped.
export function storedPage(input: EntryInput): StoredPage {
	const sentinel = newSentinel();
	return {
		html: toSentinel(input.html, input.nonce, sentinel),
		ndjson: input.ndjson,
		headers: replayable(
			Object.entries(input.headers).map(([name, value]) => [name, [value].flat().join(", ")] as const),
		),
		security: input.security,
		sentinel,
		render: input.render,
	};
}

// The headers a stored page may carry back, whatever a record holds.
export function replayable(headers: readonly (readonly [string, string])[]): (readonly [string, string])[] {
	return headers.filter(([name]) => !NEVER_STORED.has(name.toLowerCase()));
}

// The one write rule (B46, B47): a 2xx document holding `<html` and `</body>`, a data variant with no error frame,
// and every "resolve" value fulfilled. `storedAt` is the render's start. A body that fails any of these is not
// stored.
export function buildEntry(input: EntryInput, page: StoredPage = storedPage(input)): FlareStoreEntry | undefined {
	if (input.status < 200 || input.status > 299 || !input.settled) return undefined;
	if (!isDocument(input.html)) return undefined;
	if (input.ndjson.split("\n").some((line) => line.startsWith('{"t":"e"'))) return undefined;
	return { data: page, storedAt: input.startedAt, tags: input.tags };
}

// An entry's tags: `cache.ssr.tags` and the merged `cdn.tags`, each resolved with the raw params, deduped. A store
// tag and a `Cache-Tag` share one vocabulary.
export function entryTags(
	sources: readonly (CacheTags | undefined)[],
	params: Record<string, string | string[]>,
): string[] {
	const tags = sources.flatMap((source) => (typeof source === "function" ? source({ params }) : (source ?? [])));
	return [...new Set(tags)];
}
