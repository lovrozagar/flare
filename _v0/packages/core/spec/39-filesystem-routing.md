# 39 - Filesystem-Based Route Codegen

## Status: Draft

## Summary

Derive route virtual paths from filesystem structure instead of manual string arguments. The generator detects route files by suffix convention, derives virtual paths from folder hierarchy, writes the `createPage("derived-path")` line into source files, and generates `routes.gen.ts` as before.

Enabled via Vite plugin config:

```ts
flare({
	fsCodegen: true /* default: true — auto-generate virtual paths from filesystem */,
});
```

When `false`: falls back to current behavior (regex scanning file contents for `createPage("string")`). User manages virtual paths manually.

## Design Decisions

### File Suffix Convention

| Suffix                          | Builder              | Purpose                   |
| ------------------------------- | -------------------- | ------------------------- |
| `*.page.{ts,tsx,js,jsx}`        | `createPage()`       | Page route                |
| `*.layout.{ts,tsx,js,jsx}`      | `createLayout()`     | Layout (pathless wrapper) |
| `*.root-layout.{ts,tsx,js,jsx}` | `createRootLayout()` | Root layout               |

- Filename prefix is freeform (for IDE Ctrl+P discoverability)
- One file per type per **single directory** (generator validates, errors on duplicates)
- A directory can have a `.page` AND contain subdirectories with their own `.page` files — that's separate directories
- Files without matching suffix are ignored (co-locate helpers freely)
- Directories starting with `_` are ignored entirely (e.g. `_components/`, `_utils/`)

### Folder Structure = Virtual Path

All routes live in folders. No flat files.

| Folder path                         | Virtual path         | URL            |
| ----------------------------------- | -------------------- | -------------- |
| `routes/about/x.page.tsx`           | `_root_/about`       | `/about`       |
| `routes/blog/[slug]/x.page.tsx`     | `_root_/blog/[slug]` | `/blog/[slug]` |
| `routes/sitemap.xml/x.page.tsx`     | `_root_/sitemap.xml` | `/sitemap.xml` |
| `routes/__root__/x.root-layout.tsx` | `_root_`             | -              |

### Layout Scoping (Model A: Layout as Parent)

Layouts use `(name)/` directories. Children nest inside. Explicit ancestry, no ambiguity.

```
routes/
  __root__/
    root.root-layout.tsx            -> _root_

  about/
    about.page.tsx                  -> _root_/about -> /about

  (blog)/                           <- layout scope
    blog.layout.tsx                 -> _root_/(blog)
    blog/
      list.page.tsx                 -> _root_/(blog)/blog -> /blog
      [slug]/
        post.page.tsx               -> _root_/(blog)/blog/[slug] -> /blog/[slug]

  (auth)/                           <- layout scope (pathless)
    auth.layout.tsx                 -> _root_/(auth)
    login/
      login.page.tsx                -> _root_/(auth)/login -> /login
    signup/
      signup.page.tsx               -> _root_/(auth)/signup -> /signup

  (products)/                       <- layout scope
    products.layout.tsx             -> _root_/(products)
    products/
      list.page.tsx                 -> _root_/(products)/products -> /products
      [id]/
        detail.page.tsx             -> _root_/(products)/products/[id] -> /products/[id]

  _components/                      <- ignored (starts with _)
    Button.tsx
  _utils/                           <- ignored
    format.ts
```

### Virtual Path Derivation Rules

1. Walk from file to `routes/` root, collecting directory names
2. `(name)` directories -> group segments (pathless)
3. Regular directories -> URL path segments
4. `__name__/` directories -> root layout scope (e.g. `__root__/` -> `_root_` prefix)
5. `_name/` directories -> ignored entirely (helpers, components, utils)
6. Root layout prefix defaults to `_root_` for routes not inside a `__name__/` directory

### URL Computation (unchanged from current)

Virtual path -> URL:

- Strip root layout prefix (`_root_/` removed)
- Strip group segments (`(name)/` removed)
- Result = URL pattern

### Deep Nesting Example

4 nested layouts (deep-cache E2E test case):

```
(deep-cache)/
  dc.layout.tsx                     -> _root_/(deep-cache)
  (dc-inner)/
    inner.layout.tsx                -> _root_/(deep-cache)/(dc-inner)
    (dc-deep)/
      deep.layout.tsx               -> _root_/(deep-cache)/(dc-inner)/(dc-deep)
      (dc-leaf)/
        leaf.layout.tsx             -> _root_/(deep-cache)/(dc-inner)/(dc-deep)/(dc-leaf)
        deep-cache/
          index.page.tsx            -> /deep-cache
          store-page/
            store.page.tsx          -> /deep-cache/store-page
          uncached/
            uncached.page.tsx       -> /deep-cache/uncached
```

### Multiple Root Layouts

```
routes/
  __root__/
    root.root-layout.tsx            -> _root_
  __admin__/
    admin.root-layout.tsx           -> _admin_

  about/
    about.page.tsx                  -> _root_/about (default scope)

  __admin__/
    dashboard/
      dash.page.tsx                 -> _admin_/dashboard
```

### Special URL Segments

Dots in directory names are literal URL segments:

```
routes/
  sitemap.xml/
    sitemap.page.tsx                -> /sitemap.xml (response route)
  robots.txt/
    robots.page.tsx                 -> /robots.txt
  .well-known/
    security.txt/
      security.page.tsx             -> /.well-known/security.txt
```

### Param Segments

Existing bracket convention, unchanged:

| Directory name | Segment type       |
| -------------- | ------------------ |
| `[id]`         | Single param       |
| `[...slug]`    | Required catch-all |
| `[[...slug]]`  | Optional catch-all |

## What the Developer Does

1. Create a file with the right suffix in the right folder
2. Write the builder chain (`.loader()`, `.head()`, `.render()`, etc.)

The generator handles everything else.

### New File Scaffolding

When the generator detects a new empty (or missing builder call) route file, it scaffolds the initial content:

```tsx
/* @flare-generated */
export const route = createPage("_root_/(blog)/blog/[slug]");
```

The developer then adds their chain methods below.

### Export Name

Always `route`. The route tree in `routes.gen.ts` already renames exports semantically (R0, R1, etc.) so the source export name is irrelevant to the output.

## What the Generator Does

1. Scan `routes/` for `*.page.tsx`, `*.layout.tsx`, `*.root-layout.tsx` by file suffix
2. Derive virtual path from each file's folder position
3. Write `export const route = createPage("derived-virtual-path")` into the source file (auto-managed line)
4. Validate (no duplicate virtual paths, max one per type per dir)
5. Generate `routes.gen.ts` with tree, lazy imports, and type registry
6. Watch mode: on file add/move/delete, re-derive paths and update source files + `routes.gen.ts`

The virtual path string in the source file provides TypeScript with the type information needed for param inference (e.g. `ctx.location.params.slug` from `[slug]` in path). The generator owns this line — developers never write or edit it.

### Developer's file after generator runs

```tsx
/* routes/(blog)/blog/[slug]/post.page.tsx */

/* @flare-generated */
export const route = createPage("_root_/(blog)/blog/[slug]")
	.loader((ctx) => fetchPost(ctx.location.params.slug))
	.head((ctx) => ({ title: ctx.loaderData.title }))
	.render((props) => <BlogPost post={props.loaderData} />);
```

The `createPage("_root_/(blog)/blog/[slug]")` line is written and maintained by the generator. Moving the file updates it automatically.

## What Does NOT Change

- Builder chain API (`.loader()`, `.head()`, `.render()`, etc.)
- Route tree data structure (TreeNode, RouteData)
- `routes.gen.ts` output format
- Type registry module augmentation
- URL computation logic
- Layout ancestry derivation (prefix-based)
- Runtime matching (radix tree)

## Migration

Clean break. No backwards compatibility.

- Generator ONLY detects files by suffix (`*.page.tsx`, `*.layout.tsx`, `*.root-layout.tsx`)
- Old-style files (`about.tsx` with `createPage("string")` inside) are invisible to the new generator
- Migration: rename files to use suffix convention, place in correct folder structure, let generator write the `createPage()` line
- The regex-based content scanning (`PAGE_RE`, `LAYOUT_RE`, `ROOT_LAYOUT_RE`) is removed entirely
