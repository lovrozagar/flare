# Components

Layer 4 (client) / Layer 2 (SSR). SolidJS components for Flare streaming UI and optional `<head>` helpers.

There is no `<AppRoot>`, `<HeadContent>`, or `<HydrationScripts>` component. `hydrate()` targets the full `document`. Head tags, CSP nonce meta, theme/direction/locale scripts, `#flare-runtime` styles, `self.flare` state, and the entry module script are string-injected by `renderToStream` (`buildHeadPrefix` + `injectHeadContent`). Solid does not use `generateHydrationScript()` here.

Optional JSX helpers still exist for apps that render their own `<head>`: `ThemeScript`, `DirectionScript`, `ResetCSS`, `ViewTransitionCSS`. They read `useSSRContext()` and wrap in `<NoHydration>`.

### Robots Content Builder

Converts robots object to meta content string (used by the SSR head injector):

- `index: true` → "index", `index: false` → "noindex"
- `follow: true` → "follow", `follow: false` → "nofollow"
- `noarchive`, `noimageindex` flags
- `max-snippet`, `max-image-preview`, `max-video-preview` directives

## Await

Client. Renders deferred data with loading/error states.

### Types

```ts
interface Deferred<T> {
	__deferred: true;
	__error?: { message: string };
	__key?: string;
	__resolved?: T;
	promise: Promise<T>;
}

type AwaitStatus = "error" | "pending" | "success";

interface AwaitProps<T> {
	children: (data: T) => JSX.Element;
	error?: ((err: Error, reset: () => void) => JSX.Element) | null;
	pending?: JSX.Element;
	promise: Deferred<T> | Promise<T>;
}
```

### Exports

```ts
Await<T>(props: AwaitProps<T>): JSX.Element
isDeferred<T>(value): value is Deferred<T>
getPromise<T>(value): Promise<T>
getResolvedValue<T>(value): T | undefined
getResolvedError<T>(value): Error | undefined
```

### Behavior

Accepts `Deferred<T>` (from server `defer()`) or raw `Promise<T>`.

**SSR pre-resolution**: if `Deferred` has `__resolved`, renders immediately without waiting. If `__error`, renders error state immediately. Prevents flash on hydration.

**Client resolution**: tracks promise via signal. Race-condition safe — checks `currentPromise` identity before setting state.

**Reset**: `error` callback receives `reset` function that re-runs the promise.

```tsx
<Await promise={loaderData.reviews} pending={<Skeleton />}>
  {(reviews) => <ReviewList items={reviews} />}
</Await>

<Await
  promise={loaderData.reviews}
  pending={<Skeleton />}
  error={(err, reset) => <button onClick={reset}>Retry</button>}
>
  {(reviews) => <ReviewList items={reviews} />}
</Await>
```

## SSRContext

SSR data transport via `<SSRContextProvider value={...}>` wrapping the render tree. Solid 2 has no `sharedConfig.context`.

### Types

```ts
interface SSRContextValue {
	entryScript?: string;
	flareStateScript: string;
	isServer: boolean;
	nonce: string;
	resolvedHead?: HeadConfig;
}
```

### Exports

```ts
setSSRContext(value: SSRContextValue): void
useSSRContext(): SSRContextValue | undefined
SSRContextProvider(props: { children: JSX.Element; value: SSRContextValue }): JSX.Element
```

### Behavior

**`setSSRContext`**: deprecated no-op. Solid 2 removed `sharedConfig.context`; kept so existing imports do not break.

**`useSSRContext`**: reads `useContext(SSRCtx)`. Returns `undefined` outside a provider.

**`SSRContextProvider`**: wraps the SSR tree (`<SSRCtx value={...}>`). Production SSR and tests both use this provider.

## ThemeScript

SSR-only. Blocking inline script in `<head>` to prevent theme flash (FOUC).

### Types

```ts
type ThemeScriptProps = ThemeConfig;

interface ThemeConfig {
	attribute?: string; /* html attribute (default: "data-theme") */
	defaultTheme?: string; /* fallback theme (default: "system") */
	disableTransitionOnChange?: boolean; /* prevent mid-animation flash (default: true) */
	storageKey?: string; /* localStorage key (default: "flare.theme") */
	themes?: readonly string[]; /* valid themes (default: ["light", "dark", "system"]) */
}
```

### Behavior

```ts
function ThemeScript(props: ThemeScriptProps): JSX.Element;
```

**Server**: renders `<NoHydration><script nonce={nonce}>{themeScript}</script></NoHydration>`.

**Client**: returns null.

The inline script (from `getThemeScript(config)`) runs before body renders:

1. Read theme from localStorage
2. If none, use server-rendered attribute value or default
3. Apply to `<html>` element via attribute

Must be placed in `<head>` before stylesheets so CSS `[data-theme="dark"]` selectors apply before first paint.

## DirectionScript

SSR-only. Blocking inline script in `<head>` to prevent direction flash.

### Types

```ts
interface DirectionConfig {
	attribute?: string; /* html attribute (default: "data-dir") */
	defaultDir?: Direction; /* fallback direction (default: "ltr") */
	rtlLocales?: readonly string[]; /* RTL locale codes (default: ["ar", "he", "fa", "ur"]) */
	storageKey?: string; /* localStorage key (default: "flare.dir") */
}

type Direction = "ltr" | "rtl";
```

### Behavior

```ts
function DirectionScript(props: DirectionConfig): JSX.Element;
```

**Server**: renders `<NoHydration><script nonce={nonce}>{directionScript}</script></NoHydration>`.

**Client**: returns null.

The inline script (from `getDirectionScript(config)`) runs before body renders:

1. Read direction from localStorage
2. If none, use server-rendered `dir` attribute or default
3. Apply `dir` and data attribute to `<html>`

### Direction Utilities

```ts
getDirFromLocale(locale: string | undefined, rtlLocales?: readonly string[]): Direction
DirectionProvider / useDirection              /* spec 29 */
```

`getDirFromLocale` returns `"rtl"` for Arabic, Hebrew, Persian, Urdu based on the base locale code.

## ResetCSS

SSR-only. Renders baseline CSS reset in `<head>`.

```ts
function ResetCSS(): JSX.Element;
```

**Server**: renders `<NoHydration><style nonce={nonce}>{resetCss}</style></NoHydration>`.

**Client**: returns null.

Exports:

- `ResetCSS` — component for `<head>`
- `resetCss` — raw CSS string constant (for custom use)

## ViewTransitionCSS

SSR-only. Renders View Transitions API styles in `<head>`.

### Types

```ts
interface ViewTransitionCSSProps {
	duration?: number; /* animation duration in ms (default: 175) */
}
```

### Behavior

```ts
function ViewTransitionCSS(props: ViewTransitionCSSProps): JSX.Element;
```

**Server**: renders `<NoHydration><style nonce={nonce}>{css}</style></NoHydration>`.

**Client**: returns null.

Generated CSS:

```css
@view-transition {
	navigation: auto;
}
::view-transition-old(*),
::view-transition-new(*) {
	animation-duration: 175ms;
}
```

Custom `duration` generates CSS with the provided value.

Exports:

- `ViewTransitionCSS` — component for `<head>`
- `viewTransitionCss` — pre-built CSS string (175ms default)
- `getViewTransitionCss(duration: number)` — CSS string builder

## devErrorStore

Client-only, dev mode. Reactive error store for the dev overlay.

### Types

```ts
interface SerializedError {
	message: string;
	name: string;
	source: string;
	stack?: string;
}

interface CapturedError {
	dismissed: boolean;
	error: Error;
	id: string;
	source: string;
	timestamp: number;
}

interface DevErrorStore {
	clear: () => void;
	dismiss: (id: string) => void;
	errors: Accessor<CapturedError[]>;
	hasErrors: () => boolean;
	register: (error: Error | SerializedError, source?: string) => void;
}
```

### Behavior

Singleton stored on `globalThis` (survives HMR). Uses Solid `createSignal` for reactivity.

- `register(error, source?)` — adds error with deduplication (hash-based ID from name + message + source + stack prefix)
- `dismiss(id)` — marks error as dismissed (not removed — prevents re-registration flash)
- `clear()` — removes all errors
- `errors()` — reactive accessor for all captured errors
- `hasErrors()` — `true` if any non-dismissed errors exist

### Global Listeners

In dev mode (`import.meta.env.DEV`) on client:

- `window.addEventListener("error", ...)` — captures uncaught errors
- `window.addEventListener("unhandledrejection", ...)` — captures unhandled promise rejections

Both register to the store with source `"window.onerror"` / `"unhandledrejection"`.

### SSR Error Hydration

`FlareState.e` (spec 08) carries `SerializedError[]` from SSR. During hydration (spec 14), each entry is passed to `devErrorStore.register()` to surface SSR pipeline errors in the client overlay.

## DevErrorOverlay

Client-only, dev mode. Full-screen error modal.

```ts
function DevErrorOverlay(): JSX.Element;
```

- Renders via `<Portal mount={document.body}>` — outside app tree
- Reads from `devErrorStore` (reactive store)
- Escape key dismisses all errors
- HMR auto-clear: `import.meta.hot.on("vite:beforeUpdate", clear)`
- Per-error dismiss button
- Shows: error source, name, message, stack trace
- Inline CSS strings (not object styles) to avoid SSR-specific Solid exports

## Test Cases

```
Await:
  Pending → renders pending slot
  Resolved → renders children with data
  Error → renders error slot with reset
  Deferred with __resolved → immediate render
  Deferred with __error → immediate error render
  Raw Promise supported
  Reset re-runs promise
  Race condition: stale promise ignored

SSRContext:
  setSSRContext is a deprecated no-op
  useSSRContext reads SSRCtx from the component tree
  SSRContextProvider wraps the SSR tree

ThemeScript:
  SSR: renders blocking script with nonce
  SSR: wrapped in NoHydration
  Client: returns null
  Default config: attribute="data-theme", storageKey="flare.theme", defaultTheme="system"
  Custom config forwarded to getThemeScript

DirectionScript:
  SSR: renders blocking script with nonce
  SSR: wrapped in NoHydration
  Client: returns null
  Default config: attribute="data-dir", storageKey="flare.dir", defaultDir="ltr"
  getDirFromLocale("ar") → "rtl"
  getDirFromLocale("en") → "ltr"
  getDirFromLocale(undefined) → "ltr"

ResetCSS:
  SSR: renders <style> with nonce and resetCss content
  SSR: wrapped in NoHydration
  Client: returns null
  resetCss is a static string constant

ViewTransitionCSS:
  SSR: renders <style> with nonce
  SSR: wrapped in NoHydration
  Client: returns null
  Default duration 175ms
  Custom duration: ViewTransitionCSS({ duration: 300 }) → 300ms in CSS
  viewTransitionCss pre-built at 175ms
  getViewTransitionCss(200) → CSS string with 200ms

devErrorStore:
  register(Error) → adds to errors list
  register(SerializedError) → converts to Error, adds
  Duplicate error (same hash) → not added twice
  dismiss(id) → marks dismissed, still in list
  clear() → empties list
  errors() → reactive accessor
  hasErrors() → false when all dismissed
  hasErrors() → true when undismissed errors exist
  Global window.error listener → registers with source "window.onerror"
  Global unhandledrejection listener → registers with source "unhandledrejection"
  Singleton survives HMR (stored on globalThis)

DevErrorOverlay:
  Renders errors from devErrorStore
  Escape dismisses all
  Per-error dismiss
  HMR clears errors
  Portal renders outside app tree
  Hidden when no errors
```

## Notes

- `Await` supports both `Deferred` (server defer) and raw `Promise` — this is NDJSON defer UI, not Solid 2 async memos / `<Loading>`
- `Deferred.__resolved` / `__error` enable SSR→client state transfer without flash
- `DevErrorOverlay` uses inline CSS strings because `ssrStyleProperty` isn't in client bundles
- Hydration target is `document` (full document), not `#app`
- `ThemeScript` and `DirectionScript` are blocking `<head>` scripts — must run before first paint to prevent FOUC
- `ResetCSS` is a static string — no dynamic generation, exported as constant for custom injection
- `ViewTransitionCSS` pre-builds default CSS at import time — custom duration generates on render
- `devErrorStore` deduplicates by hash of name + message + source + stack prefix — prevents flood from repeated errors
- `devErrorStore.register()` accepts both `Error` (runtime) and `SerializedError` (from SSR `FlareState.e`)
- Optional `<head>` JSX helpers (`ThemeScript`, `DirectionScript`, `ResetCSS`, `ViewTransitionCSS`) use `<NoHydration>`
