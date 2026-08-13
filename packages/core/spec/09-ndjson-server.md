# NDJSON Server

Layer 3. Depends on loader-pipeline (PipelineResult, PipelineMatch), defer (DeferContext, DeferredEntry, isDeferred), errors (RedirectResponse), ssr (mergeHeadConfigs).

Generates NDJSON responses for CSR navigation. Newline-delimited JSON — one message per line.

## Message Types

### Loader (`t: "l"`)

One per matched route. Sent immediately.

```ts
{
  d: unknown                /* loaderData — deferred markers preserved, promises stripped */
  m: string                 /* matchId */
  p?: Record<string, unknown>  /* preloaderContext (optional) */
  t: "l"
}
```

Deferred values in `d` serialized as `{ __deferred: true, key: "..." }` — `promise` field stripped.

### Chunk (`t: "c"`)

Sent after ready, as deferred promises resolve.

```ts
{
	d: unknown /* resolved data */
	k: string /* deferred key */
	m: string /* matchId (which route) */
	t: "c"
}
```

### Error (`t: "e"`)

Loader-level or deferred-specific error.

```ts
{
  e: { message: string }    /* error info — no stack trace */
  k?: string                /* deferred key (present = chunk error, absent = route error) */
  m: string                 /* matchId */
  t: "e"
}
```

### Head (`t: "h"`)

Per-route head config. Sent after loaders.

```ts
{
	d: HeadConfig /* head config for this route */
	m: string /* matchId (route ownership) */
	t: "h"
}
```

Per-route heads preferred — enables client to track which route owns which meta tags and clean up on navigation.

### Redirect (`t: "x"`)

Sent when pipeline produces a redirect. Replaces normal response.

```ts
{
  r?: boolean               /* replace flag (history.replaceState vs pushState) */
  s: number                 /* HTTP status (301-308) */
  t: "x"
  u: string                 /* target URL */
}
```

### Ready (`t: "r"`)

Signals loaders complete, safe to render. Chunks stream after this.

```ts
{
	t: "r"
}
```

### Done (`t: "d"`)

End of stream. All deferred settled.

```ts
{
	t: "d"
}
```

## Types

```ts
type NDJSONMessage =
	| { d: unknown; m: string; p?: Record<string, unknown>; t: "l" }
	| { d: unknown; k: string; m: string; t: "c" }
	| { e: { message: string }; k?: string; m: string; t: "e" }
	| { d: HeadConfig; m: string; t: "h" }
	| { r?: boolean; s: number; t: "x"; u: string }
	| { t: "r" }
	| { t: "d" }

interface NDJSONResponseConfig {
	deferContexts: Map<string, DeferContext>
	matches: PipelineMatch[]
}
```

### Request Headers

Client sets these to trigger NDJSON mode:

| Header | Value                    | Purpose                                    |
| ------ | ------------------------ | ------------------------------------------ |
| `x-d`  | `"1"`                    | Marks as CSR data request (enables NDJSON) |
| `x-m`  | comma-separated matchIds | Request specific routes only               |
| `x-p`  | `"1"`                    | Prefetch flag (cause = "prefetch")         |

Detection: `x-d === "1"` → data request → NDJSON. No HTML nav mode in v2.

## Exports

```ts
createNDJSONResponse(config: NDJSONResponseConfig): Response
createStreamingNDJSONResponse(config: NDJSONResponseConfig): Response
createRedirectNDJSONResponse(redirect: RedirectResponse): Response

formatLoaderMessage(match: PipelineMatch): string
formatChunkMessage(matchId: string, key: string, data: unknown): string
formatErrorMessage(matchId: string, error: Error, key?: string): string
formatHeadMessage(matchId: string, head: HeadConfig): string
formatRedirectMessage(url: string, status: number, replace?: boolean): string
formatReadyMessage(): string
formatDoneMessage(): string

serializeLoaderData(data: unknown): unknown
```

## Behavior

### `createNDJSONResponse`

Non-streaming. Used when no deferred promises exist.

Message order:

```
{loader for route1}\n
{loader for route2}\n
...
{head for route1}\n
{head for route2}\n
...
{done}\n
```

Returns `Response` with static body.

### `createStreamingNDJSONResponse`

Streaming via `ReadableStream` with `TextEncoder`. Used when deferred promises exist.

Message order:

```
{loader for route1}\n
{loader for route2}\n
{head for route1}\n
{head for route2}\n
{ready}\n
{chunk for deferred1}\n     ← as promises resolve
{chunk for deferred2}\n
{error for deferred3}\n     ← if promise rejects
{done}\n
```

Implementation:

```
new ReadableStream({
  async start(controller) {
    encoder = new TextEncoder()

    /* 1. Send loader messages */
    for each match:
      controller.enqueue(encoder.encode(formatLoaderMessage(match) + "\n"))

    /* 2. Send head messages */
    for each match with headConfig:
      controller.enqueue(encoder.encode(formatHeadMessage(matchId, headConfig) + "\n"))

    /* 3. Send ready */
    controller.enqueue(encoder.encode(formatReadyMessage() + "\n"))

    /* 4. Stream deferred chunks */
    chunkPromises = collect all DeferredEntries from deferContexts
    await Promise.allSettled(chunkPromises.map(async entry => {
      try:
        data = await entry.promise
        controller.enqueue(encoder.encode(formatChunkMessage(entry.matchId, entry.key, data) + "\n"))
      catch (error):
        err = error instanceof Error ? error : new Error(String(error))
        controller.enqueue(encoder.encode(formatErrorMessage(entry.matchId, err, entry.key) + "\n"))
    }))

    /* 5. Send done */
    controller.enqueue(encoder.encode(formatDoneMessage() + "\n"))
    controller.close()
  }
})
```

### `createRedirectNDJSONResponse`

Redirect-only response. Two messages: redirect + done.

```
{redirect}\n
{done}\n
```

### `serializeLoaderData`

Recursively walks loader data tree:

- `isDeferred(value)` → strip `promise` field, keep `{ __deferred: true, key }`
- Primitives → pass through
- Arrays → recurse each element
- Objects → recurse each value

### Response Headers

All NDJSON responses:

```
Content-Type: application/x-ndjson
Cache-Control: no-store
```

Streaming responses additionally:

```
Transfer-Encoding: chunked
```

### Error Routes in NDJSON

When a loader errored (match.status === "error"):

- Send `t: "e"` message instead of `t: "l"` for that route
- Other routes' loaders still sent normally
- Redirect errors: if match.error is RedirectResponse, create redirect response instead

## Test Cases

```
Message formatting:
  formatLoaderMessage → JSON with t:"l", m, d fields + newline-parseable
  formatChunkMessage → JSON with t:"c", m, k, d fields
  formatErrorMessage without key → { t:"e", m, e:{ message } }
  formatErrorMessage with key → { t:"e", m, e:{ message }, k }
  formatHeadMessage → { t:"h", d:HeadConfig, m }
  formatRedirectMessage → { t:"x", u, s, r? }
  formatReadyMessage → { t:"r" }
  formatDoneMessage → { t:"d" }
  All messages valid JSON (JSON.parse succeeds)

serializeLoaderData:
  Primitive → unchanged
  Object with no deferred → unchanged
  Object with Deferred → promise stripped: { __deferred: true, key }
  Nested deferred → found at depth: { a: { b: Deferred } }
  Array with deferred → serialized: [Deferred, "x"] → [{ __deferred, key }, "x"]
  null/undefined → pass through

createNDJSONResponse (non-streaming):
  Single route, no deferred → loader + head + done messages
  Multiple routes → one loader per route, ordered root → page
  Route with head → head message included
  Route without head → no head message for that route
  Content-Type: application/x-ndjson
  Cache-Control: no-store
  HTTP status 200

createStreamingNDJSONResponse:
  Loader messages sent immediately (before any await)
  Head messages sent after loaders
  Ready message sent after heads
  Chunk messages stream as promises resolve
  Error message for rejected deferred (with key)
  Done message after all settled
  Transfer-Encoding: chunked
  Multiple deferred across routes → all tracked, all stream

createRedirectNDJSONResponse:
  Only redirect + done messages
  Status from RedirectResponse
  URL from RedirectResponse
  replace flag preserved if true
  Cache-Control: no-store

Error handling:
  Loader error → t:"e" message with matchId, no key
  Deferred error → t:"e" message with matchId + key
  Error message only includes message string, no stack trace
  Multiple errors → each sent separately
  RedirectResponse in loader results → redirect response, not error message

Request header detection:
  x-d: "1" → NDJSON mode
  x-d: "1" → NDJSON (only data request format in v2)
  No x-d → NOT data request (initial page load → SSR)
  x-p: "1" → prefetch flag, cause = "prefetch"
  x-m: "a,b,c" → request only those matchIds

Edge cases:
  Empty matches array → just done message
  All loaders errored → error messages + done
  No deferred → non-streaming response (no ready message)
  Deferred resolves before ready sent → chunk still sent after ready
```

## Notes

- No `t:"q"` message in NDJSON — query client hydration uses `FlareState.q` (spec 25/33), not streaming
- Single-char message type keys for bundle size (`t`, `m`, `d`, `k`, `e`, `u`, `s`, `r`)
- `Promise.allSettled` for chunk streaming — ensures done is always sent even if promises reject
- Redirect detection: handler checks pipeline results before calling NDJSON — if any match has RedirectResponse, uses `createRedirectNDJSONResponse`
- Head sent per-route (with matchId) for client cleanup — not merged. Client merges if needed.
- If no per-route heads exist (no routes define `head()`), no `t:"h"` messages sent — client falls back to existing document head
- Non-streaming path exists as optimization — skip ReadableStream overhead when no deferred
- Stream error mid-flight doesn't crash response — caught per-chunk, sent as error message
- No custom queuing strategy needed — NDJSON messages are small (hundreds of bytes each), default `ReadableStream` backpressure is sufficient. Cloudflare Workers uses fixed internal buffering.
- `x-m` header for partial route loading — only requested routes sent loader data. Used when navigating within same layout (layout data already cached). When `x-m` is set: filter `matches` to only include matchIds listed in the header. Non-listed routes skipped entirely (no loader, head, or error messages). The done message always sent regardless of filtering.
