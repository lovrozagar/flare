# Preload

Layer 0 (pure, no internal deps). Optional utility.

Fire-and-forget module preloading for non-component code (utils, heavy libs). Single retry on failure.

## Types

```ts
interface PreloadOptions<T, R extends boolean = false> {
	loader: () => Promise<{ default: T }>;
	throws?: R; /* default: false */
}

interface PreloadResult<T, R extends boolean> {
	load: () => Promise<R extends true ? T : T | undefined>;
	preload: () => void;
	reset: () => void;
}
```

## Exports

```ts
preload<T, R extends boolean = false>(options: PreloadOptions<T, R>): PreloadResult<T, R>
```

## Behavior

### `preload()`

Factory that returns `{ load, preload, reset }`.

- `preload()` — fire-and-forget. Starts loading without waiting. Swallows errors (no unhandled rejection).
- `load()` — returns the default export. Starts loading if not cached. Returns cached promise if already loading/loaded.
- `reset()` — clears cached promise and retry counter. Allows fresh retry.

### Retry

Single automatic retry on failure (1s delay). After 2 attempts:

- `throws: true` → rejects with error
- `throws: false` (default) → resolves with `undefined`

Cache cleared on exhausted retries — next `load()` call starts fresh.

```ts
const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 2;
```

### Usage

```tsx
const pdfUtil = preload({
  loader: () => import("./heavy-pdf-util"),
  throws: true,
})

<button
  onMouseEnter={() => pdfUtil.preload()}
  onClick={async () => {
    const util = await pdfUtil.load()
    util.generatePDF(data)
  }}
>
  Export PDF
</button>
```

## Test Cases

```
preload (fire-and-forget):
  Starts loading without waiting
  No unhandled rejection on error
  Second call → no-op (cached)

load:
  Returns default export
  Caches promise across calls
  Concurrent calls → same promise

Retry:
  First failure → retries after 1s
  Second failure, throws: false → resolves undefined
  Second failure, throws: true → rejects with error
  Cache cleared after exhausted retries
  Next load() after exhaustion → fresh attempt

reset:
  Clears cached promise
  Next load() starts fresh
  Resets retry counter

Type safety:
  throws: true → load() returns T (no undefined)
  throws: false → load() returns T | undefined
  Default throws → T | undefined
```

## Notes

- Requires `default` export — consistent with `lazy()` / `clientLazy()`
- Module-level cache per `preload()` call — shared across all component instances
- No dependency on Flare internals — standalone utility
- 1s retry delay prevents immediate re-failure from transient network issues
- `throws: true` is useful for critical deps where fallback is impossible
