# Bit 11 — CSS delivery

Creates every `P11` row. There is no CSS compiler in this bit or any other.

Component styles are Vite CSS modules, authored by the app, imported from the component. Utility styles are the app's own `@tailwindcss/vite`. Flare emits that one built stylesheet without blocking the document, and inlines the shell's critical CSS on a production document.

## Extends

`tests/integration/nonce.test.ts` gains `stylesheet`: the production swap script's nonce equals the CSP header nonce. It gains `critical`: `<style id="flare-critical">` carries that same nonce.

`server/render/document.test.ts` gains `critical shell`: the first flushed chunk of a production document contains `flare-critical` and the rule for a class that is in the shell, and the preload link. `modes`: a live SSR render, an SSG prerender, and an ISR populate each contain that style. `data skips`: a `_flare=data` response has no `flare-critical` and does not read the sheet. `dev`: no `flare-critical`.

`server/cache/write.test.ts` gains `critical stored`: the written HTML contains `flare-critical`. `server/cache/read.test.ts` gains `critical hit`: the hit body still contains it, and the extractor is not called.

`vite/plugin/options.test.ts` gains `reset on`: `css: { reset: true }` is accepted. `reset off`: omission, `css: {}`, and `css: { reset: false }` are the same. `css key`: a key other than `reset` throws. `top level`: a top-level `reset` throws.

## Cases

### `vite/css/manifest.test.ts`

| test | case | result |
| --- | --- | --- |
| `one href` | a manifest with one CSS file | that href |
| `none` | a manifest with no CSS | `undefined` |
| `two` | a manifest with two CSS files | throw. One stylesheet is the contract |

### `vite/css/delivery.test.ts`

| test | case | result |
| --- | --- | --- |
| `prod markup` | href `/assets/app.css`, nonce `n` | a preload link, a noscript stylesheet link, and a script whose nonce is `n` |
| `script constant` | the script text | it sets the preloaded link's `rel` to `stylesheet` and does not read the network |
| `no inline style` | the swap markup | it contains no `<style>`. The critical block is inserted by `critical-style`, not by this markup |
| `no nonce` | href `/assets/app.css` and nonce `""`, the case of a string or `false` CSP (B68) | one plain `<link rel="stylesheet">` and no script. An un-nonced swap script would be blocked by a string CSP and leave the page on its critical CSS alone |

### `shared/components/stylesheet.test.tsx`

| test | case | result |
| --- | --- | --- |
| `dev` | `import.meta.env.DEV` | the component renders nothing |
| `prod` | dev false and a manifest href | the markup from `delivery` |
| `nonce` | `nonce()` returns `n` | the swap script's nonce is `n` |
| `prod without css` | dev false and no href | nothing |

The component reads `nonce()`. The string is the one `renderToStream` received and the one the CSP header carries. The component does not invent a nonce. Solid's `scriptNonce` projects the argument it is given. Calling it with no argument does not read the request (`stylesheet.test.tsx` `nonce`).

### `shared/css/parse.test.ts`

The parser keeps source order. A string or `url()` may contain braces and comments. `@import` and `@charset` throw.

| test | case | result |
| --- | --- | --- |
| `order` | two rules | the same order |
| `string` | a declaration whose string contains `{` | one rule |
| `import` | `@import` | throw |
| `charset` | `@charset` | throw |
| `escaped brace` | `.a\{b{color:red}`, `.content-\[\'\{\'\]{content:'{'}`, and `.a\}b{color:red}` | each is one rule whose selector round-trips. A backslash escapes the next character anywhere, not only inside a string. Tailwind escapes `{` and `}` in arbitrary-value class names |
| `nesting kept` | `.card{color:blue;& h2{color:red}}` | one rule whose child is the nested rule, each with its own declarations |
| `at-rules` | `@media`, `@supports`, `@container`, `@layer` with and without a block, `@keyframes`, `@font-face`, `@property` | each round-trips through `printCss`. Grouping rules hold statements, the others their body as written. An unclosed block, string, comment, or statement, and a declaration outside a rule, throw |

### `shared/css/match.test.ts`

Pseudo-classes and pseudo-elements stay in the output and do not have to be active. A selector that is only a pseudo-element matches. `:host` does not match the document. `html` in the same list still does.

| test | case | result |
| --- | --- | --- |
| `class` | `class="foo bar"` and `.foo` | match |
| `prefix` | `class="foo"` and `.fo` | no match |
| `id` | `id="a"` and `#a` | match |
| `type` | `<DIV>` and `div` | match |
| `compound` | `<div class="card">` and `div.card` | match |
| `descendant` | `.card h2` with that nesting | match |
| `child` | `.card > h2` when `h2` is wrapped | no match |
| `list` | `.a, .b` when only `.b` is present | match |
| `hover` | `a:hover` and an `<a>` | match, and the output still says `:hover` |
| `only pseudo` | `::placeholder` | match |
| `not` | `:not(.x)` on an element without `x` | match |
| `where` | `:where(.a, .b)` when `.b` is present | match |
| `attr` | `[title="x"]` | match only that value |
| `root` | `:root` | match |
| `nesting` | `.card { & h2 { color: red } }` and `<div class="card"><h2>` | the nested rule is kept |

### `shared/css/critical.test.ts`

`criticalCss(html, css, ctx?)`. `ctx.themeAttribute` and `ctx.directionAttribute`, when set, match even when the shell HTML does not have that attribute yet. The theme and direction scripts set them before paint.

| test | case | result |
| --- | --- | --- |
| `used` | `.a` is in the HTML | the rule is in the result |
| `unused` | `.b` is not | the rule is absent |
| `media` | `@media (min-width: 1px)` around a used rule | the media wrap is kept |
| `media empty` | the same around an unused rule | the wrap is absent |
| `keyframes` | a kept rule's `animation-name` is `spin` | `@keyframes spin` is kept |
| `font` | a kept rule's `font-family` is `Ada` | that `@font-face` is kept |
| `layer` | a bare `@layer a;` | it is kept |
| `order` | three kept rules | source order |
| `theme attr` | `[data-theme="dark"]` and `ctx.themeAttribute` is `data-theme` | the rule is kept though the HTML has no such attribute |
| `escape` | the CSS contains `</style>` | the result contains no raw `</style>` |
| `empty` | css `""` | `""` |
| `reset inlined` | the CSS starts with the preflight and the shell is `<html><body>` | the result contains the `*` rule from that preflight |
| `parse once` | two `criticalCss` calls with the same sheet | the sheet is parsed once per process. Each call only matches the shell |
| `candidates` | a sheet of 5,000 class rules and a shell using 3 of those classes | only rules keyed by the shell's classes, ids, and tags, plus rules with no such key, are tested against the shell. Rules are indexed by the rightmost compound's class, id, or tag |

### `shared/css/sheet.test.ts`

| test | case | result |
| --- | --- | --- |
| `empty` | the source module | `builtSheet` is `""` |

### `server/render/critical-style.test.ts`

| test | case | result |
| --- | --- | --- |
| `insert` | a shell with `<head>` and a used class | `<style id="flare-critical"` is the last element in the head, it has no `data-dh`, and the unused rule is absent |
| `nonce` | nonce `n` | the style nonce is `n` |
| `empty nonce` | nonce `""` | the style has no nonce attribute |
| `no css` | the sheet is `""` | the shell is unchanged and has no `flare-critical` |
| `one` | called once | one such style tag |

### `vite/css/reset.test.ts`

| test | case | result |
| --- | --- | --- |
| `bytes` | the exported string | sha256 `d2d86ff1f5c3b5e0edba40c468d26d941fd52b3e884d33e208961b5200dbcae6`, the v0 `RESET` preflight |
| `layer` | the string | it starts with `@layer reset` |

### `vite/css/inject.test.ts`

| test | case | result |
| --- | --- | --- |
| `reset off` | `css` omitted | the built CSS does not start with `@layer reset` |
| `reset on` | `css: { reset: true }` | the built CSS starts with that preflight |
| `server sheet` | the client build produced `body{color:red}` | the server module source is that text |
| `client graph` | the same build | the client JavaScript does not contain that text. The browser loads the file |
| `build parse` | the client CSS holds `@import`, `@charset`, or a rule the parser cannot read | the build fails and names the file. A request never parses a sheet the build did not accept |

## Done

A production SSR, SSG, or ISR document flushes a shell whose head ends with the nonced critical style for that shell (B15: the last element in `head`), then loads the one stylesheet without blocking. A stored hit serves that style and does not extract again. A data response has neither. A development document has no critical style. `css: { reset: true }` is the only way Flare adds a preflight.
