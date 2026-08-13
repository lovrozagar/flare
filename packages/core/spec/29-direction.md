# Direction

Layer 0.5 (pure, no Flare deps). Optional utility.

No-flash LTR/RTL direction switching with localStorage persistence and locale-based detection.

## Types

```ts
type Direction = "ltr" | "rtl"

interface DirectionConfig {
	attribute?: string /* default: "data-dir" */
	defaultDir?: Direction /* default: "ltr" */
	rtlLocales?: readonly string[] /* default: ["ar", "he", "fa", "ur"] */
	storageKey?: string /* default: "flare.dir" */
}
```

## Exports

```ts
/* Server */
getDirectionScript(opts?: DirectionConfig): string

/* Client */
initDirection(opts?: DirectionConfig): void
setDirection(dir: Direction): void
getDirection(): Direction
toggleDirection(): void
getDirFromLocale(locale: string | undefined): Direction
getDirectionConfig(): Readonly<DirectionConfig>
```

## Behavior

### Flash Prevention

`getDirectionScript()` returns minified inline script for `<head>`:

1. Read direction from `localStorage[storageKey]`
2. Fallback: read `html[dir]` attribute (server-rendered)
3. Fallback: `defaultDir`
4. Set `html[data-dir]` and `html[dir]`

### `getDirFromLocale`

Extracts base language from locale string, checks against `rtlLocales`:

```ts
function getDirFromLocale(locale: string | undefined): Direction {
	if (!locale) return "ltr"
	const base = locale.split("-")[0]?.toLowerCase() ?? ""
	return rtlLocales.includes(base) ? "rtl" : "ltr"
}
```

### Client Init

`initDirection()`: merges config, syncs signal from DOM attribute.

### `setDirection`

Updates signal, DOM attributes (`dir` + `data-dir`), and localStorage.

### Reactive Integration

Module-level signal:

```ts
const [directionSignal, setDirectionSignal] = createSignal<Direction>("ltr")
```

`getDirection()` returns signal value (reactive in components).

## Test Cases

```
getDirectionScript:
  Returns minified inline script
  Script reads localStorage
  Script falls back to html dir attribute
  Script sets data-dir and dir attributes

getDirFromLocale:
  "ar" → "rtl"
  "he" → "rtl"
  "fa" → "rtl"
  "ur" → "rtl"
  "ar-SA" → "rtl" (base language extracted)
  "en" → "ltr"
  "fr" → "ltr"
  undefined → "ltr"
  "" → "ltr"

initDirection:
  Syncs signal from DOM dir attribute
  Idempotent: second call no-op
  SSR-safe: no-op without window

setDirection:
  "rtl" → html[dir]="rtl", html[data-dir]="rtl"
  "ltr" → html[dir]="ltr", html[data-dir]="ltr"
  Persists to localStorage
  Updates reactive signal

toggleDirection:
  "ltr" → "rtl"
  "rtl" → "ltr"
```

## Notes

- Same pattern as theme — blocking `<head>` script for flash prevention
- `dir` attribute is native HTML — affects text alignment, flexbox direction, etc.
- `data-dir` is for CSS targeting: `[data-dir="rtl"] .sidebar { ... }`
- RTL locales list covers Arabic, Hebrew, Persian, Urdu — most common RTL languages
- Can be used with i18n middleware: middleware detects locale → sets `dir` on server context → serialized to FlareState → client reads
