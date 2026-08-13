# Flare Env System Design

## Part A: Typed Server Env + Drop Phantoms (ready to implement)

### Context

Builder context types hardcode `env: unknown`. Adding `ResolvedEnv` via FlareRegister makes env type-safe across all builders. Also dropping `__auth` phantom — exposing real properties on handler instead.

### Changes

**1. `src/route-builder/register.ts`** — add ResolvedEnv

```ts
export type ResolvedEnv = "env" extends keyof FlareRegister ? FlareRegister["env"] : unknown
```

**2. `src/server-handler/index.ts`** — drop phantom, expose real props

```ts
/* before */ ServerHandler<TEnv> & { readonly __auth?: TAuth }
/* after  */ ServerHandler<TEnv> & {
  readonly authenticateFn?: ServerHandlerConfig<TAuth, TEnv>["authenticateFn"]
  readonly serverContext?: ServerHandlerConfig<TAuth, TEnv>["serverContext"]
}
```

**3. Builder context types** — `env: unknown` → `env: ResolvedEnv` in 12 interfaces:

- create-page: PageAuthorizeContext, PagePreloaderContext, PageLoaderContext, PageHeadersContext
- create-layout: LayoutAuthorizeContext, LayoutPreloaderContext, LayoutLoaderContext, LayoutHeadersContext
- create-root-layout: RootAuthorizeContext, RootPreloaderContext, RootLoaderContext, RootHeadersContext

**4. Barrel exports** — add ResolvedEnv to `route-builder/index.ts` + `index.ts`

**5. `src/generators/index.ts`** — always import handler, emit types from real signatures:

```ts
auth: NonNullable<Awaited<ReturnType<NonNullable<(typeof _FlareHandler)["authenticateFn"]>>>>
env: Parameters < typeof _FlareHandler["fetch"] > [1]
serverContext: Awaited<ReturnType<NonNullable<(typeof _FlareHandler)["serverContext"]>>>
```

**6. Regenerate** routes.gen.ts for E2E app

### Verify

```bash
cd public/flare && bunx vitest run
cd public/flare-e2e && bunx playwright test
```

---

## Part B: Public Env Design (needs deeper thinking)

### Problem

Apps need env vars accessible in both server AND browser. Two categories:

- **Server env**: secrets, DB bindings, API keys — never reaches client
- **Public env**: API URLs, feature flags, analytics IDs — needed everywhere

### Prior Art: Ecomet TanStack Start Pattern

Split into `src/env/server/` and `src/env/client/`:

- Server: validates full env via zod schema (secrets + public vars + platform bindings)
- Client: auto-generated, picks `PUBLIC_*` keys, reads from `import.meta.env`
- Vite bridge: reads platform config → filters `PUBLIC_*` vars → populates Vite `define` map
- Boundary safety: separate directories prevent importing server env in client code

### How Other Frameworks Handle This

| Framework      | Build-time public          | Runtime public                | Typed           |
| -------------- | -------------------------- | ----------------------------- | --------------- |
| Next.js        | `NEXT_PUBLIC_*` via define | No                            | No              |
| Vite           | `VITE_*` / custom prefix   | No                            | `ImportMetaEnv` |
| Nuxt           | `runtimeConfig.public`     | Yes, serialized in `__NUXT__` | Yes             |
| SvelteKit      | `$env/static/public`       | `$env/dynamic/public`         | Yes             |
| Remix          | No built-in                | Root loader data              | Manual          |
| TanStack Start | No built-in                | No built-in                   | Manual          |

### Options for Flare

#### Option 1: Vite `import.meta.env` only (status quo)

- User sets `envPrefix: "PUBLIC_"` in vite config
- Vite bridge reads wrangler.jsonc → populates `define` map
- Typed via `ImportMetaEnv` declaration
- **Pro**: zero framework code, already works
- **Con**: build-time only, no runtime public env from CF bindings

#### Option 2: Root loader pattern

- Public values returned from root layout loader → SSR-hydrated → accessible in component tree
- **Pro**: already works, typed, runtime-configurable
- **Con**: only accessible inside component tree (not in standalone utils)

#### Option 3: Framework `publicEnv` factory

```ts
createServerHandler({
  env: { ... },
  publicEnv: (env) => ({
    apiUrl: env.PUBLIC_API_BASE_URL,
    version: env.PUBLIC_VERSION,
  }),
})
```

- Serialized into SSR HTML as `<script>window.__FLARE_PUBLIC__=...</script>`
- `getPublicEnv()` accessor works server + client
- Typed via `FlareRegister["publicEnv"]`
- **Pro**: works everywhere, typed, runtime values
- **Con**: new API surface, serialization overhead, must be JSON-serializable

#### Option 4: Zod schema + prefix convention (Nuxt-like)

```ts
createServerHandler({
	envSchema: z.object({
		SECRET_KEY: z.string(),
		PUBLIC_API_URL: z.url(),
		DB: z.custom<SomeBinding>(),
	}),
})
```

- Framework auto-splits by `PUBLIC_*` prefix
- Server gets full type, client gets Pick<Env, PUBLIC\_\*>
- Auto-generates Vite define mappings for dev
- **Pro**: single source of truth, auto client/server split
- **Con**: couples env definition to framework, may conflict with platform conventions

### Open Questions

1. **Is runtime public env needed?** Or is Vite build-time + root loader enough?
2. **Should public env be framework-managed or user-land?** Nuxt/SvelteKit manage it, Next.js/Remix don't
3. **Platform bindings**: some env values aren't serializable (DB connections, service bindings, etc). Only primitive values can be public. Should the framework enforce this or trust the user?
4. **Dev DX**: platform-specific env files (wrangler.jsonc, .env, etc) need to sync into Vite's define. Flare's Vite plugin could provide a hook or helper for this, platform-agnostically
5. **Typing**: separate `FlareRegister["publicEnv"]` or auto-derive from `FlareRegister["env"]` via prefix filtering?
6. **Platform agnostic**: env source varies (CF Workers fetch param, Node process.env, Deno.env, Bun.env, etc). The framework must not assume any specific platform

### Recommendation

Ship Part A now (typed server env). For public env, start with Option 1+2 (Vite + root loader). Revisit Option 3 or 4 if users hit pain points. The root loader pattern covers most runtime public env needs without new API surface.
