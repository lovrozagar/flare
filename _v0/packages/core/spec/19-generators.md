# Generators

Layer 7. Tooling. Depends on router-primitives (TreeNode, RouteData, insertRoute), config (FlareBuildConfig).

Code generation for route manifests and TypeScript declarations. Scans source files, extracts route definitions, writes `*.gen.*` files.

## Types

```ts
interface GenerateRoutesOptions {
	ignorePrefix: string;
	outputPath: string;
	rootDir: string;
	srcDir: string;
}

interface GenerateRoutesResult {
	files: string[];
	layouts: number;
	routes: number;
}

interface GenerateRouteTypesOptions {
	outputPath: string;
	serverEntryPath: string;
	srcDir: string;
}
```

## Exports

```ts
generateRoutes(options: GenerateRoutesOptions): GenerateRoutesResult
generateRouteTypes(options: GenerateRouteTypesOptions): void
```

## Behavior

### `generateRoutes`

Scans source files for route definitions, generates route manifest.

#### Step 1: Scan files

Recursively scan `srcDir` for `.ts` / `.tsx` files. Skip:

- Files starting with `ignorePrefix` (default `_`)
- `_gen/` directories
- `*.gen.ts` / `*.gen.tsx` files
- `node_modules`

#### Step 2: Extract route definitions

Match patterns in file content:

```ts
/* Pages */
/export\s+const\s+(\w+)\s*=\s*createPage\s*(?:<[^>]*>)?\s*\(\s*["'`]([^"'`]+)["'`]/g

/* Layouts */
/export\s+const\s+(\w+)\s*=\s*createLayout\s*(?:<[^>]*>)?\s*\(\s*["'`]([^"'`]+)["'`]/g

/* Root layouts */
/export\s+const\s+(\w+)\s*=\s*createRootLayout\s*(?:<[^>]*>)?\s*\(\s*["'`]([^"'`]+)["'`]/g
```

Extracts: `exportName` and `virtualPath` from each match.

Boundaries are defined via chain methods (`.errorRender()`, `.notFoundRender()`, `.unauthorizedRender()`) on route builders — no separate extraction needed. The generated manifest includes the full route module; boundary render functions are accessed at runtime via the loaded module's result object.

#### Step 3: Validate

- Duplicate virtualPaths → error
- Invalid virtualPath format → error (page ending with group, layout not ending with group, etc.)
- Missing root layout → warning

#### Step 4: Generate manifest

Output file: `src/_gen/routes.gen.ts`

```ts
/* Auto-generated. Do not edit. */
import { createTreeNode, insertRoute } from "@lovrozagar/flare/router-primitives";

const tree = createTreeNode();

insertRoute(tree, "/", {
	e: "HomePage",
	o: {},
	p: () => import("../routes/home").then((m) => ({ default: m.HomePage })),
	t: "r",
	v: "/",
	x: "_root_/index",
});

insertRoute(tree, "/products/[id]", {
	e: "ProductPage",
	o: { prefetch: "intent", staleTime: 30000 },
	p: () => import("../routes/products/[id]").then((m) => ({ default: m.ProductPage })),
	t: "r",
	v: "/products/[id]",
	x: "_root_/(shop)/products/[id]",
});

export const routeTree = tree;

export const layouts: Record<string, () => Promise<{ default: unknown }>> = {
	_root_: () => import("../routes/_root_").then((m) => ({ default: m.RootLayout })),
	"_root_/(shop)": () => import("../routes/(shop)").then((m) => ({ default: m.ShopLayout })),
	"_root_/(auth)": () => import("../routes/(auth)").then((m) => ({ default: m.AuthLayout })),
};
```

- Pages inserted into route tree via `insertRoute`
- Layouts exported as lazy loader record
- `o` field populated from route's `.options()` call (prefetch, staleTime, gcTime) and `.authenticate()` call (authenticate: boolean)
- Import paths are relative from output file to source file
- `p` wraps import to extract named export as `.default`

### `generateRouteTypes`

Generates TypeScript declarations for route-level type safety.

#### Step 1: Detect capabilities

```ts
const hasAuthenticate = detectAuthenticateFn(serverEntryPath);
/* Scans server entry for: export const authenticateFn */
```

#### Step 2: Extract route metadata

For each route definition:

- `authenticate`: `true` if `.authenticate()` called, `false` otherwise
- `virtualPath`
- `exportName`

#### Step 3: Generate type declarations

Output file: `src/_gen/types.gen.d.ts`

```ts
/* Auto-generated. Do not edit. */
import "@lovrozagar/flare";

declare module "@lovrozagar/flare" {
	interface FlareRegister {
		auth: import("../server").AppAuth;
		env: import("../server").AppEnv;
		loaderData: {
			"_root_/(shop)/products/[id]": import("../routes/products/[id]").ProductPage extends {
				_type: "render";
				loader?: (...args: any[]) => infer R;
			}
				? Awaited<R>
				: void;
			/* ... one entry per route with .loader() */
		};
		preloaderContext: {
			_root_: import("../routes/_root_").RootLayout extends {
				preloader?: (...args: any[]) => infer R;
			}
				? Awaited<R>
				: Record<string, never>;
			/* ... one entry per route with .preloader() */
		};
		routes: {
			"/": { params: Record<string, string>; search: Record<string, string> };
			"/products/[id]": { params: { id: string }; search: Record<string, string> };
			/* ... one entry per route, params/search extracted from .input() */
		};
	}
}
```

Augments Flare's module with:

- `auth` / `env`: app-wide types from server entry
- `routes`: per-route params/search types for type-safe `navigate()`, `buildUrl()`, `<Link>`
- `loaderData`: per-route loader return types for type-safe `useLoaderData({ from })`
- `preloaderContext`: per-route preloader return types for type-safe `usePreloaderContext({ from })`

Params extracted from `.input({ params })` — defaults to `Record<string, string>` if no `.input()`. Search extracted from `.input({ searchParams })` — defaults to `Record<string, string>`.

### Watch Mode

In development, generators re-run on file changes:

1. Watch `srcDir` recursively
2. Ignore: `_gen/`, `*.gen.ts`, `*.gen.tsx`
3. Debounce: 100ms (rapid saves don't trigger multiple regenerations)
4. On `.ts` / `.tsx` change: re-run `generateRoutes` + `generateRouteTypes`
5. On server entry change: re-run `generateRouteTypes` (auth/env types may change)

### Route Options Extraction

Generator reads `.options()` calls from route definitions to populate `RouteMeta`:

```ts
/* Source */
createPage("_root_/products/[id]")
  .options({ prefetch: "intent", staleTime: 30000 })

/* Generated */
insertRoute(tree, "/products/[id]", {
  o: { prefetch: "intent", staleTime: 30000 },
  ...
})
```

Options are statically extracted (regex/AST). Dynamic options not supported — must be literal values.

## Test Cases

```
File scanning:
  Finds .ts and .tsx files in srcDir
  Ignores files starting with ignorePrefix
  Ignores _gen/ directories
  Ignores *.gen.ts files
  Ignores node_modules
  Recursive directory scanning

Route extraction:
  createPage with virtualPath → extracted
  createLayout with virtualPath → extracted
  createRootLayout with virtualPath → extracted
  Named export detected (exportName)
  Generic type params in call → ignored (virtualPath still extracted)
  Multiple routes in one file → all extracted
  Template literal virtualPath → extracted
  Double-quoted virtualPath → extracted
  Single-quoted virtualPath → extracted

Validation:
  Duplicate virtualPaths → error
  Page virtualPath ending with (group) → error
  Layout virtualPath not ending with (group) → error
  Root layout path not matching _name_ → error
  Missing root layout → warning
  Valid paths → no error

Generated manifest:
  Route tree built with insertRoute calls
  Layouts exported as lazy loader record
  Import paths relative from output to source
  Named export wrapped in .then(m => ({ default: m.ExportName }))
  RouteData fields: e (exportName), o (options), p (loader), t (type: "r"/"x"), v (variablePath), x (virtualPath)
  Response routes (.response()) → t: "x"
  Render routes (.render()) → t: "r"

Route options:
  .options({ prefetch: "intent" }) → o: { prefetch: "intent" }
  .options({ staleTime: 30000 }) → o: { staleTime: 30000 }
  .authenticate() → o: { authenticate: true }
  No .options() and no .authenticate() → o: {}
  Multiple options + authenticate → all included in o

Type generation:
  FlareRegister augmented with auth type
  FlareRegister augmented with env type
  FlareRegister.routes generated with per-route params/search
  FlareRegister.loaderData generated with per-route loader return types
  FlareRegister.preloaderContext generated with per-route preloader return types
  Route with .input({ params }) → params type narrowed
  Route without .input() → params defaults to Record<string, string>
  Types imported from server entry
  No authenticateFn → auth type is null

Watch mode:
  File change → regenerate after 100ms debounce
  Rapid changes → single regeneration
  _gen/ changes → ignored (no infinite loop)
  Server entry change → types regenerated
```

## Notes

- Generated files are `*.gen.*` — never edited manually, always regenerated
- Static extraction only — options must be literal values, not variables or computed expressions
- Route discovery is explicit (named exports with `createPage`/`createLayout`/`createRootLayout`) — not filesystem-based
- Import paths use relative resolution from generated file location
- Debounce prevents rapid-fire regeneration during multi-file saves
- Generator runs at build start and in watch mode — always up to date
- TanStack Query is optional in v2 (spec 33) — `queryClientGetter` configured in `createRouter` (spec 25), not detected by generator
