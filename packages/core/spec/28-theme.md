# Theme

Layer 0.5 (pure, no Flare deps). Optional utility.

No-flash theme switching with localStorage persistence, system preference detection, and reactive signal.

## Types

```ts
type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeConfig {
	attribute?: string; /* default: "data-theme" */
	defaultTheme?: Theme; /* default: "system" */
	disableTransitionOnChange?: boolean; /* default: true */
	storageKey?: string; /* default: "flare.theme" */
	themes?: readonly Theme[]; /* default: ["light", "dark", "system"] */
}
```

## Exports

```ts
/* Server */
getThemeScript(opts?: ThemeConfig): string

/* Client */
initTheme(opts?: ThemeConfig): void
setTheme(theme: Theme): void
getTheme(): Theme
getResolvedTheme(): ResolvedTheme
toggleTheme(): void
getThemeConfig(): Readonly<ThemeConfig>
```

## Behavior

### Flash Prevention

`getThemeScript()` returns a minified inline script for `<head>`. Must run before any stylesheet to prevent theme flash.

Script logic:

1. Read theme from `localStorage[storageKey]` (fallback: `defaultTheme`)
2. If `"system"` → resolve via `matchMedia("(prefers-color-scheme:dark)")`
3. Set `html[data-theme]` attribute
4. Set `html.style.colorScheme` for native browser dark mode

```ts
function getThemeScript(opts?: ThemeConfig): string {
	const attr = opts?.attribute ?? "data-theme";
	const defaultTheme = opts?.defaultTheme ?? "system";
	const storageKey = opts?.storageKey ?? "flare.theme";
	return `((k,d,a)=>{const e=document.documentElement;let t;try{t=localStorage.getItem(k)||d}catch{t=d}if(t==="system")t=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";e.setAttribute(a,t);e.style.colorScheme=t})("${storageKey}","${defaultTheme}","${attr}")`;
}
```

Rendered in root layout's `<head>` inside `<NoHydration>`:

```tsx
<script nonce={nonce}>{getThemeScript()}</script>
```

### Client Init

`initTheme()` called once during app bootstrap. Merges config, detects system preference, listens for OS preference changes.

```ts
function initTheme(opts?: ThemeConfig): void {
	/* Detect system preference */
	const mq = matchMedia("(prefers-color-scheme: dark)");
	systemTheme = mq.matches ? "dark" : "light";

	/* Listen for changes */
	mq.addEventListener("change", (e) => {
		systemTheme = e.matches ? "dark" : "light";
		/* If using "system" theme, re-apply */
		const stored = localStorage.getItem(storageKey);
		if (stored === "system" || !stored) {
			applyTheme(systemTheme, false);
		}
	});
}
```

### Theme Application

`setTheme(theme)`:

1. Validate against `config.themes`
2. Resolve: `"system"` → `systemTheme`, others → as-is
3. If `disableTransitionOnChange`: inject `* { transition: none !important }` style, remove after reflow
4. Set `html[attribute]` and `html.style.colorScheme`
5. Persist to `localStorage`

Transition disable prevents jarring mid-animation color changes. Style injected, forced reflow, removed next frame.

### Reactive Integration

Module-level signal for component reactivity:

```ts
const [themeSignal, setThemeSignal] = createSignal<ResolvedTheme>("light");
```

Updated by `setTheme()`. Components read via `getResolvedTheme()`.

## Test Cases

```
getThemeScript:
  Returns minified inline script string
  Script reads localStorage
  Script handles "system" → matchMedia
  Script sets data-theme attribute
  Script sets colorScheme style
  Custom attribute → used in script
  Custom storageKey → used in script
  Custom defaultTheme → used in script

initTheme:
  Detects system dark preference
  Detects system light preference
  Listens for system preference change
  System change while using "system" theme → updates
  System change while using "dark" theme → no update
  Idempotent: second call no-op
  SSR-safe: no-op without window

setTheme:
  "light" → html[data-theme]="light", colorScheme="light"
  "dark" → html[data-theme]="dark", colorScheme="dark"
  "system" + OS dark → html[data-theme]="dark"
  Invalid theme (not in themes array) → no-op
  Persists to localStorage
  disableTransitionOnChange: true → transition disable applied

getTheme:
  Returns stored theme from localStorage
  No stored → returns defaultTheme
  localStorage unavailable → returns defaultTheme

getResolvedTheme:
  Returns current attribute value from DOM
  SSR-safe: returns "light"

toggleTheme:
  "light" → "dark"
  "dark" → "light"
```

## Notes

- Script MUST be in `<head>` before stylesheets — any later and theme flash occurs
- `colorScheme` CSS property tells browser to use native dark mode for form controls, scrollbars, etc.
- `disableTransitionOnChange` prevents mid-transition artifacts when switching themes
- Module-level signal means theme state is global (singleton per app)
- `initTheme` is idempotent — safe to call multiple times
- No dependency on Flare internals — can be used standalone
