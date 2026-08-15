# Styles

Layer 0 (pure, no internal deps except JSX types). Optional utility.

Type-safe scoped styles with state-based selectors, CSS variables, and server-rendered CSS injection.

## Types

```ts
interface StylesResult {
	"data-c": string;
	style?: JSX.CSSProperties;
	[key: `data-${string}`]: string;
}

interface StylesConfigFull<S extends Record<string, unknown>, V extends Record<string, unknown>> {
	css?: ((s: StateSelectors<S>, v: VarAccessors<V>) => string) | string;
	outerCss?: string;
	state?: S;
	style?: JSX.CSSProperties;
	tw?: string;
	vars?: V;
}

type StylesConfig<S, V> = StylesConfigFull<S, V> | string;

type StateSelectors<S> = {
	[K in keyof S]: (value: S[K]) => string;
};

type VarAccessors<V> = {
	[K in keyof V]: string;
};
```

## Exports

```ts
/* Main API */
styles<S, V>(name: string, config: StylesConfig<S, V>): StylesResult

/* Registry (internal, used by css= transform) */
registerCSS(css: string): string
registerCSSByName(name: string, css: string): void

/* SSR */
getScopedStyles(): string
clearScopedStyles(): void
```

## Behavior

### `styles()`

Returns spread-able attributes for JSX elements. CSS registered in style registry (not on element).

**Simple string:**

```tsx
<div {...styles("box", "padding: 1rem; background: blue")} />
/* → <div data-c="box"> + CSS: [data-c="box"] { padding: 1rem; background: blue } */
```

**With state:**

```tsx
const isActive = () => true
<div {...styles("btn", {
  state: { active: isActive() },
  css: (s) => `
    background: gray;
    ${s.active(true)} { background: blue }
  `
})} />
/* → <div data-c="btn" data-active="true">
 * CSS: [data-c="btn"] { background: gray }
 *      [data-c="btn"][data-active="true"] { background: blue } */
```

**With variables:**

```tsx
<div
	{...styles("item", {
		vars: { color: highlightColor() },
		css: (_, v) => `color: ${v.color}`,
	})}
/>
/* → <div data-c="item" style="--_0: red">
 * CSS: [data-c="item"] { color: var(--_0) } */
```

**With tw (Tailwind, build-time transformed):**

```tsx
<div
	{...styles("card", {
		tw: "flex gap-4 p-4",
		css: "color: red",
	})}
/>
/* tw is raw CSS after build transform. Prepended before css. */
```

**With outerCss (parent composition):**

```tsx
function Card(props: { outerCss?: string }) {
	return (
		<div
			{...styles("card", {
				tw: "p-4 rounded",
				outerCss: props.outerCss,
			})}
		/>
	);
}
/* outerCss appended after inner CSS (wins on conflicts) */
/* name hashed: "card-{hash}" for unique scoping */
```

### State Selectors

Proxy that generates CSS attribute selectors:

```ts
s.active(true)  → "&[data-active=\"true\"]"
s.size("lg")    → "&[data-size=\"lg\"]"
```

State values become `data-*` attributes on the element. CSS uses attribute selectors for state-based styling.

### CSS Variables

Proxy that generates `var()` references with indexed names:

```ts
v.color   → "var(--_0)"
v.bg      → "var(--_1)"
```

Variable values set as inline `style` on element: `--_0: red; --_1: blue`.

Indexed names (not named) for minimal CSS output size.

### CSS Scoping

`registerCSSByName(name, css)` scopes CSS with `[data-c="name"]`:

**Declarations** (no `&` or `@`): wrapped in `[data-c="name"] { ... }`

**Rules with `&`**: `&` replaced with `[data-c="name"]`:

```css
&:hover { color: red }  →  [data-c="name"]:hover { color: red }
&[data-x="1"] { ... }   →  [data-c="name"][data-x="1"] { ... }
```

**At-rules** (`@media`, `@keyframes`): rule wraps scoped content:

```css
@media (min-width: 768px) {
	padding: 2rem;
}
→ @media (min-width: 768px) {
	[data-c="name"] {
		padding: 2rem;
	}
}
```

### `registerCSS`

For `css=` prop transform. Hashes CSS content, generates unique `data-c` value:

```ts
function registerCSS(css: string): string {
	const hash = hashString(minify(css));
	registerCSSByName(hash, css);
	return hash;
}
```

### Style Registry

Internal `Map<string, string>` of `name → scoped CSS rule`.

**SSR**: `getScopedStyles()` returns all rules joined. Injected into `</head>` as `<style id="__FLARE_SCOPED__">`.

**Client**: On first `registerCSSByName` call, checks for `#__FLARE_SCOPED__` style tag. If found, parses existing rules to prevent duplicates. New rules injected via `CSSStyleSheet.insertRule()` or by appending to style element.

`clearScopedStyles()` resets registry. Called before each SSR render.

### outerCss Hashing

When `outerCss` provided, effective name becomes `${name}-${hash(outerCss)}`. This ensures unique scoping per outer CSS variant — same component with different parent overrides gets distinct rules.

## Test Cases

```
styles (simple string):
  Returns { "data-c": name }
  CSS registered with [data-c="name"] scope
  Empty string → registered (no-op CSS)

styles (config object):
  state → data-* attributes on result
  vars → style with --_N properties
  css string → scoped CSS registered
  css function → receives state selectors + var accessors
  tw → prepended before css
  outerCss → appended after inner CSS, name hashed
  style → merged with var styles

State selectors:
  s.active(true) → "&[data-active=\"true\"]"
  s.size("lg") → "&[data-size=\"lg\"]"
  State values → data-* attributes: { "data-active": "true" }

CSS variables:
  First var → var(--_0)
  Second var → var(--_1)
  Var values → inline style: { "--_0": value }

CSS scoping:
  Plain declarations → [data-c="name"] { declarations }
  &:hover rule → [data-c="name"]:hover { ... }
  &[data-x] rule → [data-c="name"][data-x] { ... }
  @media → @media (...) { [data-c="name"] { ... } }
  @keyframes → passed through unscoped
  Nested & → all replaced

registerCSS:
  Returns hash string
  Same CSS → same hash (deduped)
  Different CSS → different hash

SSR:
  getScopedStyles → all registered rules joined
  clearScopedStyles → resets registry
  Styles injected in <style id="__FLARE_SCOPED__">

Client hydration:
  Existing __FLARE_SCOPED__ → parsed, no duplicates
  New styles after hydration → appended to stylesheet
```

## Notes

- `data-c` attribute is the scoping mechanism — each styled element gets a unique or named scope
- State-based styling uses data attributes (not classes) — enables typed selectors and CSS specificity
- CSS variables use indexed names (`--_0`, `--_1`) not semantic names — smaller CSS output
- `tw` field is raw CSS after build-time Tailwind transform — runtime sees no Tailwind classes
- `outerCss` enables component composition: parent can pass style overrides that win on conflicts
- SSR renders all scoped styles into a single `<style>` tag — no FOUC
- Client hydration parses existing SSR styles to avoid duplicates when SPA navigation triggers re-registration
- No dependency on Flare router — `styles()` is a standalone utility
