# @repo/flare-ui

Solid component library on [@solidports/base-ui](../../solid-ports/base-ui/) + Tailwind v4. ShadCN-parity API, OKLCH tokens, SSR-safe, RTL-aware.

Ships raw TSX — no build step, no dist/. Consumer Tailwind scans source directly.

---

## Install

```bash
bun add @repo/flare-ui
```

Peer deps: `solid-js ^1.9`, `tailwindcss ^4`, `@tailwindcss/vite ^4`.

---

## Required setup

Every consumer needs two things.

**1. Tailwind plugin in vite.config.ts**

```ts
import tailwindcss from "@tailwindcss/vite"
import solid from "vite-plugin-solid"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [solid(), tailwindcss()],
})
```

**2. App CSS entry**

```css
@import "tailwindcss";
@import "flare-ui/styles/theme.css";
@source "../node_modules/@repo/flare-ui/src";
```

The `@source` directive tells Tailwind to scan flare-ui TSX for utility classes. Without it, components render unstyled.

Monorepo / bun symlink alternative:

```css
@source "../../public/flare/ui/src";
```

---

## Theming

All design tokens live in `src/styles/tokens.css`. Override them after the import:

```css
@import "tailwindcss";
@import "flare-ui/styles/theme.css";
@source "../node_modules/@repo/flare-ui/src";

:root {
  --primary: oklch(0.6 0.24 260);
  --primary-fg: oklch(1 0 0);
  --radius: 0.375rem;
}
```

### Token model — 3 layers

**L1 — primitive palette**

12 neutral stops (`--neutral-0` … `--neutral-950`) + `--radius`. Only tokens that palette swaps actually need a primitive layer.

**L2 — semantic surface / brand / status**

25 color semantics. Surface + brand reference L1 via `var()`. Status colors (`--destructive`, `--success`, `--warning`, `--info`) declared directly with raw OKLCH — functional signals that don't theme-swap with neutrals.

```
--background / --foreground
--card / --card-fg
--popover / --popover-fg
--primary / --primary-fg
--secondary / --secondary-fg
--muted / --muted-fg
--accent / --accent-fg
--destructive / --destructive-fg
--success / --success-fg
--warning / --warning-fg
--info / --info-fg
--border
--input
--ring
```

**L3 — dark re-maps**

`.dark` re-maps semantic tokens only. Non-color tokens (radius, ring, z-index, fonts) are unchanged in dark mode.

---

## Dark mode

Toggle `.dark` on `<html>`:

```ts
document.documentElement.classList.toggle("dark")
```

`color-scheme: light / dark` is set per layer so native scrollbars and system UI follow automatically.

---

## Composition

Components follow the ShadCN composition model: each primitive is a separate named export, composed by the consumer.

```tsx
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "flare-ui/dialog"

function Example() {
  return (
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Body text.</DialogDescription>
      </DialogContent>
    </Dialog>
  )
}
```

All compound primitives have a `Content` wrapper that bakes the Portal + Positioner + Popup so consumers don't wire Base UI internals.

---

## Slot conventions

Base UI emits `data-*` state attributes — not class names. Style hooks use these attributes:

```
data-open            — popup/dialog/popover is open
data-highlighted     — menu/combobox item has keyboard focus
data-selected        — tab or radio item is active
data-checked         — checkbox/switch is on
data-disabled        — item is non-interactive
data-orientation     — "horizontal" | "vertical"
data-starting-style  — enter animation frame (replaces data-[state=open])
data-ending-style    — exit animation frame (replaces data-[state=closed])
data-panel-open      — collapsible/accordion panel expanded
data-popup-open      — trigger reports popup is open
```

All components accept a `class` prop. Port-backed components pass it through to Base UI's render pipeline so it participates in the state callback:

```tsx
<DialogContent class="max-w-lg" />
```

Consumer Tailwind utilities added via `class` are merged with component defaults via `cn()`.

---

## Icons

10 private icons ship with the library (`Check`, `ChevronDown`, `ChevronUp`, `ChevronLeft`, `ChevronRight`, `CircleCheck`, `Dot`, `Minus`, `Search`, `X`). They are not exported from the package index — they are internal to components.

Swap icons by overriding the relevant component. For example, `AccordionTrigger` renders a `ChevronDown` that rotates on open. Replace it by building a custom `AccordionTrigger` that composes `BaseAccordion.Trigger` with your own icon.

---

## Animation

Enter/exit animations use CSS transitions targeting `data-starting-style` and `data-ending-style` — the Base UI animation contract. Example from `dialog.tsx`:

```
data-[starting-style]:opacity-0 data-[ending-style]:opacity-0
```

`keyframes.css` ships 2 keyframes for height-based transitions (Accordion + Collapsible):

```
animate-accordion-down  — panel open, height 0 → var(--collapsible-panel-height)
animate-accordion-up    — panel close, height var(--collapsible-panel-height) → 0
```

`tw-animate-css` is not used — it targets Radix's `data-state` which Base UI does not emit.

---

## Z-index tiers

Semantic z-index tokens bridge to Tailwind utilities:

```
z-sticky   → 10   (sticky headers)
z-fixed    → 20   (fixed nav)
z-modal    → 30   (Dialog, AlertDialog, Sheet, Drawer)
z-popover  → 40   (Popover, Tooltip, HoverCard, DropdownMenu, ContextMenu, Select, Combobox)
z-toast    → 50   (Toast viewport)
```

Popover sits above modal so dropdowns/menus/tooltips opened from inside a Dialog render above its content.

---

## Barrel import

Import per-component subpaths only — no root barrel. Each component ships under its own subpath so unused components are dropped by the bundler at compile time.

```ts
import { Button } from "flare-ui/button"
import { Dialog, DialogContent, DialogTrigger } from "flare-ui/dialog"
import { cn } from "flare-ui/cn"
```

---

## Testing

Fixture app: `tests/fixture/` — plain Solid SPA, Tailwind v4, one route per component.

E2E: `tests/e2e/` — Playwright + axe-core.

- `a11y.spec.ts` — 42 routes × 2 directions × 2 themes (168 tests via AxeBuilder)
- `interactions/` — 23 compound specs (open/close, keyboard nav, escape, data attribute presence)

Run:

```bash
bunx playwright test
```
