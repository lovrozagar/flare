# Flare: The A.I. Framework for the Web

## Required Approach — TDD, Zero Tolerance

**Red → Code → Green. Always. No exceptions.**

All work MUST include both new vitest unit tests AND playwright E2E tests. Write tests first (red), implement (code), confirm green. NEVER skip. NEVER be lazy.

**After implementation:**

1. Run ALL unit tests — confirm green
2. Run ALL E2E tests — confirm green
3. If anything fails — fix it before reporting done

**Absolute zero false-positive tolerance.** Do not report done unless both test suites pass fully. If tests are not written and green-confirmed, work is not done. Continue.

```bash
# Unit tests (vitest) — public/flare/tests/
bun run --cwd /home/ecomet/Development/monorepo/public/flare test

# Dev E2E (playwright) — public/flare-e2e/
cd /home/ecomet/Development/monorepo/public/flare-e2e && bunx playwright test

# Prod E2E (playwright, specific files)
cd /home/ecomet/Development/monorepo/public/flare-e2e && TEST_MODE=prod bunx playwright test
```

---

## Thesis

Builder pattern = structured slot-filling. Single-file routes = atomic operations. CLI generates deterministically, TypeScript validates, AI or human — same tool. Nobody else does this.

## Unfair Advantages (Already Built)

1. **Single-expression routes** — entire feature in one builder chain, no cross-file coordination
2. **Composable methods** — `.loader()`, `.cache()`, `.authenticate()` independently addable = additive generation
3. **Types as proof** — each builder method narrows the next method's types, invalid states impossible
4. **Codegen handles wiring** — routes.gen.ts, server-fn map, module preloads. Zero manual imports.

## AI Speed Multipliers

### Why Flare + AI = fastest path from idea to production

**1. Intent → CLI → Done (no code generation needed)**

Other frameworks: AI reads docs → reasons about conventions → generates 3-7 files → hopes they wire together → debug.

Flare: AI translates intent to CLI commands. Period.

```
User: "I need a product catalog with admin CRUD"
AI runs:
  flare gen resource products --crud
  flare add cache /products --isr 60
  flare add auth /products/new /products/[id]/edit
  flare add head /products /products/[id]
→ 3 routes, 3 server fns, caching, auth, SEO. Zero hand-written code yet.
```

Then AI only writes the parts that are unique: render functions (JSX) and loader queries. Everything structural is handled.

**2. Additive, never destructive**

Other frameworks: adding auth means refactoring loader, adding wrapper component, updating layout, touching 4 files.

Flare: `flare add auth /products` → inserts `.authenticate("required")` into the builder chain. Existing code untouched. Works on 1 route or 50 routes.

This means AI never needs to understand existing code to enhance it. Just declare what to add.

**3. Zero-hallucination generation**

AI hallucination happens when generating framework-specific code from memory. With Flare:

- `flare gen` outputs correct builder chains (template-based, not AI-generated)
- `flare add` inserts correct method calls (AST transform, not AI-generated)
- AI only writes business logic (JSX, queries) — the universal parts that don't hallucinate

The framework-specific code is never AI-generated. It's CLI-generated. AI just decides WHICH commands to run.

**4. Instant verification loop**

```
flare validate --json → structured errors with fix commands → AI executes fixes → flare validate → green
flare validate --fix  → auto-fix everything fixable in one pass
```

No human in the loop. AI generates, validates, fixes, ships. Self-healing.

**5. Parallel generation, zero conflicts**

Single-file routes = AI generates 10 routes simultaneously with zero merge conflicts. Each route is self-contained. No shared files to coordinate.

Other frameworks: AI generates page.tsx, but needs to also update layout.tsx, add to routes config, create loader file, create action file → serialized, conflict-prone.

**6. Batch operations**

```bash
flare add cache /dashboard /products /orders --isr 60     # cache 3 route trees at once
flare add auth /dashboard /settings /admin                 # protect 3 areas at once
flare gen resource products orders customers --crud        # 3 resources, 9 routes, 9 server fns
```

One command = N routes. AI doesn't loop — it batches.

**7. Schema-to-app pipeline**

```bash
flare init --from schema.ts
```

User describes data model in natural language → AI generates Zod schemas → Flare generates full CRUD app.

```
"I need a project management tool with projects, tasks, and team members"
→ AI writes schema.ts (3 Zod objects)
→ flare init --from schema.ts
→ 9 routes (3 resources x list/detail/form) + 9 server fns + dashboard + settings
→ AI customizes render functions
→ Ship
```

Natural language → working app. The bottleneck is Zod schema generation (trivial for AI) not route/handler wiring (hard for AI, free with Flare).

**8. Version-proof AI**

Bundled docs in `node_modules/flare/docs/` = AI always reads correct API for YOUR version. No "sorry, my training data might be outdated." Next.js does this too (v16.2+) — table stakes, must ship.

**9. One command: working → production-ready**

```bash
flare validate --fix
```

Checks types, structure, conventions, production best practices — auto-fixes everything with `flare add` commands. Missing error boundaries? Added. Public routes without cache? SSG applied. No head tags? Stubs inserted. One command, full pass.

**10. Prompt-to-CLI translation is trivially learnable**

The AI doesn't need to learn Flare internals. It needs to learn ~15 CLI commands. That's it. Compare:

- Next.js: learn App Router conventions, file naming, server/client boundaries, metadata API, cache semantics, parallel routes, intercepting routes...
- Flare: learn `flare gen`, `flare add`, `flare check`. Done.

The knowledge surface for AI is 10x smaller. Smaller surface = fewer mistakes = faster shipping.

---

## Competitive Gap

|                    | AI Context                        | MCP                           | CLI Gen              | Additive Gen             |
| ------------------ | --------------------------------- | ----------------------------- | -------------------- | ------------------------ |
| Next.js            | AGENTS.md + bundled docs (v16.2+) | In progress                   | create-next-app only | No                       |
| Nuxt               | None                              | Experimental (antfu/nuxt-mcp) | None                 | No                       |
| Svelte/Remix/Astro | None                              | None                          | None                 | No                       |
| Angular            | None                              | None                          | ng generate (mature) | No                       |
| **Flare**          | **Ship**                          | **Wrap CLI**                  | **`flare gen`**      | **`flare add` (unique)** |

**What breaks AI codegen today**: cross-file coordination, magic conventions, split concerns, implicit wiring, version drift. Flare eliminates all five by design.

**Open lane**: nobody positions as "AI-first framework." Next.js teaches AI their conventions. Flare eliminates conventions — builder IS the convention, CLI IS the generator, TS IS the validator.

---

## AI Context File Formats (All Tools)

| Tool        | Path                              | Key                                                     |
| ----------- | --------------------------------- | ------------------------------------------------------- |
| Cross-tool  | `AGENTS.md`                       | Linux Foundation standard, read by all                  |
| Cursor      | `.cursor/rules/*.mdc`             | YAML frontmatter: `globs`, `alwaysApply`, `description` |
| Claude Code | `CLAUDE.md`, `.claude/rules/*.md` | `paths:` frontmatter, @import, 200 line limit           |
| Windsurf    | `.windsurf/rules/*.md`            | 12K char limit, 4 activation modes                      |
| Copilot     | `.github/copilot-instructions.md` | Also reads AGENTS.md + CLAUDE.md now                    |
| Cline       | `.clinerules/*.md`                | Also reads .cursorrules, AGENTS.md                      |

---

## CLI Design — `flare`

### `flare gen` — scaffold

```bash
flare gen resource products           # list + detail + form (3 routes)
flare gen resource products --crud    # + server fns (create/update/delete)
flare gen resource products --crud --test  # + unit tests for server fns + e2e smoke tests
flare gen resource products orders customers --crud  # batch: 3 resources at once
flare gen dashboard /admin            # auth layout + overview
flare gen settings /settings          # tabbed layout + sections
flare gen marketing /                 # SSG landing + pricing + about
flare gen auth /                      # login + signup + forgot-password
flare gen page /custom                # bare page builder chain
flare gen layout /app                 # layout with render
flare gen server-fn getUser           # server fn + Zod input
```

**`--json` output for AI handoff** — every `flare gen` command can output structured results:

```bash
flare gen resource products --crud --json
```

```json
{
	"generated": [
		"src/routes/(app)/products/products-page.tsx",
		"src/routes/(app)/products/[id]/product-detail-page.tsx",
		"src/routes/(app)/products/[id]/edit/product-edit-page.tsx",
		"src/server-fns/products.ts"
	],
	"customize": [
		{ "file": "...products-page.tsx", "method": "loader", "hint": "query products list" },
		{ "file": "...products-page.tsx", "method": "render", "hint": "product table/grid UI" },
		{
			"file": "...product-detail-page.tsx",
			"method": "loader",
			"hint": "query single product by id"
		},
		{ "file": "...product-detail-page.tsx", "method": "render", "hint": "product detail UI" },
		{ "file": "...products.ts", "fn": "createProduct", "hint": "implement create mutation" },
		{ "file": "...products.ts", "fn": "updateProduct", "hint": "implement update mutation" },
		{ "file": "...products.ts", "fn": "deleteProduct", "hint": "implement delete mutation" }
	],
	"next": "flare codegen"
}
```

AI reads `customize` → knows exactly which files and methods need business logic. No file exploration needed. The `next` field tells AI what command to run after.

**`--test` flag** — generates tests alongside routes:

```bash
flare gen resource products --crud --test
```

Generates:

- `tests/unit/server-fns/products.test.ts` — unit tests for create/update/delete server fns
- `e2e/products.test.ts` — smoke tests: list loads, detail loads, form submits, 404 on missing

Rails has shipped scaffold tests since 2004. Proven pattern. Completes the generate → test → validate loop.

### `flare add` — the differentiator

Nobody does this. Builder chains are independently composable = CLI can inject methods into existing routes:

```bash
flare add auth /products              # .authenticate("required") on all /products/*
flare add cache /products --isr 60    # .cache({ isr: { revalidate: 60 } })
flare add cache /about --ssg          # .cache({ ssg: true })
flare add loader /products/[id]       # .loader() stub
flare add head /products/[id]         # .head() with title/description
flare add input /products/[id]        # .input({ params: z.object({...}) })
flare add error-boundary /products    # .errorRender() + .notFoundRender()
flare add auth /products /orders /customers  # batch: multiple route trees
```

**Why this works**: builder methods are order-independent in the chain. AST transform inserts at correct position. Deterministic — no hallucination possible.

**Context-aware stubs**: `flare add` reads the existing chain. If route already has `.input({ params: z.object({ id: z.string() }) })`, then `flare add loader` generates a stub with `ctx.location.params.id` already typed. Not blind templates — stubs that match what's already there.

### `flare add font` — self-hosted Google Fonts with zero-CLS

Interactive font picker with search, category browsing, and locale-aware subset selection.

```bash
flare add font                        # interactive: search/browse, select fonts + subsets
flare add font inter                  # non-interactive: download Inter, auto-detect subsets
flare add font inter roboto           # batch: multiple fonts
flare add font inter --subsets latin,cyrillic  # explicit subsets
```

**Interactive flow:**

```
$ flare add font

◆ Search fonts (or browse by category)
│ inter
│
◇ Results:
│  ● Inter — sans-serif, variable 100-900, latin + cyrillic + greek + vietnamese
│  ○ Inter Tight — sans-serif, variable 100-900, latin + latin-ext
│
◆ Select fonts (space to toggle, enter to confirm)
│  ◼ Inter
│  ◻ Inter Tight
│
◆ Which subsets? (auto-detected from your locales: en)
│  ◼ latin (required)
│  ◻ latin-ext
│  ◻ cyrillic
│  ◻ greek
│  ◻ vietnamese
│
◇ Downloading Inter...
│  public/fonts/inter/latin.woff2
│  public/fonts/inter/latin-ext.woff2
│
◇ Done!
│
│  import { inter } from "flare/fonts/inter"
│  import { FontCSS } from "flare/fonts"
│
│  <FontCSS font={inter} subsets={["latin"]} />
│
└  Added Inter to public/fonts/inter/
```

**Category browsing:**

```
◆ Browse fonts
│  ○ Sans-serif (42)
│  ○ Serif (38)
│  ○ Monospace (12)
│  ○ Display (18)
│
│  [or type to search]
```

**Smart defaults:**

- Auto-detect locales from router config → pre-select relevant subsets
- If no locales configured → default to latin
- Show font info: weights (variable range or static list), subset coverage, category

**What it does:**

1. Reads font metadata from `flare/fonts` registry (offline, no API call)
2. Downloads WOFF2 files from Google Fonts CDN → `public/fonts/<slug>/`
3. Prints usage snippet with correct import + component

### `flare remove` — clean inverse of gen

```bash
flare remove /products                # removes route files + server fns + tests
flare remove /products --keep-fns     # remove routes, keep server fns
flare remove /products --dry-run      # show what would be deleted
```

Every `flare gen` has a clean `flare remove`. No orphaned files, no dead imports. Also updates `flare.plan.json` if it exists.

### `flare rename` — refactor without breakage

```bash
flare rename /products /items         # rename route path + files + exports + plan
flare rename /products /dashboard/products  # move under different layout
flare rename --resource products items      # rename resource name everywhere
```

Renames route files, updates builder path strings, re-runs codegen. Server fns, tests, plan file — all updated. AI can refactor fearlessly.

### `flare codegen` — run route/type generation without Vite

Same codegen the Vite plugin runs on dev server start — standalone, no dev server needed.

```bash
flare codegen                         # scan routes, generate routes.gen.ts + types
```

Generates `_gen/routes.gen.ts` + `_gen/virtual.gen.d.ts`. Uses same `generators/index.ts` regex scanner the plugin uses, extracted to shared module.

**Auto-runs after every mutation command.** `flare gen`, `flare add`, `flare remove`, `flare rename` all auto-run codegen. Standalone `flare codegen` only needed when you hand-edit route files outside the CLI.

```bash
flare gen resource products --crud    # creates route files + auto-runs codegen
flare validate                        # typecheck passes — already wired
```

### `flare status` — project health at a glance

```bash
flare status
```

```
Flare v0.1.0 | 23 routes | 8 server fns

Routes:     15 authenticated, 8 public
Cache:      12 ISR, 5 SSG, 6 SSR
Issues:     2 missing error boundaries, 3 public routes without head
Plan:       in sync
Codegen:    up to date
Types:      clean
```

AI runs this first. Knows entire project state in one call. `--json` for machine-readable.

### `flare routes` — inspect

```bash
flare routes                          # table: path, type, cache, auth
flare routes --json                   # machine-readable manifest
flare route /products/[id]            # builder chain, types, deps
```

### `flare validate` — verify everything

```bash
flare validate                        # types + structure + best practices
flare validate --json                 # machine-readable errors with fix commands
flare validate --fix                  # auto-fix what's fixable
```

See [validate section](#flare-validate--structure--best-practice-checks) for full details.

### `flare init` — interactive smart setup

Not just scaffolding — an opinionated setup wizard that asks what you're building and configures everything.

```bash
flare init
```

```
? What are you building?
  > SaaS app
    Blog / content site
    Marketing site
    API-only
    Custom

? App name: acme-dashboard

? Locales? (select multiple)
  > en (default)
    hr
    fr
    de
    [custom]

? Authentication?
  > Yes — cookie-based sessions
    Yes — JWT
    No

? Caching strategy?
  > ISR (recommended for most apps)
    SSG (static, rebuild on change)
    SSR only (no cache)
    Mixed (configure per route)

? Styling?
  > Tailwind CSS
    CSS modules
    None

? Features (select multiple)
  > [x] Keepalive (layout persistence)
    [x] View transitions
    [x] Scroll restoration
    [x] Theme (dark/light)
    [ ] Direction (RTL support)
    [ ] Base path

? Default cache settings?
  > Client prefetch: viewport
    Client staleTime: 60s
    ISR revalidate: 60s
    [customize]

→ Generated:
  package.json          (deps: flare, solid-js, solid-query + devDeps: vite, vite-plugin-solid, ts, tailwind)
  tsconfig.json         (strict, ESNext, bundler, solid-js JSX)
  vite.config.ts        (flare plugin with selected features)
  wrangler.jsonc        (Cloudflare Workers config)
  src/server.ts         (createServer with keepalive)
  src/client.tsx        (createClient with router)
  src/router.ts         (createRouter with cache, layouts, routeTree, viewTransitions)
  src/routes/_root_/root-layout.tsx     (or [[locale]]/_root_/ with preloader)
  src/routes/_root_/index/index-page.tsx (with cache + head + render)
  + locale segment if locales selected

  SEO & PWA baseline (Lighthouse-ready out of the box):
  public/robots.txt                     (User-agent, Allow, Sitemap)
  public/site.webmanifest               (PWA manifest with icon refs)
  public/favicon.svg                    (placeholder SVG ⚡)
  public/favicon.ico                    (32x32 placeholder ICO)
  public/favicon-96x96.png              (placeholder PNG)
  public/apple-touch-icon.png           (180x180 placeholder PNG)
  public/web-app-manifest-192x192.png   (placeholder PNG)
  public/web-app-manifest-512x512.png   (placeholder PNG)
  public/.well-known/security.txt       (RFC 9116 security contact)

  Root layout .head() includes:
  - description, favicons (ico/svg/96x96/apple-touch), manifest link
  - openGraph (siteName, type), twitter (card), robots (index/follow)
  - charset, viewport

  Per-page .head() includes:
  - title, description, openGraph (title, type)
```

Every option has a smart default. AI can also pass flags non-interactively:

```bash
flare init --type saas --locale en,hr --auth cookie --cache isr --style tailwind
flare init --template saas            # preset: all smart defaults for SaaS
flare init --template blog            # preset: SSG + ISR, no auth
flare init --from schema.ts           # Zod schemas → full CRUD route tree (not yet implemented)
```

**Implementation status:** ✅ Interactive wizard (via @clack/prompts), non-interactive flags, presets (saas/blog/marketing), full SEO baseline, placeholder favicon set. Not yet: `--from schema.ts`.

### `flare setup-ai` — one command, all tools

Copies/symlinks Flare rules into every AI tool's config:

- `.cursor/rules/flare.mdc`
- `.claude/rules/flare.md`
- `.windsurf/rules/flare.md`
- `.github/copilot-instructions.md`
- `AGENTS.md`

---

## Font System — `flare/fonts`

Self-hosted Google Fonts with zero CLS, subset-optimized CSS, and per-element usage. Better than Next.js `next/font`.

### Architecture

```
npm package (flare) — metadata only, no binaries:
  src/fonts/
    registry.gen.ts          ← source of truth: 200+ Google Fonts
                                compact tuples: [family, category, weightIdx, subsetPatternIdx, ...fallbackMetrics]
    unicode-ranges.gen.ts    ← deduplicated subset patterns + unicode ranges
    css.ts                   ← buildFontCss(font, subsets?) → @font-face CSS string
    component.tsx            ← <FontCSS font={} subsets={} /> JSX component
    types.ts                 ← Font, FontConfig, SubsetName types
    inter.ts                 ← export const inter: Font (generated, one per font)
    roboto.ts                ← export const roboto: Font
    ...

user's project (via `flare add font`):
  public/fonts/inter/
    latin.woff2              ← downloaded from Google Fonts CDN
    latin-ext.woff2
    cyrillic.woff2
    ...
```

### Package exports

```json
{
	"./fonts": "./src/fonts/index.ts",
	"./fonts/inter": "./src/fonts/inter.ts",
	"./fonts/roboto": "./src/fonts/roboto.ts",
	"./fonts/playfair-display": "./src/fonts/playfair-display.ts"
}
```

One export per font. ~50KB total compressed for 200+ fonts metadata. Zero WOFF2 binaries in npm.

### Font object API

```typescript
import { inter } from "flare/fonts/inter"

inter.family // "Inter"
inter.category // "sans-serif"
inter.fontFamily // '"Inter", "Inter Fallback", sans-serif' — ready-to-use CSS value
inter.weights // "100 900" (variable) or [400, 700] (static)
inter.subsets // ["latin", "latin-ext", "cyrillic", "greek", "vietnamese"]

inter.css() // full @font-face CSS string — all subsets, unicode-range scoped
inter.css(["latin"]) // @font-face CSS for latin only — optimized payload

inter.preloadLinks() // [{ rel: "preload", href: "/fonts/inter/latin.woff2", ... }]
inter.preloadLinks("cyrillic") // preload cyrillic instead of default latin
```

### Per-font type-safe subsets

Each generated font export is generic over its available subsets. `css()` and `preloadLinks()` only accept subsets the font actually has — autocomplete works, typos are compile errors:

```typescript
interface Font<S extends string = string> {
	category: string
	css(subsets?: S[]): string
	family: string
	fontFamily: string
	preloadLinks(subset?: S): Array<Record<string, string>>
	subsets: S[]
	weights: string | number[]
}

/* Generated — each font narrows S to its actual subsets */
export const inter: Font<
	"cyrillic" | "cyrillic-ext" | "greek" | "greek-ext" | "latin" | "latin-ext" | "vietnamese"
>
export const crimsonText: Font<"latin" | "latin-ext" | "vietnamese">
```

```typescript
inter.css(["latin"]) // ✅ autocomplete
inter.css(["japanese"]) // ❌ type error — Inter has no japanese subset
crimsonText.css(["cyrillic"]) // ❌ type error — Crimson Text has no cyrillic

inter.preloadLinks("greek") // ✅
inter.preloadLinks("arabic") // ❌ type error
```

Zero runtime cost — the generic is erased at compile time. Works because each font export is generated with its subset union baked in.

### `<FontCSS>` component

Renders into `<head>`: inline `<style>` with @font-face declarations + `<link rel="preload">` for primary subset.

```tsx
import { inter } from "flare/fonts/inter"
import { FontCSS } from "flare/fonts"

// Root layout
.render((ctx) => (
  <html>
    <head>
      <FontCSS font={inter} />
      <ResetCSS />
    </head>
    <body style={{ "font-family": inter.fontFamily }}>
      {ctx.children}
    </body>
  </html>
))
```

**Props:**

- `font` — font object from import
- `subsets?` — subset filter, defaults to all. Only emits @font-face CSS for specified subsets.
- `preload?` — which subset to preload (default: "latin"). `false` to disable.

### Subset optimization

`unicode-range` in `@font-face` means browsers only download WOFF2 files for subsets with characters on the page. But the CSS declarations themselves are in every SSR response. Filtering by subset removes unnecessary @font-face blocks from HTML:

```tsx
/* English-only site: only latin CSS ships (~2 @font-face blocks) */
<FontCSS font={inter} subsets={["latin"]} />

/* Multi-locale: only what you need */
<FontCSS font={inter} subsets={["latin", "cyrillic"]} />

/* All subsets (default): browser handles download optimization via unicode-range */
<FontCSS font={inter} />
```

Locale-to-subset mapping built in: `en` → latin, `hr` → latin + latin-ext, `ru` → cyrillic + latin, etc.

### Per-element font usage

`fontFamily` is a plain CSS value. Use it anywhere — inline style, CSS variable, Tailwind:

```tsx
import { inter } from "flare/fonts/inter"
import { playfairDisplay } from "flare/fonts/playfair-display"

.render((ctx) => (
  <html style={{
    "--font-heading": playfairDisplay.fontFamily,
    "--font-body": inter.fontFamily,
  }}>
    <head>
      <FontCSS font={inter} subsets={["latin"]} />
      <FontCSS font={playfairDisplay} subsets={["latin"]} />
    </head>
    <body>
      <h1 style={{ "font-family": playfairDisplay.fontFamily }}>Serif heading</h1>
      <p>Body in Inter</p>
    </body>
  </html>
))
```

CSS variables + Tailwind:

```css
h1 {
	font-family: var(--font-heading);
}
body {
	font-family: var(--font-body);
}
```

```html
<h1 tw="font-[var(--font-heading)]">Heading</h1>
```

### Dynamic font selection (SaaS / storefront)

Server-driven architecture solves the Next.js problem. `.render()` runs per-request on the server — only selected fonts' CSS ships:

```tsx
import { inter } from "flare/fonts/inter"
import { lora } from "flare/fonts/lora"
import { playfairDisplay } from "flare/fonts/playfair-display"
import { roboto } from "flare/fonts/roboto"

const fontMap = { inter, lora, playfairDisplay, roboto }.render((ctx) => {
	const heading = fontMap[ctx.preloaderContext.headingFont]
	const body = fontMap[ctx.preloaderContext.bodyFont]
	return (
		<html style={{ "--font-heading": heading.fontFamily, "--font-body": body.fontFamily }}>
			<head>
				<FontCSS font={heading} subsets={["latin"]} />
				{heading !== body && <FontCSS font={body} subsets={["latin"]} />}
			</head>
			<body>{ctx.children}</body>
		</html>
	)
})
```

**Why this beats Next.js:**

- Next.js `next/font`: each `Inter()` call generates CSS at module import time. If you import 10 fonts for dynamic selection, all 10 CSS blocks ship to client regardless of which is used.
- Flare: font imports are just metadata objects (~100 bytes each). CSS is only emitted when `<FontCSS>` renders. Server evaluates per-request — only used fonts' CSS hits the wire.

### Zero CLS — fallback font metrics

Every font in the registry includes pre-calculated fallback metrics from @capsizecss:

```css
/* Generated by <FontCSS> automatically */
@font-face {
	font-family: "Inter Fallback";
	src: local("Arial");
	size-adjust: 107.12%;
	ascent-override: 90.44%;
	descent-override: 22.52%;
	line-gap-override: 0%;
}
```

Browser renders text with the metrics-matched fallback immediately. When the real font loads, zero layout shift. This is baked into every font object — consumer never sees it.

### Font generation pipeline

```
Google Fonts API
       ↓
scripts/populate-fonts.ts     (runs in flare repo, not by consumers)
       ↓
  ┌─ registry.gen.ts          compact font index (200+ fonts)
  ├─ unicode-ranges.gen.ts    deduplicated subset patterns
  └─ inter.ts, roboto.ts ...  individual exports (one per font)
```

Same pipeline as ecomet's `populate-google-fonts.ts`. Generates:

- Font metadata tuples (family, category, weight range, subset patterns)
- Fallback metrics (size-adjust, ascent/descent/line-gap override)
- Unicode range constants per subset
- CSS builder functions

### Variable vs static fonts

Handled transparently. Consumer doesn't care.

**Variable fonts** (Inter, DM Sans, etc.):

- Single WOFF2 file per subset: `latin.woff2`
- CSS: `font-weight: 100 900;` — one @font-face covers all weights
- Italic: separate file `latin-i.woff2` with `font-style: italic;`

**Static fonts** (Crimson Text, etc.):

- Separate WOFF2 per weight: `latin-400.woff2`, `latin-700.woff2`
- CSS: `font-weight: 400;` — one @font-face per weight
- Italic: `latin-i-400.woff2`, `latin-i-700.woff2`

**File naming convention:** `{subset}[-i][-weight].woff2`

- `latin.woff2` — variable, normal
- `latin-i.woff2` — variable, italic
- `latin-400.woff2` — static, normal, weight 400
- `latin-i-700.woff2` — static, italic, weight 700

The `css()` method generates the correct @font-face blocks based on whether the font is variable or static. Static fonts get multiple @font-face blocks per subset (one per weight).

### Custom fonts (non-Google)

Not everything is on Google Fonts. Brand fonts, licensed fonts, local WOFF2 files:

```typescript
import { createFont } from "flare/fonts"

const acmeSans = createFont({
  family: "Acme Sans",
  src: "/fonts/acme-sans/acme-sans.woff2",
  category: "sans-serif",
  display: "swap",
  weights: "100 900",
  fallbackMetrics: {
    fallbackFont: "Arial",
    sizeAdjust: "105%",
    ascentOverride: "90%",
    descentOverride: "22%",
    lineGapOverride: "0%",
  },
})

/* Same API as Google fonts */
<FontCSS font={acmeSans} />
acmeSans.fontFamily  // '"Acme Sans", "Acme Sans Fallback", sans-serif'
```

Custom fonts assume:

- Single WOFF2 file (no subset splitting)
- Variable weight range (or explicit weight list)
- Fallback metrics provided by user (or omitted — CLS won't be prevented)

**Simpler version** (no CLS prevention, no metrics):

```typescript
const acmeSans = createFont({
	family: "Acme Sans",
	src: "/fonts/acme-sans.woff2",
	category: "sans-serif",
})
```

### Client-side navigation

Font CSS is managed by Flare's existing head-client system:

- `<FontCSS>` renders `custom.styles` (inline @font-face) + `custom.links` (preload)
- Head-client tracks styles/links per route via matchId
- When navigating away from a route, its contributed head elements are cleaned up
- SSR-rendered elements found via querySelector — not duplicated on hydration
- If root layout has `<FontCSS font={inter}>`, it persists across all navigations (keepalive)
- Nested layouts can add additional fonts — cleaned up when layout exits

No special font handling needed. The existing head lifecycle handles it.

### No `fonts` field on HeadConfig

By design. Flare's `custom.styles` + `custom.links` already handles fonts perfectly:

- `custom.styles` arrays concatenate across layout/page head merges
- `custom.links` arrays concatenate too
- Nonces auto-applied to inline `<style>` in SSR
- Preload `<link>` tags require `crossorigin=""` — included in `preloadLinks()`

`<FontCSS>` is the primary API (in `.render()`). For per-page fonts in `.head()`:

```typescript
.head(() => ({
  custom: {
    links: specialFont.preloadLinks(),
    styles: [{ children: specialFont.css(["latin"]) }],
  },
}))
```

### What's not supported (intentionally)

**CJK fonts** — Chinese, Japanese, Korean fonts have 100+ subsets and are 10MB+. Google Fonts handles them with aggressive subsetting but the CSS alone is massive. Out of scope for v1. Can be added to registry later — the architecture supports it (just more subsets).

**Font subsetting at build time** — Tools like `glyphhanger`/`pyftsubset` can strip unused glyphs. Overkill for a framework. unicode-range already solves this at the browser level.

**`font-display` options** — Hardcoded to `swap`. This is the right default (text visible immediately, swap when font loads). `optional` (invisible text, skip font if slow) and `block` (invisible text, wait for font) are niche. Can be added as a prop later if needed.

**Font loading events** — `document.fonts.ready` / `FontFaceSet.load()`. Some apps want to know when fonts loaded (e.g., to trigger animations). Not in v1 — consumer can use the browser API directly.

### Implementation phases

**v1 — Core (`flare/fonts`):** Full font system in the framework package. Registry generation pipeline, `Font<S>` type, `css()`, `preloadLinks()`, `fontFamily`, `<FontCSS>` component, `createFont()` for custom fonts. All unit tests + E2E tests. This is the foundation — everything else depends on it.

**v2 — CLI (`flare add font`, `flare init` integration):** Interactive font picker, WOFF2 download, init wizard font selection. CLI-only, no core changes. Only starts after v1 is fully tested and green.

### `flare init` integration (v2)

Init wizard offers font selection:

```
◆ Primary font?
│  ● Inter (recommended)
│  ○ Search / browse...
│  ○ None (system fonts)
```

When selected, auto-runs `flare add font <name>` and wires up `<FontCSS>` in root layout.

---

## What Ships With npm Package

```
flare/
  docs/                       # version-matched framework docs (like Next.js v16.2+)
  fonts/                      # 200+ Google Font metadata (no binaries, ~50KB)
    registry.gen.ts           # compact font index
    inter.ts, roboto.ts ...   # individual font exports
  ai/
    AGENTS.md                 # cross-tool standard
    rules/                    # tool-specific rules (routing, server, client)
    examples/                 # 10 annotated patterns (basic → complex)
    manifest.schema.json      # route manifest JSON schema
```

## MCP Server — thin CLI wrapper

Ships as `flare/mcp`. Tools: `flare_gen`, `flare_add`, `flare_remove`, `flare_rename`, `flare_codegen`, `flare_routes`, `flare_route`, `flare_validate`, `flare_plan`, `flare_init`. Each maps 1:1 to CLI command. Free once CLI exists.

---

## Route Archetypes (6 cover 80%)

Proven across Rails, Django, Laravel, Blitz, Redwood, Refine. Hasn't changed since 2004.

| #   | Archetype       | Routes                                 | Auth     | Cache   | Builder                                                             |
| --- | --------------- | -------------------------------------- | -------- | ------- | ------------------------------------------------------------------- |
| 1   | resource-list   | `/[things]`                            | yes      | SSR/ISR | `.authenticate().loader().head().render()`                          |
| 2   | resource-detail | `/[things]/[id]`                       | yes      | SSR/ISR | `.input().authenticate().loader().head().render().notFoundRender()` |
| 3   | resource-form   | `/[things]/new`, `/[things]/[id]/edit` | yes      | SSR     | `.input().authenticate().authorize().loader().render()`             |
| 4   | dashboard       | `/dashboard`                           | yes      | SSR+CSR | `.authenticate().loader().head().render()`                          |
| 5   | settings        | `/settings/[section]`                  | yes+role | SSR     | `.authorize().loader().render()`                                    |
| 6   | marketing       | `/`, `/pricing`, `/blog/[slug]`        | no       | SSG/ISR | `.cache().loader().head().render()`                                 |

Bonus: **auth** (`/login`, `/signup`) — one-time gen, not per-resource.

### Archetype flags that leverage unique Flare features

These are things Next.js/Remix/SvelteKit CAN'T do — Flare-only because of server-driven component tree, intercept routes, deferred loading, and piggyback.

```bash
# INTERCEPT ROUTES — create/edit render as modal from list, standalone when direct-accessed
flare gen resource products --crud --modal
  → /products              (list)
  → /products/[id]         (detail)
  → /products/(.)new       (intercept: modal from list, page from URL)
  → /products/(.)edit/[id] (intercept: modal from list, page from URL)

# DEFERRED LOADING — load primary data fast, defer secondary
flare gen resource products --defer reviews,relatedProducts
  → loader returns products immediately, defers reviews + related via defer()
  → render uses <Await> for deferred sections with Suspense fallbacks

# PRELOADER SHARING — layout loads shared data, pages inherit
flare gen resource products --shared-preloader
  → products layout gets .preloader() that loads categories, tags
  → list/detail/form pages access via ctx.preloaderContext

# ALL COMBINED
flare gen resource products --crud --modal --defer reviews --test
  → 5 routes (list, detail, form+modal variants)
  → 3 server fns
  → deferred review loading
  → intercept route modals
  → unit + e2e tests
```

This is the competitive moat. AI runs one command, gets patterns that would take a senior dev hours to architect correctly in any other framework.

---

---

## `flare validate` — structure & best practice checks

Not just types — validates the entire project structure, conventions, and production readiness.

```bash
flare validate                        # full validation
flare validate --json                 # machine-readable for AI
flare validate --fix                  # auto-fix what's fixable
```

### What it checks

**Structure validation:**

- File system conventions (route files in correct dirs, naming patterns)
- Missing layouts (routes without a root layout)
- Orphaned files (route files not picked up by codegen)
- Duplicate route paths
- Invalid dynamic param names

**Builder chain completeness:**

- Pages with `.loader()` but no `.errorRender()` — data can fail
- Pages with `.authenticate()` but no `.unauthenticatedRender()` — auth can fail
- Public routes without `.head()` — SEO missing
- ISR/SSG routes without `.cache()` params — won't prerender
- Layouts without `.render()` — won't display

**Production readiness:**

- No cache on public routes (should be SSG or ISR)
- No error boundaries on data-loading routes
- Missing head tags on indexable pages
- Auth routes accessible without redirect-if-authenticated
- Server fns without input validation

**Performance:**

- Large route trees without keepalive
- No prefetch strategy set
- Missing view transitions on nav-heavy apps

```bash
flare validate --json
```

```json
{
	"errors": [
		{
			"code": "ORPHAN_FILE",
			"file": "src/routes/old-page.tsx",
			"message": "route file not detected by codegen",
			"fix": { "type": "manual", "suggestion": "rename to match convention or delete" }
		}
	],
	"warnings": [
		{
			"code": "NO_ERROR_BOUNDARY",
			"route": "/products/[id]",
			"message": "loader exists but no errorRender",
			"fix": { "command": "flare add error-boundary /products/[id]" }
		},
		{
			"code": "PUBLIC_NO_CACHE",
			"route": "/pricing",
			"message": "public route with no cache strategy",
			"fix": { "command": "flare add cache /pricing --ssg" }
		},
		{
			"code": "NO_HEAD",
			"route": "/dashboard",
			"message": "no head tags — bad for SEO/social sharing",
			"fix": { "command": "flare add head /dashboard" }
		}
	],
	"info": [
		{ "code": "SUGGEST_KEEPALIVE", "message": "12 layouts detected, consider enabling keepalive" },
		{ "code": "SUGGEST_PREFETCH", "message": "no prefetch strategy — consider viewport or intent" }
	]
}
```

`flare validate --fix` auto-runs every `fix.command`. AI runs this once → app goes from "works" to "production-grade."

---

## `flare plan` — declarative app structure

The missing piece. AI plans the whole app as a spec file, human reviews, CLI generates deterministically. Same pattern as Terraform/Prisma/OpenAPI — declare then apply.

### The file: `flare.plan.json`

```json
{
	"app": {
		"name": "acme",
		"type": "saas",
		"locale": ["en", "hr"],
		"auth": "cookie",
		"cache": "isr",
		"style": "tailwind",
		"features": ["keepalive", "viewTransitions", "scrollRestoration", "theme"]
	},
	"layouts": [
		{ "path": "_root_", "type": "root-layout", "theme": true },
		{ "path": "(marketing)", "type": "layout" },
		{ "path": "(auth)", "type": "layout", "redirectIfAuth": "/dashboard" },
		{ "path": "(app)", "type": "layout", "auth": true },
		{
			"path": "(app)/settings",
			"type": "layout",
			"tabs": ["profile", "billing", "team", "notifications"]
		}
	],
	"routes": [
		{ "path": "/", "archetype": "marketing", "cache": "ssg" },
		{ "path": "/pricing", "archetype": "marketing", "cache": "ssg" },
		{ "path": "/blog", "archetype": "marketing", "cache": "isr", "dynamic": "[slug]" },
		{ "path": "/login", "archetype": "auth" },
		{ "path": "/signup", "archetype": "auth" },
		{ "path": "/forgot-password", "archetype": "auth" },
		{ "path": "/dashboard", "archetype": "dashboard", "auth": true },
		{ "path": "/products", "archetype": "resource", "auth": true, "crud": true, "cache": "isr" },
		{ "path": "/orders", "archetype": "resource", "auth": true, "crud": true },
		{ "path": "/customers", "archetype": "resource", "auth": true, "crud": true },
		{ "path": "/settings/profile", "archetype": "settings", "auth": true },
		{ "path": "/settings/billing", "archetype": "settings", "auth": true },
		{ "path": "/settings/team", "archetype": "settings", "auth": true, "role": "admin" },
		{ "path": "/settings/notifications", "archetype": "settings", "auth": true }
	],
	"serverFns": [
		{ "name": "createProduct", "input": true, "auth": true },
		{ "name": "updateProduct", "input": true, "auth": true },
		{ "name": "deleteProduct", "input": true, "auth": true, "authorize": true },
		{ "name": "createOrder", "input": true, "auth": true },
		{ "name": "updateOrder", "input": true, "auth": true },
		{ "name": "deleteOrder", "input": true, "auth": true, "authorize": true }
	]
}
```

### Commands

```bash
flare plan                            # generate plan from existing app (reverse-engineer)
flare plan --type saas                # generate starter plan for app type
flare plan validate                   # check plan for errors/conflicts
flare plan apply                      # generate everything from plan
flare plan apply --dry-run            # show what would be generated
flare plan diff                       # show diff between plan and current app state
```

### Why this is the unlock

**1. AI creates, human reviews one file**

```
User: "Build me an e-commerce dashboard with products, orders, customers"
AI: generates flare.plan.json (30 lines)
Human: scans JSON, approves
CLI: flare plan apply → 15 routes, 6 server fns, 5 layouts, all wired
```

Review surface = one JSON file. Not 20 source files.

**2. Plan is the source of truth**

Change the plan, re-apply. Added a new resource? Add one line to `routes[]`, run `flare plan apply`. Removed auth from a route? Delete `"auth": true`, re-apply. The plan is diffable, version-controlled, reviewable.

**3. `flare plan` reverse-engineers existing apps**

Run `flare plan` on an existing Flare app → generates the plan file from current routes. Now you have a living spec of your app structure. AI reads this to understand the app without reading every route file.

**4. Plan validation catches design mistakes early**

```bash
flare plan validate
```

```
ERROR: /settings/team has role: "admin" but parent layout (app) has no authorize
WARNING: /products has crud: true but no serverFns defined for products
WARNING: /blog has dynamic: "[slug]" but no resource-detail archetype
INFO: 3 resources detected — consider shared layout for consistency
```

Fix the plan before generating code. Cheaper than fixing generated code.

**5. Composable with everything else**

`flare plan apply` calls `flare gen` and `flare add` under the hood. The plan is a batch instruction set:

```
flare plan apply
  → flare init --type saas --locale en,hr --auth cookie --cache isr --style tailwind
  → flare gen resource products --crud
  → flare gen resource orders --crud
  → flare gen resource customers --crud
  → flare gen dashboard /dashboard
  → flare gen settings /settings --tabs profile,billing,team,notifications
  → flare gen marketing / --pages pricing
  → flare gen auth /
  → flare add cache /products --isr
  → flare add auth /settings/team --role admin
  → ...
```

The plan is syntactic sugar over CLI commands. Nothing new to implement — just orchestration.

---

## Build Order & Status

1. ✅ `flare codegen` — standalone route/type generation
2. ✅ `flare gen` — scaffold resources, pages, layouts, server fns
3. ✅ `flare routes` — inspect route table (--json)
4. ✅ `flare status` — project health summary (--json)
5. ✅ `flare validate` — structure + best practice checks (--json, --fix)
6. ✅ `flare add` — inject builder chain methods (auth, cache, loader, head, input, error-boundary)
7. ✅ `flare init` — interactive wizard + non-interactive flags + SEO baseline + favicon set
8. ⬚ `flare/fonts` — font registry, CSS generation, `<FontCSS>` component (core)
9. ⬚ `flare add font` — interactive font picker, WOFF2 download (CLI)
10. ⬚ `flare plan` — declarative structure (apply, validate, diff, reverse-engineer)
11. ⬚ `flare remove` — clean inverse of gen
12. ⬚ `flare rename` — refactor without breakage
13. ⬚ `flare setup-ai` — copy rules to all AI tool configs
14. ⬚ `flare init --from schema.ts` — schema-first generation
15. ⬚ MCP server: wrap CLI

## Resolved Engineering Questions

- `flare add` implementation: **regex + string splice** (no AST dep, 10-level hierarchy insertion, `skipStringOrComment` from generators)
- CLI package: **standalone `@flare/cli`** with commander + @clack/prompts
- `flare gen resource` scope: **generates server fns with --crud flag**
- Validation rules: **hardcoded best practices** (5 rules: missing-root-layout, duplicate-routes, loader-no-error-boundary, auth-no-boundary, public-no-head, public-no-cache)

## Open Engineering Questions

- Existing route conflict: overwrite / merge / error?
- Bundled docs format: full markdown or condensed API cards for token efficiency?
- Plan format: JSON (strict) vs YAML (readable) vs both?
- Plan apply: overwrite existing files? merge? skip existing + gen new only?
- Plan diff: how granular? route-level? method-level?
