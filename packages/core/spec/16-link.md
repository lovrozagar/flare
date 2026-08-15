# Link

Layer 5. Depends on navigation (navigate, prefetch), outlet (useRouter, FlareProviderContext).

`<Link>` component for client-side navigation. Click interception, prefetch strategies, active state detection.

## Types

```ts
interface LinkProps<TPath extends RegisteredRoutes = RegisteredRoutes> {
	/* Navigation */
	to: TPath;
	hash?: string;
	replace?: boolean;
	scroll?: boolean;
	shallow?: boolean;
	viewTransition?: ViewTransitionConfig;

	/* Params — required if route has required params */
	/* params: RouteParams<TPath> (conditional via HasRequiredParams) */
	search?: RouteSearch<TPath>;

	/* Behavior */
	disabled?: boolean; /* renders <span> instead of <a> */
	force?: boolean; /* navigate even if same URL */
	prefetch?: PrefetchStrategy;

	/* Active state */
	activeClass?: string;
	inactiveClass?: string;
	isActive?: (location: Location) => boolean;

	/* Base styling */
	children: JSX.Element;
	class?: string;
	style?: JSX.CSSProperties | string;
	target?: string;

	/* All other HTML anchor attributes forwarded */
}

type PrefetchStrategy = false | "intent" | "render" | "viewport";
```

Same conditional params pattern as `NavigateOptions<TPath>` — `params` required when route has `[param]` segments.

## Exports

```ts
Link: (props: LinkProps) => JSX.Element;
```

## Behavior

### Rendering

`<Link>` renders a standard `<a>` element. Props forwarded to the anchor: `class`, `style`, `target`, `href`, plus any additional HTML attributes (`id`, `title`, `rel`, `download`, `aria-*`, `data-*`).

```tsx
<Link to="/products/[id]" params={{ id: "123" }} class="nav-link" activeClass="active">
  View Product
</Link>

/* Renders (href resolved from to + params): */
<a href="/products/123" class="nav-link">View Product</a>
/* When active: */
<a href="/products/123" class="nav-link active">View Product</a>
```

The `to` prop accepts a URL pattern (e.g. `/products/[id]`). `buildUrl({ to, params, search, hash })` resolves it to the final `href` attribute on the rendered `<a>`.

### Click Handler

Intercepts clicks for client-side navigation:

```ts
/* href = buildUrl({ to: props.to, params: props.params, search: props.search, hash: props.hash }) */

function handleClick(event: MouseEvent): void {
	/* Let browser handle if: */
	if (isExternal(href)) return;
	if (event.button !== 0) return; /* non-left click */
	if (event.metaKey || event.ctrlKey) return; /* new tab */
	if (event.shiftKey) return; /* new window */
	if (event.altKey) return; /* download */
	if (props.target === "_blank") return; /* explicit new tab */

	event.preventDefault();

	/* Same-URL guard — skip navigation unless force is set */
	if (!props.force && href === window.location.pathname + window.location.search + window.location.hash) return;

	navigate({
		replace: props.replace,
		scroll: props.scroll,
		shallow: props.shallow,
		to: href,
		viewTransition: props.viewTransition,
	});
}
```

Modifier keys let browser handle natively — Cmd+Click opens new tab, etc.

### External Link Detection

```ts
function isExternal(href: string): boolean {
	if (href.startsWith("http://") || href.startsWith("https://")) {
		const url = new URL(href);
		return url.origin !== window.location.origin;
	}
	if (href.startsWith("mailto:") || href.startsWith("tel:")) return true;
	return false;
}
```

- Same-origin absolute URLs (e.g. `https://myapp.com/about`) → intercepted
- Different-origin URLs → not intercepted, browser navigates normally
- `mailto:` / `tel:` → not intercepted

### Active State Detection

Reactive — updates when location changes.

**Default**: pathname match.

```ts
const active = createMemo(() => {
	if (props.isActive) {
		return props.isActive(ctx.location());
	}
	const url = new URL(href, window.location.href);
	return url.pathname === ctx.location().pathname;
});
```

**Class application**:

```ts
const classes = createMemo(() => {
	const result: string[] = [];
	if (props.class) result.push(props.class);
	if (active()) {
		if (props.activeClass) result.push(props.activeClass);
	} else {
		if (props.inactiveClass) result.push(props.inactiveClass);
	}
	return result.join(" ");
});
```

- `activeClass` applied when active
- `inactiveClass` applied when not active
- `class` always applied
- `isActive` callback overrides default pathname comparison

### Prefetch Strategies

Configured via `prefetch` prop. Inherits from route's `RouteMeta.prefetch` if not specified.

**Resolution order**:

1. `props.prefetch` (explicit on Link)
2. Target route's `RouteMeta.prefetch` (from route tree)
3. Default: `false` (no prefetch)

Target route resolved by matching `href` against route tree.

#### `prefetch="intent"`

Prefetch on user intent signals — mouseenter, focus, or touchstart:

- `mouseenter` — desktop hover intent
- `focus` — keyboard navigation (Tab)
- `touchstart` — mobile tap intent (passive listener)

All signals call `prefetch()` from navigation module. Deduplication handled by `prefetchCache.shouldPrefetch()`.

#### `prefetch="render"`

Prefetch immediately when Link component mounts. Fires via `queueMicrotask` in ref callback. Use for high-priority links the user is very likely to click.

#### `prefetch="viewport"`

Prefetch when link enters viewport:

```ts
let observer: IntersectionObserver | null = null;

onMount(() => {
	if (resolvedPrefetch() !== "viewport") return;
	if (isExternal(href)) return;

	observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					prefetch({ to: href });
					observer.unobserve(entry.target);
				}
			}
		},
		{ threshold: 0 },
	);
	observer.observe(anchorRef);
});

onCleanup(() => {
	observer?.disconnect();
});
```

- `threshold: 0` → triggers when any pixel visible
- `unobserve` after first intersection — prefetch once per mount
- Observer disconnected on component cleanup (route change, unmount)

#### `prefetch={false}`

No prefetch. Data fetched on navigation only.

### Disabled State

When `disabled={true}`, renders `<span>` instead of `<a>`:

```tsx
<span
	aria-disabled="true"
	class={computedClass()}
	role="link"
	style={computedStyle ? `cursor:not-allowed;${computedStyle}` : "cursor:not-allowed"}
	tabIndex={-1}
>
	{children}
</span>
```

- No click handler, no navigation
- No prefetch (hover or viewport)
- `aria-disabled="true"` + `role="link"` for accessibility
- `tabIndex={-1}` removes from tab order
- `cursor: not-allowed` prepended to any existing style
- Active state classes still computed (class/activeClass/inactiveClass apply)

Click handler also guards against disabled — `preventDefault` + return if `disabled` is true (defensive, since `<span>` has no default navigation).

### External Links

External links bypass all Flare behavior:

- No click interception
- No prefetch (hover or viewport)
- No active state detection
- Rendered as plain `<a>` with `href`

## Test Cases

```
Rendering:
  Renders <a> element with href
  class prop forwarded to anchor
  style prop forwarded
  target prop forwarded
  Additional HTML attributes forwarded (id, title, aria-*, data-*)

Click handling:
  Left click → preventDefault, navigate called
  Right click (button !== 0) → browser default
  Cmd+Click (metaKey) → browser default (new tab)
  Ctrl+Click (ctrlKey) → browser default (new tab)
  Shift+Click → browser default (new window)
  Alt+Click → browser default (download)
  target="_blank" → browser default
  replace: true → navigate({ replace: true })
  scroll: false → navigate({ scroll: false })
  shallow: true → navigate({ shallow: true })
  viewTransition: true → navigate({ viewTransition: true })
  Same URL, no force → navigation skipped
  Same URL, force: true → navigation proceeds
  Props forwarded: replace, scroll, shallow, viewTransition

External links:
  https://other-origin.com → browser default, no interception
  https://same-origin.com/path → intercepted (same origin)
  http://other.com → browser default
  mailto:x@y.com → browser default
  tel:+1234 → browser default
  /relative/path → intercepted
  #fragment → intercepted

Active state:
  href matches current pathname → active
  href does not match → not active
  activeClass applied when active
  inactiveClass applied when not active
  class always applied regardless of active state
  isActive callback overrides default behavior
  Active state reactive — updates on location change
  Search params ignored in default comparison (pathname only)
  Hash ignored in default comparison

Prefetch (hover):
  prefetch="intent" → mouseenter/focus/touchstart triggers prefetch
  Already prefetched → shouldPrefetch returns false, no duplicate
  External link → no prefetch
  Mouse leave before prefetch completes → prefetch continues (fire-and-forget)

Prefetch (viewport):
  prefetch="viewport" → IntersectionObserver created on mount
  Link enters viewport → prefetch triggered
  Observer unobserves after first intersection (no repeated prefetch)
  Link unmounts → observer disconnected
  External link → no observer created
  threshold: 0 (fires on any visibility)

Prefetch (false):
  prefetch={false} → no hover or viewport prefetch
  No onMouseEnter handler
  No IntersectionObserver

Prefetch resolution:
  Explicit props.prefetch → used
  No props.prefetch → inherit from route's RouteMeta.prefetch
  No route prefetch → default false

Disabled state:
  disabled={true} → renders <span> not <a>
  Span has aria-disabled="true", role="link", tabIndex={-1}
  Span has cursor:not-allowed style
  No click handler on span
  No prefetch on disabled link
  Class/activeClass/inactiveClass still computed
  disabled={false} → renders normal <a>
  disabled toggled → element changes between <a> and <span>

Edge cases:
  href changes → active state recomputed
  href changes with viewport prefetch → old observer disconnected, new one created
  Empty href → treated as current page
  Fragment-only href (#section) → intercepted, navigate called
```

## Notes

- `to` is the canonical prop name (matches `NavigateOptions.to`). Internally resolved to `href` via `buildUrl({ to, params, search, hash })` (spec 03). The `<a>` element renders the resolved `href` attribute.
- `<Link>` renders `<a>` by default, `<span>` when disabled — accessible either way via ARIA attributes
- Modifier key detection follows browser conventions (Cmd/Ctrl for new tab, etc.)
- External detection based on origin comparison, not protocol — same-origin HTTPS links intercepted
- Active state uses pathname comparison only (no search/hash) — use `isActive` for custom logic
- Prefetch is fire-and-forget — no loading state, no error surface on Link
- IntersectionObserver created once on mount — not re-created on prop changes (except href)
- `inactiveClass` enables styling for inactive state without `:not()` selectors
- No `onClick` override — Link's click handler is internal, additional click logic should use event delegation
