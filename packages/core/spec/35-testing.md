# Testing

Layer 7 (tooling). Depends on `@playwright/test`. Optional — only for E2E tests.

Playwright page object for Flare E2E testing. Console/error capturing, hydration detection, CSR navigation verification.

## Types

```ts
interface ConsoleMessage {
	text: string
	type: "error" | "log" | "warning"
}

interface PageError {
	message: string
	stack?: string
}
```

## Exports

```ts
/* Extended Playwright test with flare fixture */
test: TestType<{ flare: FlarePage }>
expect: typeof import("@playwright/test").expect

/* Page object */
class FlarePage {
	readonly body: Locator
	readonly page: Page

	/* Lifecycle */
	startCapturing(): void
	clearCaptures(): void

	/* Navigation */
	goto(path?: string): Promise<Response | null>
	load(path: string): Promise<Response | null>
	waitForNavigation(path: string): Promise<void>
	clickLink(text: string): Promise<void>
	navigateNdjson(linkText: string): Promise<void>

	/* Hydration */
	waitForHydration(timeout?: number): Promise<void>

	/* State */
	getFlareState(): Promise<FlareState | null>
	assertFlareStateValid(): Promise<void>

	/* CSR detection */
	setNavigationMarker(): Promise<void>
	wasClientNavigation(): Promise<boolean>

	/* Response */
	getResponseHeaders(): Record<string, string>
	getLastResponse(): Response | null

	/* Captures */
	getConsoleLogs(): string[]
	getConsoleErrors(): string[]
	getConsoleWarnings(): string[]
	getPageErrors(): PageError[]
	getHydrationErrors(): string[]
	hasHydrationErrors(): boolean

	/* Assertions */
	assertNoConsoleErrors(ignorePatterns?: RegExp[]): void
	assertNoConsoleWarnings(ignorePatterns?: RegExp[]): void
	assertNoPageErrors(): void
	assertNoHydrationErrors(): void
	assertHealthy(): void
	assertFullyHealthy(): void
}
```

## Behavior

### Fixture

`test` extends Playwright's `base.extend` with a `flare` fixture. Auto-creates `FlarePage`, starts capturing on setup.

```ts
const test = base.extend<{ flare: FlarePage }>({
	flare: async ({ page }, use) => {
		const flarePage = new FlarePage(page)
		flarePage.startCapturing()
		await use(flarePage)
	},
})
```

### Console/Error Capturing

`startCapturing()` listens for `console` and `pageerror` events. Idempotent — second call is no-op.

Captures:

- Console messages (error, warning, log)
- Page errors (uncaught exceptions with stack traces)

### Navigation

- `goto(path)` — navigates, waits for body attached (15s timeout)
- `load(path)` — goto + waitForHydration + networkidle
- `navigateNdjson(linkText)` — sets CSR marker, clicks link, waits networkidle

### Hydration Detection

`waitForHydration()` polls for `data-hydrated` attribute on `<html>`. Set by Flare client after `solidHydrate()` completes. Uses `document.documentElement.hasAttribute("data-hydrated")` check.

### CSR Detection

`setNavigationMarker()` sets `window.__FLARE_NAV_MARKER__` = true. Survives client-side navigation, cleared on full page load. `wasClientNavigation()` checks if marker survived.

### FlareState Inspection

`getFlareState()` reads `self.flare` (the SSR-injected state object). In browser context, `self` === `window`.

`assertFlareStateValid()` validates:

- `state.p` exists as string (pathname)
- `state.r` exists as object (params)
- `state.c` exists (context)

### Health Assertions

- `assertHealthy()` = no hydration errors + no page errors + no console errors
- `assertFullyHealthy()` = assertHealthy + no console warnings
- `assertNoConsoleErrors(ignorePatterns)` — filters errors by regex patterns before asserting

### Hydration Error Detection

`hasHydrationErrors()` / `getHydrationErrors()` scan all errors for:

- "hydration" (case-insensitive)
- "mismatch" (case-insensitive)
- "Unable to find DOM nodes" (Solid-specific)

## Test Cases

```
FlarePage fixture:
  Auto-creates FlarePage from page
  Starts capturing on setup

Navigation:
  goto → body attached within 15s
  load → hydrated + networkidle
  navigateNdjson → CSR marker set, link clicked

Hydration:
  waitForHydration → resolves when html[data-hydrated] exists
  waitForHydration → times out if attribute never set

CSR detection:
  setNavigationMarker + CSR nav → wasClientNavigation true
  setNavigationMarker + full page load → wasClientNavigation false

Capturing:
  Console errors captured
  Console warnings captured
  Console logs captured
  Page errors captured with stack
  startCapturing idempotent
  clearCaptures resets all

Assertions:
  assertHealthy → passes on clean page
  assertHealthy → fails on console error
  assertHealthy → fails on page error
  assertHealthy → fails on hydration error
  assertNoConsoleErrors with ignorePatterns → skips matched
  assertFullyHealthy → fails on warning

FlareState:
  getFlareState → returns self.flare
  assertFlareStateValid → validates p/r/c structure
  assertFlareStateValid → throws if missing
```

## Notes

- `navigateHtml` removed in v2 — NDJSON only, no HTML nav mode
- `data-hydrated` attribute on `<html>` set by client init after hydration (spec 14)
- `__FLARE_NAV_MARKER__` is a window property trick — survives SPA nav, cleared on MPA nav
- Hydration error detection strings are Solid-specific
- `ignorePatterns` on assertNoConsoleErrors useful for known third-party warnings
- FlareState lives on `self.flare` (worker global) not `window.flare`
