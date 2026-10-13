import { getRequestEvent, createRequestEvent, type RequestEvent } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { canonicalPath, type CanonicalOptions } from "../../shared/url/canonical.ts";

// The adapter's `waitUntil`, as a fetch handler's third argument.
export type MountContext = { waitUntil: (promise: Promise<unknown>) => void };

// A fetch app's handler, in method form so one whose `env` parameter is narrower, such as Hono's `app.fetch`, is
// accepted as it is. It may answer synchronously.
type MountFetch = {
	fetch(request: Request, env: unknown, ctx: MountContext): Response | Promise<Response>;
}["fetch"];

// A sub-app on a canonical path prefix (dx/server.md `mounts`). It gets the stripped request, createServer's env,
// and the adapter's context, and its answer still passes through finalize.
export type Mount = { prefix: string; fetch: MountFetch };

// What the pipeline hands a mount besides the request.
export type MountCall = { env: unknown; ctx: MountContext };

// The request event fields a mount keeps from the request's scope, so `serverCtx()` works inside it.
const SCOPE_FIELDS = ["flareServerContext", "flareScope"];

type MountEvent = RequestEvent & { flareMount: string };

// `prefix` is a canonical path other than "/": it starts with `/`, has no empty or dot segment, and no trailing
// slash. Anything else throws now, not on the first request.
export function mount(prefix: string, fetch: Mount["fetch"]): Mount {
	assertPrefix(prefix, { caseSensitive: true });
	return { prefix, fetch };
}

// createServer's startup check. Each prefix is canonical for the router, so it can match a canonical path, and
// two equal prefixes throw. The longer prefix wins, so the table is longest first.
// A mount prefix is canonical and, under the router's default `caseSensitive: false`, lowercase: mounts are not
// routes, so no route spelling folds a request toward them.
type MountCanonical = CanonicalOptions & { caseSensitive?: boolean | undefined };

export function mountTable(entries: readonly Mount[], canonical: MountCanonical): Mount[] {
	const seen = new Set<string>();
	for (const entry of entries) {
		assertPrefix(entry.prefix, canonical);
		if (seen.has(entry.prefix)) throw new Error(`mount prefix ${entry.prefix} is listed twice`);
		seen.add(entry.prefix);
	}
	return [...entries].sort((left, right) => right.prefix.length - left.prefix.length);
}

// 02-system step 3. The matching mount's fetch sees the path with the prefix removed and the query kept, while
// its prefix is the active mount `proxy` reads. A sync answer and a sync throw both become the promise. No match
// is undefined, and the router runs.
export function dispatchMount(
	table: readonly Mount[],
	request: Request,
	call: MountCall,
): Promise<Response> | undefined {
	const url = new URL(request.url);
	const entry = table.find((item) => url.pathname === item.prefix || url.pathname.startsWith(`${item.prefix}/`));
	if (entry === undefined) return undefined;
	const rest = url.pathname.slice(entry.prefix.length) || "/";
	// After the strip, `//` is 400 (B87). A parsed http URL has already turned `\` into `/` and percent-encoded
	// control characters, so `//` is the form either one takes here.
	if (rest.startsWith("//")) return Promise.resolve(new Response(null, { status: 400 }));
	const stripped = new Request(new URL(`${rest}${url.search}`, url.origin), request);
	const outer: RequestEvent | undefined = getRequestEvent();
	const kept = SCOPE_FIELDS.filter((name) => outer !== undefined && name in outer);
	const scope = Object.fromEntries(kept.map((name) => [name, Reflect.get(Object(outer), name)]));
	const event: MountEvent = Object.assign(createRequestEvent(stripped), scope, { flareMount: entry.prefix });
	return new Promise((resolve, reject) => {
		provideRequestEvent(event, () => {
			Promise.resolve()
				.then(() => entry.fetch(stripped, call.env, call.ctx))
				.then(resolve, reject);
		});
	});
}

// The prefix of the mount whose fetch is running, or undefined outside one.
export function activeMount(): string | undefined {
	const event: RequestEvent | undefined = getRequestEvent();
	const prefix: unknown = event === undefined ? undefined : Reflect.get(event, "flareMount");
	return typeof prefix === "string" ? prefix : undefined;
}

function assertPrefix(prefix: string, canonical: MountCanonical): void {
	const result = canonicalPath(prefix, { ...canonical, trailingSlash: "never" });
	const folded = canonical.caseSensitive === true || prefix === prefix.toLowerCase();
	const same = "path" in result && result.path === prefix && folded;
	if (!same || prefix === "/" || prefix.endsWith("/"))
		throw new Error(`mount prefix ${prefix} is not a canonical path`);
}
