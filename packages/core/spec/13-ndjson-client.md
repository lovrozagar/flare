# NDJSON Client

Layer 4. Depends on defer (Deferred, isDeferred), state-parser (DeferredResolver, hydrateLoaderData, isDeferredMarker), caches (MatchCache).

Client-side NDJSON stream consumption. Reads streaming responses, dispatches messages, resolves deferred promises.

## Types

```ts
interface NDJSONFetchOptions {
	matchIds?: string[];
	prefetch?: boolean;
	signal?: AbortSignal;
	url: string;
}

interface NDJSONFetchResult {
	matches: FetchedMatch[];
	perRouteHeads: PerRouteHead[];
	success: boolean;
}

interface FetchedMatch {
	error?: Error;
	loaderData: unknown;
	matchId: string;
	preloaderContext?: Record<string, unknown>;
}

interface PerRouteHead {
	head: HeadConfig;
	matchId: string;
}
```

## Exports

```ts
fetchNDJSON(options: NDJSONFetchOptions): Promise<NDJSONFetchResult>
```

## Behavior

### `fetchNDJSON`

Fetches NDJSON data from server for CSR navigation or prefetch.

**1. Build request**

```ts
const headers: Record<string, string> = {
	"flare-data": "1",
};

if (options.matchIds) {
	headers["flare-stale"] = options.matchIds.join(",");
}

if (options.prefetch) {
	headers["flare-prefetch"] = "1";
}
```

**2. Fetch**

```ts
const response = await fetch(options.url, {
	headers,
	signal: options.signal,
});
```

**3. Stream reading**

```ts
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
const deferredResolvers = new Map<string, DeferredResolver>();

while (true) {
	const { done, value } = await reader.read();
	if (done) break;

	buffer += decoder.decode(value, { stream: true });
	const lines = buffer.split("\n");
	buffer = lines.pop() ?? "";

	for (const line of lines) {
		if (!line.trim()) continue;
		const msg = JSON.parse(line);
		/* dispatch by msg.t */
	}
}
```

**4. Message dispatch**

| Message             | Action                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `t: "l"`            | Hydrate deferred markers in `msg.d`, store match with `{ matchId: msg.m, loaderData, preloaderContext: msg.p }` |
| `t: "c"`            | Find resolver by `${msg.m}:${msg.k}`, call `resolve(msg.d)`, delete resolver                                    |
| `t: "e"` (with `k`) | Find resolver by `${msg.m}:${msg.k}`, call `reject(new Error(msg.e.message))`, delete resolver                  |
| `t: "e"` (no `k`)   | Route-level error: store match with `{ matchId: msg.m, error: new Error(msg.e.message) }` — no resolver lookup  |
| `t: "h"`            | Store `{ head: msg.d, matchId: msg.m }` in perRouteHeads                                                        |
| `t: "x"`            | Throw `RedirectResponse` with url/status/replace from message — caller handles redirect                         |
| `t: "r"`            | Resolve `loadersReady` promise — allows caller to start rendering before chunks arrive                          |
| `t: "d"`            | Resolve `loadersReady` if not already (fallback). Stream complete.                                              |

**5. Return**

After `loadersReady` resolves (on `t: "r"` or `t: "d"`), return result immediately. Chunks continue streaming in background, resolving deferred promises.

```ts
await loadersReady;

return {
	matches,
	perRouteHeads,
	success: true,
};
```

### Deferred Hydration (CSR)

Same mechanism as SSR state parser — `hydrateLoaderData` converts markers to real promises:

```ts
case "l": {
  const hydrated = hydrateLoaderData(msg.m, msg.d, deferredResolvers)
  matches.push({ loaderData: hydrated, matchId: msg.m, preloaderContext: msg.p })
}
```

Resolver map shared between loader message processing and chunk message processing. Chunks resolve the promises created during hydration.

### Abort / Cancellation

If `signal.aborted` during reading:

1. Cancel the reader: `reader.cancel()`
2. Reject all pending deferred resolvers: `resolver.reject(new Error("Navigation cancelled"))`
3. Return early

Checked before each line processing and between reads.

### Redirect Handling

When `t: "x"` received:

1. Cancel reader
2. Reject pending resolvers
3. Throw `RedirectResponse` — caller catches and performs client-side navigation

### Error Handling

- Network error → `fetchNDJSON` throws, caller handles
- Invalid JSON line → skip line (defensive)
- Loader error message (`t: "e"` without `k`) → store error on match (no resolver — `t: "l"` was never sent for this route). Navigation renders error boundary for this route.
- Deferred error message (`t: "e"` with `k`) → reject resolver keyed by `${matchId}:${key}`

## Test Cases

```
Request building:
  Basic nav → headers: { "flare-data": "1" }
  With matchIds → "flare-stale": "a,b,c"
  With prefetch → "flare-prefetch": "1"
  With signal → passed to fetch

Loader messages:
  Single loader → one FetchedMatch in result
  Multiple loaders → ordered by arrival
  Loader with preloaderContext → preserved in match
  Loader with deferred markers → hydrated to Deferred with promise

Chunk messages:
  Chunk resolves matching deferred promise
  Resolver deleted after resolution (no double-resolve)
  Chunk for unknown key → ignored (defensive)
  Multiple chunks for same route → each resolves independently

Error messages:
  Error with key → rejects specific deferred
  Error without key → stored as error on FetchedMatch (no resolver lookup)
  Error message used to create Error object
  Resolver deleted after rejection

Head messages:
  Per-route head (with matchId) → stored in perRouteHeads
  Multiple head messages → all collected

Redirect:
  t:"x" → throws RedirectResponse
  Reader cancelled on redirect
  Pending resolvers rejected on redirect
  Redirect URL and status preserved

Ready/Done:
  t:"r" → loadersReady resolves, fetchNDJSON returns
  t:"d" without prior t:"r" → loadersReady resolves (fallback)
  Chunks continue streaming after fetchNDJSON returns

Abort:
  Signal aborted before fetch → fetch throws AbortError
  Signal aborted during streaming → reader cancelled
  Pending resolvers rejected with "Navigation cancelled"
  No more messages processed after abort

Stream parsing:
  Complete line → parsed as JSON
  Partial line → buffered until complete
  Empty line → skipped
  Multiple messages in single chunk → all processed
  Newline at end of chunk → no empty trailing parse

Edge cases:
  Empty response body → loadersReady resolves, empty matches
  Only done message → empty result
  Loader + done (no ready) → loadersReady resolves on done
```

## Notes

- `fetchNDJSON` returns as soon as `loadersReady` resolves — deferred chunks stream in background
- Deferred promises are "fire and forget" from `fetchNDJSON`'s perspective — they resolve via Suspense on the component side
- Resolver map is per-fetch, not global — concurrent navigations have isolated resolvers
- No `t: "q"` handling in NDJSON — query client hydration uses `FlareState.q` (spec 25/33), not streaming
- No `x-f` header in v2 — NDJSON is the only CSR navigation format
- Stream buffer handles partial lines across chunks (TextDecoder with `{ stream: true }`)
- Buffer remainder after stream ends: if non-empty, parse as final message (server always terminates with `\n` but defensive handling)
- Redirect is an exception flow — thrown as error, not returned as result
