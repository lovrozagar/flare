# Head Client

Layer 4 (client). Depends on SSR (HeadConfig, mergeHeadConfigs), router-primitives (matchId).

Client-side `<head>` management. Tracks head elements per route, cleans up stale elements on navigation, applies merged head configs to DOM.

## Types

```ts
interface PerRouteHead {
	head: HeadConfig;
	matchId: string;
}
```

## Exports

```ts
applyPerRouteHeads(heads: PerRouteHead[]): void
applyHeadConfig(config: HeadConfig): void
initRouteHierarchy(matchIds: string[]): void
clearRouteTracking(): void
```

## Behavior

### Per-Route Head Tracking

Two-level tracking system:

1. **Global managed set**: `managedMetaTags: Set<string>` — selectors for all Flare-managed meta tags
2. **Per-route ownership**: `headByRoute: Map<string, Set<string>>` — which selectors belong to which route
3. **Route hierarchy**: `currentRouteHierarchy: string[]` — current match chain (matchIds, root → page)

### `initRouteHierarchy`

Called during hydration. Scans existing DOM for Flare-managed head elements and associates them with the deepest route.

```ts
function initRouteHierarchy(matchIds: string[]): void {
	currentRouteHierarchy = [...matchIds];

	/* Scan existing meta[name], meta[property] */
	for (const meta of document.head.querySelectorAll("meta[name], meta[property]")) {
		const selector = buildSelector(meta);
		managedMetaTags.add(selector);
	}

	/* Scan hreflang links */
	for (const link of document.head.querySelectorAll('link[rel="alternate"][hreflang]')) {
		managedHreflangLinks.add(link.getAttribute("hreflang"));
	}

	/* Associate all with deepest route */
	const deepestRoute = matchIds[matchIds.length - 1];
	if (deepestRoute) {
		headByRoute.set(deepestRoute, new Set([...managedMetaTags, ...extraSelectors]));
	}
}
```

### `applyPerRouteHeads`

Main navigation head update. Three-phase:

**Phase 1 — Determine removed routes:**

```ts
const newHierarchy = heads.map((h) => h.matchId);
const removed = currentRouteHierarchy.filter((r) => !newHierarchy.includes(r));
```

**Phase 2 — Clean up removed routes' head elements:**

```ts
for (const routeId of removed) {
	const selectors = headByRoute.get(routeId);
	if (selectors) {
		for (const selector of selectors) {
			document.head.querySelectorAll(selector).forEach((el) => el.remove());
			managedMetaTags.delete(selector);
		}
		headByRoute.delete(routeId);
	}
}
```

**Phase 3 — Apply new head configs with route tracking:**

```ts
for (const { head, matchId } of heads) {
	applyHeadConfigForRoute(matchId, head);
}
currentRouteHierarchy = newHierarchy;
```

### `applyHeadConfigForRoute`

Applies a single route's `HeadConfig` to DOM, tracking every created/updated element by selector.

Supported fields:

- `title` → `document.title` (not tracked per route, always overrides)
- `description` → `meta[name="description"]`
- `keywords` → `meta[name="keywords"]`
- `robots` → `meta[name="robots"]` (built from `RobotsConfig`)
- `canonical` → `link[rel="canonical"]`
- `meta.*` → individual `meta[name="..."]` tags
- `openGraph.*` → `meta[property="og:..."]` tags
- `twitter.*` → `meta[name="twitter:..."]` tags
- `jsonLd` → `script[type="application/ld+json"]`
- `languages` → `link[rel="alternate"][hreflang="..."]`
- `favicons.*` → `link[rel="icon"]` variants
- `custom.meta` → arbitrary meta tags
- `custom.scripts` → tracked by `script[src="..."]` selector
- `custom.links` → tracked by `link[rel][href]` selector

Each created/updated element's selector is added to `routeSelectors` set and `managedMetaTags` global set.

### `applyHeadConfig`

Flat application without route tracking. Used when per-route heads are unavailable. Same field handling as `applyHeadConfigForRoute` but with global cleanup:

After applying, removes stale meta tags:

```ts
for (const selector of managedMetaTags) {
	if (!currentMetaTags.has(selector)) {
		document.head.querySelectorAll(selector).forEach((el) => el.remove());
	}
}
```

### Element Update Strategy

For each head element:

1. Build selector from type + key (e.g. `meta[name="description"]`, `meta[property="og:title"]`)
2. Query existing element via selector
3. If exists: update content if different
4. If not exists: create element, append to `document.head`

Upsert pattern — no duplicate elements.

### Robots Content Builder

```ts
function buildRobotsContent(robots: RobotsConfig): string {
	const directives: string[] = [];
	if (robots.index === false) directives.push("noindex");
	else if (robots.index === true) directives.push("index");
	if (robots.follow === false) directives.push("nofollow");
	else if (robots.follow === true) directives.push("follow");
	if (robots.noarchive) directives.push("noarchive");
	if (robots["max-snippet"] !== undefined) directives.push(`max-snippet:${robots["max-snippet"]}`);
	/* ... */
	return directives.join(", ");
}
```

### Script Handling

Scripts are **additive only** — removing a `<script>` from DOM does NOT undo its JS effects (globals, event listeners persist). New scripts deduplicated by `src` attribute or content hash.

Per-route tracking allows cleanup of page-specific external scripts when navigating away. For cleanup of page-specific JS effects, use SolidJS lifecycle (`onSettled` / `onCleanup`).

## Test Cases

```
initRouteHierarchy:
  Sets currentRouteHierarchy from matchIds
  Scans meta[name] and meta[property] in DOM
  Scans hreflang links in DOM
  Associates all managed elements with deepest route
  SSR-safe: skips DOM scan if document unavailable

applyPerRouteHeads:
  Empty heads → removes all tracked elements from all routes
  Same hierarchy → updates in place, no removal
  Parent layout persists + page changes → only page elements removed
  New route adds elements → tracked under new matchId
  Removed route → its elements removed from DOM
  Title always updated (not route-tracked)

applyHeadConfig:
  Updates title if different
  Creates meta description if missing
  Updates meta description content if changed
  Creates og:title, og:description, og:image etc.
  Creates twitter:card, twitter:title etc.
  Updates canonical link href
  Creates JSON-LD script
  Creates hreflang links per language entry
  Cleans up stale meta tags from previous nav
  Cleans up stale hreflang links from previous nav

Element update strategy:
  Existing meta with same name → content updated
  New meta → element created and appended
  Existing link same href → not duplicated
  Multiple og:image → all created

Robots:
  { index: false } → "noindex"
  { index: true, follow: false } → "index, nofollow"
  { noarchive: true } → "noarchive"
  { max-snippet: 100 } → "max-snippet:100"

Favicon updates:
  ico → link[rel="icon"] with sizes="any"
  svg → link[rel="icon"][type="image/svg+xml"]
  appleTouchIcon → link[rel="apple-touch-icon"]
  Existing favicon same href → not duplicated
  Different href → updated

Custom elements:
  custom.meta → arbitrary meta created
  custom.scripts → external scripts deduplicated by src
  custom.styles → styles deduplicated by content
  custom.links → links deduplicated by rel+href

Route cleanup:
  Navigate /a → /b (different layout): /a layout head cleaned up
  Navigate /a/1 → /a/2 (same layout): layout head preserved, page head replaced
  Navigate /a → /b → /a: /a head re-created fresh
```

## Notes

- `data-flare-head` attribute NOT used in v2 — replaced by per-route ownership tracking via `headByRoute` Map
- Per-route tracking is more precise than v1's flat cleanup — layout head persists when only page changes
- `initRouteHierarchy` must run before first CSR navigation — ensures SSR-rendered head elements are trackable
- Title is deliberately NOT per-route tracked — deepest route's title always wins, no cleanup needed
- `managedMetaTags` tracks selectors (not elements) — elements may be replaced on update
- Hreflang links tracked separately from meta tags — different cleanup lifecycle
- JSON-LD scripts are route-tracked — page JSON-LD removed when navigating away
