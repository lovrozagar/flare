# Direction

Layer 0.5 (pure, no Flare deps). Optional utility.

No-flash LTR/RTL direction switching with localStorage persistence and locale-based detection.

## Types

```ts
type Direction = "ltr" | "rtl";

interface DirectionConfig {
	attribute?: string; /* default: "data-dir" */
	defaultDir?: Direction; /* default: "ltr" */
	rtlLocales?: readonly string[]; /* default: ["ar", "he", "fa", "ur"] */
	storageKey?: string; /* default: "flare.dir" */
}
```

## Exports

```ts
/* Server / blocking <head> script */
getDirectionScript(opts?: DirectionConfig): string
getDirFromLocale(locale: string | undefined, rtlLocales?: readonly string[]): Direction

/* Client */
function DirectionProvider(props: { children: JSX.Element; config?: DirectionConfig }): JSX.Element
function useDirection(): DirectionContextValue

interface DirectionContextValue {
	direction: () => Direction
	getDirFromLocale: (locale: string | undefined) => Direction
	setDirection: (dir: Direction) => void
	toggleDirection: () => void
}
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
	if (!locale) return "ltr";
	const base = locale.split("-")[0]?.toLowerCase() ?? "";
	return rtlLocales.includes(base) ? "rtl" : "ltr";
}
```

### Client: DirectionProvider

Always provides context (SSR and hydrate), same pattern as ThemeProvider. During hydrate the signal starts at `defaultDir` so the tree matches SSR; `DirectionScript` already applied storage to `<html>` before first paint. After settle, `onSettled` syncs the signal from `localStorage`. Cross-tab `storage` listener attaches in `onSettled`.

There is no module-level `initDirection` / `setDirection` singleton.

### `useDirection().setDirection`

Updates signal, DOM attributes (`dir` + `data-dir`), and localStorage.

### Reactive Integration

Provider-scoped signal. Components read via `useDirection()`.

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

DirectionProvider / useDirection:
  Always provides context during hydrate (no pass-through)
  Hydrate initial signal is defaultDir (not localStorage)
  onSettled syncs signal from localStorage
  setDirection("rtl") → html[dir]="rtl", html[data-dir]="rtl"
  Persists to localStorage on change
  toggleDirection: ltr → rtl, rtl → ltr
  Throws if useDirection() is called outside DirectionProvider
```

## Notes

- Same pattern as theme — blocking `<head>` script for flash prevention
- `dir` attribute is native HTML — affects text alignment, flexbox direction, etc.
- `data-dir` is for CSS targeting: `[data-dir="rtl"] .sidebar { ... }`
- RTL locales list covers Arabic, Hebrew, Persian, Urdu — most common RTL languages
- Can be used with i18n middleware: middleware detects locale → sets `dir` on server context → serialized to FlareState → client reads
