# Components

Layer 4 (client) / Layer 2 (SSR). SolidJS components for Flare document structure and streaming.

## AppRoot

Container div with `id="app"` for hydration target.

```ts
type AppRootProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "id"> & {
	children: JSX.Element
}

function AppRoot(props: AppRootProps): JSX.Element
```

Renders `<div id="app" data-testid="app-root" {...rest}>{children}</div>`. Accepts all div attributes except `id` (always `"app"`). Uses `splitProps` to separate children.

## HeadContent

SSR-only. Renders `<head>` elements from resolved HeadConfig.

```ts
function HeadContent(): JSX.Element
```

**Server**: renders elements in order:

1. HydrationScript (Solid's `generateHydrationScript()` with nonce)
2. `<title>`
3. `<meta name="description">`
4. `<meta name="keywords">`
5. `<link rel="canonical">`
6. `<meta name="robots">` (built from robots object)
7. OpenGraph meta (`og:title`, `og:description`, `og:type`, `og:url`, `og:site_name`, `og:locale`, `og:image` with width/height/alt)
8. Twitter meta (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:site`, `twitter:creator`, `twitter:image` with alt)
9. JSON-LD structured data (`<script type="application/ld+json">`)
10. Hreflang links (`<link rel="alternate" hreflang>`)
11. Custom meta tags (name/content or property/content)

**Client**: returns null — head already in DOM from SSR. Client-side head managed by head-client module.

Reads context via `useSSRContext()` — accesses `resolvedHead` and `nonce`.

### Robots Content Builder

Converts robots object to meta content string:

- `index: true` → "index", `index: false` → "noindex"
- `follow: true` → "follow", `follow: false` → "nofollow"
- `noarchive`, `noimageindex` flags
- `max-snippet`, `max-image-preview`, `max-video-preview` directives

## HydrationScripts

SSR-only. Renders FlareState and entry client scripts.

```ts
function HydrationScripts(): JSX.Element
```

**Server**: wrapped in `<NoHydration>` to prevent hydration marker leakage into sibling elements.

Renders (when available):

1. `<script nonce={nonce}>{flareStateScript}</script>` — serialized `self.flare` state
2. `<script type="module" src={entryScript} nonce={nonce} />` — client entry point

**Client**: returns null.

`NoHydration` wrapper is critical — Solid's hydration context doesn't properly restore after sibling elements with nested boundaries.

## Await

Client. Renders deferred data with loading/error states.

### Types

```ts
interface Deferred<T> {
	__deferred: true
	__error?: { message: string }
	__key?: string
	__resolved?: T
	promise: Promise<T>
}

type AwaitStatus = "error" | "pending" | "success"

interface AwaitProps<T> {
	children: (data: T) => JSX.Element
	error?: ((err: Error, reset: () => void) => JSX.Element) | null
	pending?: JSX.Element
	promise: Deferred<T> | Promise<T>
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

SSR data transport via `sharedConfig.context` (not component tree).

### Types

```ts
interface SSRContextValue {
	entryScript?: string
	flareStateScript: string
	isServer: boolean
	nonce: string
	resolvedHead?: HeadConfig
}
```

### Exports

```ts
setSSRContext(value: SSRContextValue): void
useSSRContext(): SSRContextValue | undefined
SSRContextProvider(props: { children: JSX.Element; value: SSRContextValue }): JSX.Element
```

### Behavior

**`setSSRContext`**: stores context on `sharedConfig.context.flare` during `renderToStream` callback. No component tree provider needed.

**`useSSRContext`**: reads from `sharedConfig.context.flare` (SSR) or falls back to `useContext(SSRContext)` (testing).

**`SSRContextProvider`**: component provider for testing only. Production SSR uses `setSSRContext`.

Using `sharedConfig.context` instead of component tree avoids hydration mismatches from differing server/client tree structures.

## ThemeScript

SSR-only. Blocking inline script in `<head>` to prevent theme flash (FOUC).

### Types

```ts
type ThemeScriptProps = ThemeConfig

interface ThemeConfig {
	attribute?: string /* html attribute (default: "data-theme") */
	defaultTheme?: string /* fallback theme (default: "system") */
	disableTransitionOnChange?: boolean /* prevent mid-animation flash (default: true) */
	storageKey?: string /* localStorage key (default: "flare.theme") */
	themes?: readonly string[] /* valid themes (default: ["light", "dark", "system"]) */
}
```

### Behavior

```ts
function ThemeScript(props: ThemeScriptProps): JSX.Element
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
	attribute?: string /* html attribute (default: "data-dir") */
	defaultDir?: Direction /* fallback direction (default: "ltr") */
	rtlLocales?: readonly string[] /* RTL locale codes (default: ["ar", "he", "fa", "ur"]) */
	storageKey?: string /* localStorage key (default: "flare.dir") */
}

type Direction = "ltr" | "rtl"
```

### Behavior

```ts
function DirectionScript(props: DirectionConfig): JSX.Element
```

**Server**: renders `<NoHydration><script nonce={nonce}>{directionScript}</script></NoHydration>`.

**Client**: returns null.

The inline script (from `getDirectionScript(config)`) runs before body renders:

1. Read direction from localStorage
2. If none, use server-rendered `dir` attribute or default
3. Apply `dir` and data attribute to `<html>`

### Direction Utilities

```ts
getDirFromLocale(locale: string | undefined): Direction
initDirection(opts?: DirectionConfig): void
setDirection(dir: Direction): void
getDirection(): Direction                     /* reactive signal */
toggleDirection(): void
getDirectionConfig(): Readonly<DirectionConfig>
```

`getDirFromLocale` returns `"rtl"` for Arabic, Hebrew, Persian, Urdu based on the base locale code.

## ResetCSS

SSR-only. Renders baseline CSS reset in `<head>`.

```ts
function ResetCSS(): JSX.Element
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
	duration?: number /* animation duration in ms (default: 175) */
}
```

### Behavior

```ts
function ViewTransitionCSS(props: ViewTransitionCSSProps): JSX.Element
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
	message: string
	name: string
	source: string
	stack?: string
}

interface CapturedError {
	dismissed: boolean
	error: Error
	id: string
	source: string
	timestamp: number
}

interface DevErrorStore {
	clear: () => void
	dismiss: (id: string) => void
	errors: Accessor<CapturedError[]>
	hasErrors: () => boolean
	register: (error: Error | SerializedError, source?: string) => void
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
function DevErrorOverlay(): JSX.Element
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
AppRoot:
  Renders div with id="app"
  Passes through HTML attributes
  Renders children

HeadContent:
  SSR: renders HydrationScript with nonce
  SSR: renders title, description, keywords
  SSR: renders canonical link
  SSR: renders robots meta from object
  SSR: renders OpenGraph meta tags
  SSR: renders Twitter meta tags
  SSR: renders JSON-LD script
  SSR: renders hreflang links
  SSR: renders custom meta tags
  Client: returns null

HydrationScripts:
  SSR: renders flare state script with nonce
  SSR: renders entry client script as module
  SSR: wrapped in NoHydration
  SSR: returns null if no scripts
  Client: returns null

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
  setSSRContext stores on sharedConfig.context.flare
  useSSRContext reads from sharedConfig on server
  useSSRContext falls back to context provider
  SSRContextProvider works for testing

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

- `HeadContent` and `HydrationScripts` use `useSSRContext()` — server-only rendering, null on client
- `HydrationScripts` `NoHydration` wrapper prevents Solid hydration context corruption
- `Await` supports both `Deferred` (server defer) and raw `Promise`
- `Deferred.__resolved` / `__error` enable SSR→client state transfer without flash
- `DevErrorOverlay` uses inline CSS strings because `ssrStyleProperty` isn't in client bundles
- `AppRoot` `id="app"` must match hydration target in client init
- `ThemeScript` and `DirectionScript` are blocking `<head>` scripts — must run before first paint to prevent FOUC
- `ResetCSS` is a static string — no dynamic generation, exported as constant for custom injection
- `ViewTransitionCSS` pre-builds default CSS at import time — custom duration generates on render
- `devErrorStore` deduplicates by hash of name + message + source + stack prefix — prevents flood from repeated errors
- `devErrorStore.register()` accepts both `Error` (runtime) and `SerializedError` (from SSR `FlareState.e`)
- All `<head>` components (`ThemeScript`, `DirectionScript`, `ResetCSS`, `ViewTransitionCSS`, `HeadContent`, `HydrationScripts`) use `<NoHydration>` wrapper
