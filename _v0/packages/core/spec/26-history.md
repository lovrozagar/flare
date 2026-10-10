# History

Layer 4 (client). Depends on nothing (pure browser APIs).

Browser history API integration. Manages history state, scroll position save/restore, popstate events, and LRU scroll store.

## Types

```ts
interface HistoryState {
	historyIndex: number; /* monotonic index for view transition direction */
	key: string; /* unique per entry, keys scroll store */
	params: Record<string, string | string[]>;
	pathname: string;
	scroll?: ScrollPosition; /* saved before navigation */
	search: string;
	state?: unknown; /* user-provided state via navigate({ state }) */
}

interface ScrollPosition {
	x: number;
	y: number;
}

interface HistoryNavigateEvent {
	historyIndex: number;
	key: string;
	params: Record<string, string | string[]>;
	pathname: string;
	scroll?: ScrollPosition;
	search: string;
	state?: unknown;
	type: "popstate";
}
```

## Exports

```ts
/* History state */
createHistoryState(pathname, params?, search?, options?): HistoryState
parseHistoryState(raw: unknown): HistoryState | null
pushHistoryState(pathname, params?, search?, options?): HistoryState
replaceHistoryState(pathname, params?, search?, options?): HistoryState

/* Popstate */
createHistoryListener(onNavigate: (event: HistoryNavigateEvent) => void): () => void

/* Scroll */
createScrollStore(maxSize?: number): ScrollStore
getCurrentScroll(): ScrollPosition
restoreScroll(position: ScrollPosition): void
scrollToTop(): void

/* History index (view transition direction) */
getHistoryIndex(): number
setHistoryIndex(index: number): void
incrementHistoryIndex(): void
initHistoryIndex(index: number): void
```

## Behavior

### History State

Each navigation creates a `HistoryState` stored via `history.pushState` or `history.replaceState`.

```ts
function createHistoryState(
	pathname: string,
	params: Record<string, string | string[]> = {},
	search = "",
	options?: { hash?: string; historyIndex?: number; state?: unknown },
): HistoryState {
	return {
		historyIndex: options?.historyIndex ?? 0,
		key: generateKey(),
		params,
		pathname,
		search,
		state: options?.state,
	};
}
```

Key generation: `${Date.now().toString(36)}-${counter.toString(36)}`. Unique per history entry. Used as scroll store key.

### `pushHistoryState` / `replaceHistoryState`

Create state and call `history.pushState` / `history.replaceState`. SSR-safe: no-op if `history` not available.

```ts
function pushHistoryState(pathname, params, search, options): HistoryState {
	const state = createHistoryState(pathname, params, search, options);
	const url = `${pathname}${search}${options?.hash ?? ""}`;
	if (typeof history !== "undefined") {
		history.pushState(state, "", url);
	}
	return state;
}
```

### `parseHistoryState`

Validates `popstate` event state. Returns `null` for non-Flare history entries (initial page load, external pushState).

Checks: `typeof state === "object"`, has `pathname` (string), has `key` (string).

### `createHistoryListener`

Registers `popstate` event listener. Returns cleanup function.

SSR-safe: if `addEventListener` not available, returns no-op.

Parses `event.state` via `parseHistoryState`. Ignores entries that don't parse (non-Flare entries).

### Scroll Store

LRU cache of scroll positions keyed by history entry key.

```ts
interface ScrollStore {
	get(key: string): ScrollPosition | null;
	save(key: string, position: ScrollPosition): void;
}
```

`createScrollStore(maxSize = 200)`:

- `save(key, position)`: if key exists, moves to end. Otherwise appends. Evicts oldest when over maxSize.
- `get(key)`: returns position or null. Does NOT update LRU order.

200 entries ≈ 20KB. Adequate for deep back/forward chains.

### Scroll Save/Restore Flow

**Before forward navigation:**

```ts
/* Save current scroll into scroll store */
const scroll = getCurrentScroll();
scrollStore.save(currentHistoryKey, scroll);
```

**After forward navigation (double rAF for paint):**

```ts
requestAnimationFrame(() => {
	requestAnimationFrame(() => {
		if (hash) scrollToHash(hash);
		else scrollToTop();
	});
});
```

**After popstate (back/forward):**

```ts
const savedScroll = scrollStore.get(event.key);
requestAnimationFrame(() => {
	requestAnimationFrame(() => {
		if (savedScroll) restoreScroll(savedScroll);
		else scrollToTop();
	});
});
```

Double `requestAnimationFrame`: first rAF schedules after current frame. Second rAF runs after browser has painted — DOM updates from signal changes are committed. Scroll position set on painted DOM.

### History Index

Module-level counter for view transition direction detection.

```ts
let currentIndex = 0;

function getHistoryIndex(): number {
	return currentIndex;
}
function setHistoryIndex(i: number): void {
	currentIndex = i;
}
function incrementHistoryIndex(): void {
	currentIndex++;
}
function initHistoryIndex(i: number): void {
	currentIndex = i;
}
```

Direction detection in view-transitions (spec 15/17):

- `popstate historyIndex < currentIndex` → "back"
- `popstate historyIndex > currentIndex` → "forward"
- Forward navigation always increments

### Manual Scroll Restoration

Set at navigation setup:

```ts
if ("scrollRestoration" in history) {
	history.scrollRestoration = "manual";
}
```

Disables browser's default scroll restoration. Framework manages scroll entirely.

## Test Cases

```
createHistoryState:
  Returns state with pathname, params, search, key, historyIndex
  Key is unique across calls
  Default params → {}
  Default search → ""
  Default historyIndex → 0
  User state passed through

pushHistoryState:
  Calls history.pushState with state and URL
  URL composed from pathname + search + hash
  Returns created HistoryState
  SSR-safe: no-op without history API

replaceHistoryState:
  Calls history.replaceState with state and URL
  Returns created HistoryState

parseHistoryState:
  Valid state → HistoryState
  null → null
  undefined → null
  No pathname → null
  No key → null
  Array → null
  Partial state → defaults for optional fields

createHistoryListener:
  Registers popstate handler
  Returns cleanup function
  Cleanup removes handler
  Valid state → onNavigate called with HistoryNavigateEvent
  Invalid state (non-Flare entry) → ignored
  SSR-safe: returns no-op cleanup

ScrollStore:
  save + get → returns position
  Unknown key → null
  LRU eviction: save 201 entries (max 200) → first evicted
  save existing key → moves to end (not evicted first)
  Multiple gets don't affect LRU order

getCurrentScroll:
  Returns { x: scrollX, y: scrollY }
  SSR-safe: returns { x: 0, y: 0 }

restoreScroll:
  Calls scrollTo(x, y)
  SSR-safe: no-op

scrollToTop:
  Calls scrollTo(0, 0)
  SSR-safe: no-op

History index:
  initHistoryIndex(5) → getHistoryIndex() === 5
  incrementHistoryIndex → getHistoryIndex() === 6
  setHistoryIndex(3) → getHistoryIndex() === 3
  Used for view transition direction: back (lower), forward (higher)
```

## Notes

- History state is Flare-specific — `parseHistoryState` rejects non-Flare entries gracefully
- `key` is the primary identifier for scroll restoration — not URL (same URL can have different scroll positions via back/forward)
- Scroll saved BEFORE `pushState` — captures position at moment of navigation
- Double rAF ensures scroll set after Solid's reactive updates paint
- `historyIndex` is monotonically increasing for forward nav, preserved on popstate — simple direction detection without URL comparison
- Initial SSR page: hydration calls `replaceHistoryState` with `historyIndex: 0`. This establishes the baseline for direction detection. First forward CSR navigation uses `historyIndex: 1` (incremented). Back button restores `historyIndex: 0` from history state → direction detected as "back" (0 < 1).
- `state` field in HistoryState is user-provided via `navigate({ state })` — opaque to Flare
- maxSize 200 is generous — typical session rarely exceeds 50 history entries
