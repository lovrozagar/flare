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
/* Server / blocking <head> script */
getThemeScript(opts?: ThemeConfig): string

/* Client */
function ThemeProvider(props: { children: JSX.Element; config?: ThemeConfig }): JSX.Element
function useTheme(): ThemeContextValue

interface ThemeContextValue {
	resolvedTheme: () => ResolvedTheme
	setTheme: (theme: Theme) => void
	theme: () => Theme
	toggleTheme: () => void
}
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

### Client: ThemeProvider

Always provides context (SSR and hydrate). During hydrate the signal starts at `defaultTheme` so the tree matches SSR; `ThemeScript` already applied storage to `<html>` before first paint. After settle, `onSettled` syncs the signal from `localStorage`. Listeners (OS preference, cross-tab `storage`) attach in `onSettled`.

There is no module-level `initTheme` / `setTheme` singleton — all state lives in `<ThemeProvider>`.

### Theme Application

`useTheme().setTheme(theme)`:

1. Validate against `config.themes`
2. Resolve: `"system"` → `systemTheme`, others → as-is
3. If `disableTransitionOnChange`: inject `* { transition: none !important }` style, remove after reflow
4. Set `html[attribute]` and `html.style.colorScheme`
5. Persist to `localStorage`

Transition disable prevents jarring mid-animation color changes. Style injected, forced reflow, removed next frame.

### Reactive Integration

Provider-scoped signals. Components read via `useTheme()`.

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

ThemeProvider / useTheme:
  Always provides context during hydrate (no pass-through)
  Hydrate initial signal is defaultTheme (not localStorage)
  onSettled syncs signal from localStorage
  Detects system dark/light preference
  Listens for system preference change after settle
  setTheme("light") → html[data-theme]="light"
  Invalid theme (not in themes array) → no-op
  Persists to localStorage on change
  toggleTheme: resolved light → dark, dark → light
  Throws if useTheme() is called outside ThemeProvider
```

## Notes

- Script MUST be in `<head>` before stylesheets — any later and theme flash occurs
- `colorScheme` CSS property tells browser to use native dark mode for form controls, scrollbars, etc.
- `disableTransitionOnChange` prevents mid-transition artifacts when switching themes
- Theme state is provider-scoped (not a module singleton)
- No dependency on Flare internals — can be used standalone
