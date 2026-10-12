import { requestScope } from "../context/ctx.ts";
import type { FlareStore } from "./contract.ts";
import { bumpEpochs } from "./epoch.ts";

// A key purge, a tag purge, or both (dx/store.md). There is no `tiers`, `callerData`, `cdnPurgeAdapter`,
// `tagHeader`, or `revalidateSecret`: a CDN purges by the `Cache-Tag` header.
export type RevalidateOptions = { keys?: readonly string[]; tags?: readonly string[] };

const FIELDS = new Set(["keys", "tags"]);

// Read at the call, so an empty purge or a v0 field a cast let through throws before any store work.
function checked(options: RevalidateOptions): { keys: readonly string[]; tags: readonly string[] } {
	for (const name of Object.keys(options)) {
		if (!FIELDS.has(name)) throw new Error(`revalidate: ${name} is not a field. The fields are keys and tags`);
	}
	const keys = options.keys ?? [];
	const tags = options.tags ?? [];
	if (keys.length === 0 && tags.length === 0) throw new Error("revalidate: pass keys or tags");
	return { keys, tags };
}

// Keys get tombstones, through `deleteByKeys` when the store has it. Tags bump their epochs.
function purge(store: FlareStore, { keys, tags }: { keys: readonly string[]; tags: readonly string[] }): Promise<void> {
	return Promise.all([tombstones(store, keys), bumpEpochs(store, tags)]).then(() => undefined);
}

async function tombstones(store: FlareStore, keys: readonly string[]): Promise<void> {
	if (keys.length === 0) return;
	if (store.deleteByKeys !== undefined) return store.deleteByKeys(keys);
	await Promise.all(keys.map((key) => store.delete(key)));
}

// A purge of one store, for code that runs outside a request: a queue consumer or a script.
export function createRevalidateFn(store: FlareStore): (options: RevalidateOptions) => Promise<void> {
	return (options) => purge(store, checked(options));
}

// The handler's purge: the store `createServer({ store })` reads for this request. The promise goes to the
// adapter's waitUntil, so the purge outlives the response.
export function revalidate(options: RevalidateOptions): Promise<void> {
	const wanted = checked(options);
	const scope = requestScope();
	const store = scope?.store();
	if (scope === undefined || store === undefined) {
		throw new Error("revalidate() runs inside a request to a server with a store. Outside one, use createRevalidateFn");
	}
	const done = purge(store, wanted);
	scope.waitUntil(done);
	return done;
}
