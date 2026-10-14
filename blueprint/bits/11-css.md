# Bit 11 — CSS delivery

Creates every `P11` row. There is no CSS compiler in this bit or any other.

Component styles are Vite CSS modules, authored by the app, imported from the component. Utility styles are the app's own `@tailwindcss/vite`. Flare emits that one built stylesheet without blocking the document, and inlines the shell's critical CSS on a production document.

## Extends

`tests/integration/nonce.test.ts` gains `stylesheet`: the production swap script's nonce equals the CSP header nonce. It gains `critical`: `<style id="flare-critical">` carries that same nonce.

`server/render/document.test.ts` gains `critical shell`: the first flushed chunk of a production document contains `flare-critical` and the rule for a class that is in the shell, then the stylesheet markup `<Stylesheet />` placed, once, right after it (B103). With a router whose theme is configured, a rule under `:where([data-theme="dark"] *)` for that class is kept. `modes`: a live SSR render, an SSG prerender, and an ISR populate each contain that style. `data skips`: a `_flare=data` response has no `flare-critical` and does not read the sheet. `dev`: no `flare-critical`.

`server/cache/write.test.ts` gains `critical stored`: the written HTML contains `flare-critical`. `server/cache/read.test.ts` gains `critical hit`: the hit body still contains it, and the extractor is not called.

`vite/plugin/options.test.ts` gains `reset on`: `css: { reset: true }` is accepted. `reset off`: omission, `css: {}`, and `css: { reset: false }` are the same. `css key`: a key other than `reset` throws. `top level`: a top-level `reset` throws.

## Cases

### `vite/css/bundle.test.ts`

The client bundle's one stylesheet. Vite 8 writes it as the `style.css` asset when CSS code splitting is off.

| test | case | result |
| --- | --- | --- |
| `one href` | a bundle with one CSS asset | its file name, its href, and its text, from a string or bytes |
| `none` | a bundle with no CSS | `undefined` |
| `two` | a bundle with two CSS assets | throw, naming both. One stylesheet is the contract |
| `base` | base `/app/` | the href is `/app/assets/style-<hash>.css`. The href joins the client environment's resolved `base` and the file name |

### `shared/css/delivery.test.ts`

The markup is per-request runtime code the `Stylesheet` component renders, so it lives in `shared`.

| test | case | result |
| --- | --- | --- |
| `prod markup` | href `/assets/app.css`, nonce `n` | a preload link, a noscript stylesheet link, and a script whose nonce is `n` |
| `script constant` | the script text | it sets the preloaded link's `rel` to `stylesheet` and does not read the network |
| `no inline style` | the swap markup | it contains no `<style>`. The critical block is inserted by `critical-style`, not by this markup |
| `no nonce` | href `/assets/app.css` and nonce `""`, the case of a string or `false` CSP (B68) | one plain `<link rel="stylesheet">` and no script. An un-nonced swap script would be blocked by a string CSP and leave the page on its critical CSS alone |

### `shared/components/stylesheet.test.tsx`

| test | case | result |
| --- | --- | --- |
| `dev` | `import.meta.env.DEV`, outside and inside a dev document render with two CSS modules | outside it renders nothing; inside, one `<style data-vite-dev-id>` per module with the request nonce, a `</style` in the CSS escaped (B104) |
| `prod` | dev false and a `builtHref`, outside a document render | the markup from `delivery` |
| `placed` | the same inside a document render (`withRequest` with a stylesheet placement) | the component renders nothing and leaves `builtHref` in the placement, which the document writes right after `#flare-critical` (B103) |
| `nonce` | `nonce()` returns `n` | the swap script's nonce is `n` |
| `prod without css` | dev false and no href | nothing |

The component reads `nonce()`. The string is the one `renderToStream` received and the one the CSP header carries. The component does not invent a nonce. Solid's `scriptNonce` projects the argument it is given. Calling it with no argument does not read the request (`stylesheet.test.tsx` `nonce`).

### `shared/css/parse.test.ts`

The parser keeps source order. A string or `url()` may contain braces and comments. `@import` and `@charset` throw.

| test | case | result |
| --- | --- | --- |
| `order` | two rules | the same order |
| `string` | a declaration whose string contains `{` | one rule |
| `import` | `@import` | throw: "@import is not supported in the app stylesheet; use createFont, or a <link> in the root layout head". A Google Fonts `@import` is the common case |
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
| `escaped class` | `class="md:flex"` and `.md\:flex`; `class="w-[50%]"` and `.w-\[50\%\]` | match. Class and id names are unescaped before they are compared |
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
| `host` | `:host`, `:host(.a) p`, `:host-context(.b)`, and `:host, html` | no match, except `html` in the same list |
| `quoted gt` | `<div data-x="a > b">` and a single-quoted `c>d` | the `>` in a quoted value does not end the tag |
| `attr ops` | `~=`, `\|=`, `^=`, `$=`, `*=`, `=` unquoted, and the `i` flag | each matches as CSS defines it, and a wrong value does not |
| `siblings` | `+` and `~` across a comment | `+` is the element just before and `~` any element before, under one parent |
| `shell` | script, style, and textarea text; void and self-closing elements; a stray end tag; `ctx.present` | none of that text is markup, void elements take no children, and an attribute named in `present` matches whatever its value |
| `malformed` | an unclosed parenthesis, an unsplittable attribute, a lone combinator, a trailing backslash, `:not` with no argument | none throws. A lone combinator matches nothing |

### `shared/css/shell.test.ts`

Split from `match.ts` at the 300-line limit.

| test | case | result |
| --- | --- | --- |
| `tree` | a shell with text, a comment, a script, and nesting | each element knows its parent and its previous element sibling, its classes, and its attributes |
| `entities` | `class="[&amp;>*]:p-2 content-[&#39;x&#39;] q-[&quot;y&quot;]"` and `data-x="&#x41;&lt;"`, as Solid writes attributes | the classes are `[&>*]:p-2`, `content-['x']`, and `q-["y"]`, and `data-x` is `A<`. Named (`amp`, `lt`, `gt`, `quot`, `apos`, `nbsp`), decimal, and hex references are decoded before matching, so `.\[\&\>\*\]\:p-2` matches |
| `loose markup` | unquoted and empty values, a boolean attribute, and an unterminated comment, doctype, or end tag | the attributes read as written, and the shell ends there |

### `shared/css/critical.test.ts`

`criticalCss(html, css, ctx?)`. `ctx.themeAttribute` and `ctx.directionAttribute`, when set, match even when the shell HTML does not have that attribute yet. The theme and direction scripts set them before paint. A direction attribute also makes `dir` present, since the direction script sets both (B103).

| test | case | result |
| --- | --- | --- |
| `used` | `.a` is in the HTML | the rule is in the result |
| `unused` | `.b` is not | the rule is absent |
| `media` | `@media (min-width: 1px)` around a used rule | the media wrap is kept |
| `media empty` | the same around an unused rule | the wrap is absent |
| `keyframes` | a kept rule's `animation` or `animation-name` names `spin`, directly or through a kept custom property such as Tailwind's `--animate-spin` | `@keyframes spin` is kept, and an unnamed `@keyframes` is absent |
| `font` | a kept rule's `font-family` or `font` shorthand names `Ada`, quoted or not, directly or through a kept custom property such as `--font-sans` | that `@font-face` is kept, and an unnamed one is absent |
| `layer` | a bare `@layer a;` | it is kept |
| `other at-rules` | `@property` and `@counter-style` beside an unused rule | both are kept. Only `@keyframes` and `@font-face` are filtered by use |
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
| `empty` | the source module | `builtSheet` and `builtHref` are `""` |

### `server/render/critical-style.test.ts`

| test | case | result |
| --- | --- | --- |
| `insert` | a shell with `<head>` and a used class | `<style id="flare-critical"` comes right before the stylesheet markup (B103) and is otherwise the last element in the head, it has no `data-dh`, and the unused rule is absent |
| `present variants` | Tailwind `dark:` and `rtl:` rules (`&:where([data-mode="dark"], [data-mode="dark"] *)`, the same for `dir` and for the direction attribute `data-side`) over a shell with no theme or dir value, with `criticalContext(router)` for a router configured with those attributes | the rules for shell elements are in `#flare-critical` (B103). The direction attribute also makes `dir` present, since the direction script sets both. A router with neither config gives `{}`. The document passes `criticalContext(router)` on every render (`document.test.ts` `critical shell`) |
| `nonce` | nonce `n` | the style nonce is `n` |
| `empty nonce` | nonce `""` | the style has no nonce attribute |
| `no css` | the sheet is `""`, or no rule in it matches the shell | the shell is unchanged and has no `flare-critical`. With a placed stylesheet, its markup alone goes before `</head>` |
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
| `reset on` | `css: { reset: true }`, a real Vite build | the built CSS starts with `@layer reset{` and holds the preflight's rules before the app's. The client entry imports the preflight as a virtual CSS module first, so it is in the hashed file and in dev. Vite's CSS pipeline may reformat its bytes, and `reset.test` `bytes` pins the exported string |
| `server sheet` | the client build produced `body{color:red}` | the `ssr` and `worker` module source exports that text as `builtSheet` and its href as `builtHref`. A server build before the client build fails, and dev keeps the empty module |
| `one sheet` | the client environment config, and a lazy chunk that imports its own CSS | flare() sets `build.cssCodeSplit: false` on the client environment, so the lazy chunk's CSS is in the one stylesheet |
| `client graph` | the same build | the client JavaScript does not contain that text. The browser loads the file |
| `build parse` | the client CSS holds `@import`, `@charset`, or a rule the parser cannot read | the build fails and names the file. A request never parses a sheet the build did not accept |

## Done

A production SSR, SSG, or ISR document flushes a shell whose head ends with the nonced critical style for that shell (B15: the last element in `head`), then loads the one stylesheet without blocking. A stored hit serves that style and does not extract again. A data response has neither. A development document has no critical style. `css: { reset: true }` is the only way Flare adds a preflight.
