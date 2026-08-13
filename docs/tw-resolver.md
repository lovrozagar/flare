# Flare tw= AST resolver

## Overview

The `flare:tw-ast` Vite plugin compiles `tw=` props in `.tsx`/`.jsx` files at build time.
It parses each file with oxc, evaluates every `tw=` expression statically, and emits compiled
`css=` props (and hoisted variant maps when the expression is conditional).

The resolver runs before any bundler transform. It never executes user code — all class strings
must be statically determinable from the source text.

## Supported shapes

### S1 — string literal

```tsx
<div tw="flex p-4 text-sm" />
```

Resolved to inline `css=` with compiled declarations.

### S2 — const identifier

```tsx
const BASE = "flex p-4"
<div tw={BASE} />
```

Resolved when the identifier is bound to a string literal in the same file.

### S3 — ternary expression

```tsx
<div tw={isActive ? "bg-blue-500" : "bg-gray-200"} />
```

Produces a hoisted variant map with both branches pre-compiled.

### S4 — logical &&

```tsx
<div tw={isError && "border-red-500"} />
```

Resolves to `Set(["", "border-red-500"])` — empty string is the falsy branch.

### S5 — object / array member access

```tsx
const COLORS = { active: "bg-blue-500", idle: "bg-gray-200" }
<div tw={COLORS[variant]} />
```

Static key access and computed string-literal keys both resolve. Unknown computed key
enumerates all values.

### S6 — array methods

```tsx
const parts = ["flex", isLarge && "text-lg"]
<div tw={parts.filter(Boolean).join(" ")} />
```

Supported: `join`, `concat`, `filter(Boolean)`, `slice`, `map`, `reduce`.

### S7 — template literal

```tsx
<div tw={`flex ${isLarge ? "text-lg" : "text-sm"} p-4`} />
```

Cartesian product across all interpolated expressions.

### S8 — helper calls

```tsx
<div tw={clsx("flex", isActive && "bg-blue-500")} />
```

Whitelisted helpers: `clsx`, `classNames`, `cx`, `twMerge`, `twJoin`.
Object form `{ "class": condition }` supported within these helpers.

### S9 — cross-file import

```tsx
/* tokens.ts */
export const BASE = "flex p-4"

/* component.tsx */
import { BASE } from "./tokens"
<div tw={BASE} />
```

Resolved via the cross-file cache. Maximum hop depth configurable via `hopDepth` (default 2).

## Unsupported shapes

### U1 — dynamic key {#u1-dynamic-key}

```tsx
const key = computeKey()          // runtime value
<div tw={COLORS[key]} />
```

The compiler cannot determine which key is accessed at runtime. Extract the map and
enumerate values via a conditional or `tw={clsx(...)}`.

### U2 — runtime variable {#u2-runtime-variable}

```tsx
<div tw={props.variant} />        // prop from outside
<div tw={runtimeFn()} />
```

Values that are only known at runtime cannot be resolved. Move dynamic logic into a
conditional or helper call with literal branches.

### U3 — function call (non-whitelisted) {#u3-function-call}

```tsx
<div tw={buildClasses(variant)} />
```

Only `clsx`, `classNames`, `cx`, `twMerge`, `twJoin` are whitelisted. Inline the logic or
use one of the whitelisted helpers.

### U4 — async / generator {#u4-async}

```tsx
<div tw={await fetchClasses()} />
```

Async expressions are never resolvable at compile time. Fetch at component mount and pass
via state, then use a conditional `tw=` branch.

### U5 — arithmetic / non-+ binary operator {#u5-arithmetic}

```tsx
<div tw={"flex" * 2} />          // nonsensical but triggers this path
<div tw={a - b} />
```

Only string concatenation via `+` is supported. Restructure to string literals or template
literals.

### U6 — cartesian overflow {#u6-cartesian-overflow}

```tsx
/* maxVariants default = 64 */
<div tw={a ? b ? c ? "..." : "..." : "..." : "..."} />
```

The cartesian product of all branches exceeds `maxVariants`. Split the expression into
multiple `tw=` attributes or increase `maxVariants` in plugin config.

### U7 — nested map depth exceeded {#u7-nested-map}

```tsx
items.map((a) => a.items.map((b) => b.items.map((c) => c.cls)))
```

`.map()` nesting is capped at 2 levels. Flatten the data structure before passing into
`tw=`.

### U8 — cross-file resolution depth exceeded {#u8-cross-file-depth}

```tsx
/* a.ts → b.ts → c.ts → d.ts — beyond hopDepth=2 */
import { X } from "./a"
<div tw={X} />
```

Increase `hopDepth` in plugin config, or inline the class string in the consuming file.

### U9 — runtime class composition {#u9-runtime-class-composition}

```tsx
const cls = [base, ...dynamicParts].join(" ")
<div tw={cls} />
```

When spread elements contain non-array runtime values the resolver gives up. Use a
whitelisted helper with explicit literal branches instead.

## Config options

```ts
createTwAstPlugin({
  /* CSS entry file for Tailwind compiler init */
  css: "./src/styles/globals.css",

  /* Throw on unresolvable in strict mode; warn + accumulate in loose mode.
     Default: true when command==="build" or NODE_ENV==="production", false otherwise. */
  strict: true,

  /* Maximum number of variant strings produced by a single tw= expression.
     Cartesian overflow diagnostic fires when exceeded. Default: 64. */
  maxVariants: 64,

  /* Maximum import hops for cross-file resolution. Default: 2. */
  hopDepth: 2,
})
```

## Diagnostic format

```
[flare:tw] <kind> at <file>:<line>:<col>
  > <offending source line>
    ^^^^^^
  <message>
  Fix options:
    1. <remediation hint>
    2. <remediation hint>
```

`kind` is one of:

- `unresolvable` — expression cannot be statically evaluated
- `cartesian-overflow` — too many variant combinations
- `depth-exceeded` — recursion or hop depth limit hit
- `helper-unknown` — non-whitelisted function call

In non-strict (dev) mode diagnostics are printed as `console.warn` output.
In strict (build/production) mode the transform throws, halting the build.

Accumulated diagnostics are available for CI tooling via the plugin object:

```ts
const plugin = createTwAstPlugin({ ... })
// after build:
const diags = plugin.getDiagnostics()  // Map<filePath, TwDiagnostic[]>
```

## Migration from legacy regex plugin

The legacy `tailwind.ts` regex plugin rewrites `tw=` using text patterns. The AST resolver
replaces it for all expression-level `tw=` usage.

Migration steps:

1. Replace `createTailwindPlugin()` with `createTwAstPlugin({ css: "..." })` in `vite.config.ts`.
2. Remove any custom regex patches for `tw=` handling.
3. Run the dev server — unresolvable diagnostics surface as warnings so you can audit each one.
4. Switch unsupported shapes to a whitelisted helper or explicit conditional branches.
5. Once warnings are clear, set `strict: true` explicitly (or rely on the production default).

The AST resolver handles all shapes the regex plugin covered (S1 static string) plus
dynamic expressions (S2–S9). The `styles()` call `tw` field is also handled for both plugins.
