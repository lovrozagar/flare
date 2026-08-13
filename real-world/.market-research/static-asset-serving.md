last updated: 2026-03-08

# Static Asset Serving Across Frameworks & Platforms

## Executive Summary

- **"Assets before framework" is NOT universal.** CF Workers worker-first, Next.js proxy/middleware, and Netlify edge functions all route requests through app code before static files.
- Every major platform provides a mechanism to skip/exclude static paths from dynamic processing, but the approaches differ wildly (config-based vs code-based vs routing-phase-based).
- In self-hosted Node scenarios, the **consumer** is responsible for static file serving ordering (express.static, sirv, etc). Frameworks provide handler exports, not full servers.
- Cloudflare Workers is unique: `run_worker_first` with glob patterns gives the most granular, config-only control over which requests hit the worker vs get served as assets.
- The standard pattern across all platforms: immutable hashed assets get aggressive caching (`max-age=31536000`), other static files get shorter cache or none.

---

## 1. Cloudflare Workers

### Assets-First (Default)
With `run_worker_first = false` (the default), CF tries to match the request against static assets first. The worker script is only invoked if no asset matches.

### Worker-First
With `run_worker_first = true`, the worker is **unconditionally invoked** for every request. The worker must then explicitly call `env.ASSETS.fetch(request)` to serve static files.

### Selective Worker-First (Array of Patterns)
`run_worker_first` accepts an array of glob patterns with `*` for deep matching and `!` prefix for negation. Negative patterns take precedence. Pattern order is insignificant.

```toml
# wrangler.toml
[assets]
directory = "./dist/"
binding = "ASSETS"
not_found_handling = "single-page-application"

# Only run worker for /api/* except /api/docs/*
run_worker_first = ["/api/*", "!/api/docs/*"]
```

### Worker Code When worker-first
```ts
export default {
  async fetch(request, env) {
    /* auth check, logging, etc */
    return env.ASSETS.fetch(request)
  }
}
```

### Key Details
- `env.ASSETS.fetch()` respects `html_handling` and `not_found_handling` config
- Only the pathname matters when matching assets (hostname is ignored)
- Smart Placement + `run_worker_first = true` may cause latency issues (assets travel through placed worker instead of edge)
- SPA mode: `not_found_handling = "single-page-application"` returns `index.html` with 200 for missing assets

### Verdict
CF Workers gives the **most explicit control** of any platform. The consumer decides via config, not code.

---

## 2. Vercel

### Build Output API Routing Phases
Vercel's routing is phase-based via `config.json` routes. The phases are:

```
rewrite -> filesystem -> resource -> miss -> hit -> error
```

The `{ handle: "filesystem" }` handler route tells Vercel to check `.vercel/output/static` and `.vercel/output/functions` for matches. Routes before this handler run before filesystem checks.

### Middleware/Proxy (Next.js 16: proxy.ts, previously middleware.ts)
**Proxy runs BEFORE filesystem routes.** The documented execution order is:

1. `headers` from `next.config.js`
2. `redirects` from `next.config.js`
3. **Proxy (rewrites, redirects, etc.)**
4. `beforeFiles` rewrites from `next.config.js`
5. **Filesystem routes (`public/`, `_next/static/`, `pages/`, `app/`, etc.)**
6. `afterFiles` rewrites from `next.config.js`
7. Dynamic Routes (`/blog/[slug]`)
8. `fallback` rewrites from `next.config.js`

This means **proxy/middleware runs on every request by default, including static file requests.** You must use a `matcher` config to exclude static paths:

```js
/* proxy.ts */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
}
```

### Key Details
- No built-in "skip static" flag. Consumer must maintain regex exclusions in matcher.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`. Runtime is now Node.js only (no longer Edge by default).
- `_next/data` routes are ALWAYS processed by proxy even when excluded in matcher pattern (intentional security measure).
- On Vercel platform, Edge Middleware runs before the Edge Cache, so even cached static files can have middleware applied.
- In `output: "standalone"` mode, `server.js` auto-serves `public/` and `.next/static/` if you copy them into the right place.

### Verdict
Vercel routes everything through middleware/proxy first, then filesystem. Consumer must opt out of static processing via regex matcher. Not ideal.

---

## 3. Netlify

### Request Processing Pipeline (Full Order)
1. Firewall Traffic Rules
2. Web Application Firewall (WAF)
3. Rate Limiting
4. Password Protection
5. **Edge Functions (Pre-Cache)** -- middleware-style workloads
6. **Edge Cache** -- serves cached responses
7. **Edge Functions (Post-Cache)** -- generates final responses
8. Durable Cache
9. Image CDN (`/.netlify/images`)
10. **Serverless Functions**
11. **Redirects & Rewrites** (`_redirects` / `netlify.toml`)
12. **Static Files** -- matches URL path against publish directory filenames
13. 404 Handler

### Key Details
- Static files are checked **last** (step 12), after edge functions, serverless functions, and redirects.
- Edge functions configured with caching **shadow static files**: if an edge function on `/*` is cached, `/cat.png` serves the edge function, not the static file.
- `preferStatic: true` on serverless functions makes them act as fallbacks (static files served first for that path).
- Redirects without `force: true` only apply when the source path doesn't match an existing static file (shadowing behavior).
- With `force: true`, redirects always apply regardless of static file existence.

### Verdict
Netlify's pipeline is the most complex. Edge functions run before static files by default, but the `preferStatic` flag and redirect shadowing give some control.

---

## 4. Node.js Servers (Express / Fastify / Hono)

### Express
```js
app.use(compression())

/* Hashed immutable assets -- aggressive cache */
app.use("/assets", express.static("build/client/assets", {
  immutable: true,
  maxAge: "1y"
}))

/* Other static files -- short cache */
app.use(express.static("build/client", { maxAge: "1h" }))

/* Framework handler (SSR) -- catches everything else */
app.use(handler)
```

**Ordering matters.** `express.static` is middleware that checks the filesystem and either serves the file (ending the chain) or calls `next()`. Consumer controls the order entirely.

### Fastify
`@fastify/static` is a plugin, not middleware. When `wildcard: true`, it registers a wildcard route. Static routes are checked before parametric/wildcard routes by Fastify's router. The plugin configuration determines which directory to serve and with what options.

### Hono
Hono has platform-specific `serveStatic` implementations:
- **Bun**: `import { serveStatic } from "hono/bun"`
- **Node**: `import { serveStatic } from "@hono/node-server/serve-static"`
- **CF Workers**: `import { serveStatic } from "hono/cloudflare-workers"` (uses `env.ASSETS.fetch()` internally)

On CF Workers specifically, Hono's `serveStatic` just delegates to the ASSETS binding. In practice, you typically let CF handle static files at the platform level rather than through Hono middleware.

### Verdict
**Consumer is fully responsible.** The framework exports a handler; the consumer decides where to place `express.static()` / `serveStatic()` in the middleware chain.

---

## 5. Vite Dev Server

### How It Works
Vite serves `/public` directory files at the root path `/` during development. This is handled by Vite's internal middleware stack.

### SSR Middleware Mode
```js
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom"
})

/* Vite's middlewares handle: HMR, /public files, module transforms */
app.use(vite.middlewares)

/* SSR handler runs AFTER Vite's middlewares */
app.use("*all", ssrHandler)
```

### Key Details
- `appType: "custom"` disables Vite's built-in HTML serving (important for SSR)
- `vite.middlewares` is a Connect instance -- it includes static file serving from `/public`
- Static files from `/public` are served **before** the SSR handler because `vite.middlewares` is registered first
- In production, the consumer replaces `vite.middlewares` with their own `express.static("dist/client")` or equivalent
- `configureServer` hook allows plugins to add middleware. Using `return () => {}` (post hook) ensures custom middleware runs **after** Vite's built-in middleware

### Verdict
Vite's dev server serves static files before SSR by default. The consumer controls production ordering.

---

## 6. SvelteKit Adapters

### adapter-node
Uses `sirv` internally to serve static files. The handler exports a middleware function that chains:

1. **Client assets** (sirv) -- serves `_app/immutable/*` with `Cache-Control: public, max-age=31536000, immutable`
2. **Prerendered pages** (sirv) -- serves prerendered HTML, handles trailing slash normalization with 308 redirects
3. **SSR handler** -- dynamic server rendering

The `sequence()` function chains these: each handler can short-circuit by responding or call `next()` to fall through. Static files are always checked first.

**Important**: No config to customize sirv options (no custom cache headers for `/static` directory files). The handler auto-serves both static and prerendered content.

```js
/* Custom server usage */
import { handler } from "./build/handler.js"
app.use(handler) /* handles static + prerendered + SSR */
```

### adapter-cloudflare (Pages)
Generates a `_routes.json` that tells Cloudflare Pages which paths to route to the worker vs serve as static. Config in `svelte.config.js`:

```js
adapter({
  routes: {
    include: ["/*"],
    exclude: ["<all>"] /* <build>, <files>, <prerendered>, <redirects> */
  }
})
```

Placeholders:
- `<build>` = Vite build artifacts (`_app/immutable/*`)
- `<files>` = contents of `static/` directory
- `<prerendered>` = prerendered pages
- `<all>` = all of the above

Excluded routes bypass the worker entirely (served directly by CF CDN). Max 100 combined include/exclude rules.

### Verdict
SvelteKit provides the best framework-level abstraction: adapter-node auto-handles static ordering via sirv, adapter-cloudflare auto-generates `_routes.json` to skip worker for static. **The framework handles it, not the consumer.**

---

## 7. Next.js on Self-Hosted Node

### How `next start` Works
- Next.js runs its own Node.js server
- Static files from `.next/static/` and `public/` are served by the built-in server
- In `output: "standalone"` mode, you must manually copy `public/` and `.next/static/` into `standalone/` directory
- The minimal server auto-serves these once copied

### Proxy/Middleware and Static Files
Proxy runs at step 3, filesystem check at step 5 (see Vercel section above). This order applies even when self-hosted.

**The matcher config is essential** to prevent proxy from processing static file requests unnecessarily.

### Recommended Setup
```
nginx (reverse proxy, handles TLS, rate limiting)
  -> next start (serves everything including static)
```

Or: serve static from CDN/nginx, let Next.js handle only dynamic routes.

### Verdict
Next.js handles static serving internally. Proxy/middleware still runs before filesystem checks unless excluded via matcher. Consumer controls nginx/CDN layer.

---

## 8. React Router (Remix)

### @react-router/serve (Built-in Server)
Uses Express internally with this middleware stack:
1. `compression`
2. `express.static` (serve-static)
3. `morgan` (logging)
4. React Router request handler

Static files served **before** the framework handler. No customization available -- by design. If you need custom middleware, migrate to `@react-router/express`.

### Custom Express Server (node-custom-server template)
```js
/* Production */
app.use("/assets", express.static("build/client/assets", {
  immutable: true,
  maxAge: "1y"
}))
app.use(express.static("build/client", { maxAge: "1h" }))
app.use(await import(BUILD_PATH).then((mod) => mod.app))

/* Development */
const vite = await import("vite").then(v => v.createServer({
  server: { middlewareMode: true }
}))
app.use(vite.middlewares)
app.use(ssrHandler)
```

### Key Details
- Hashed assets in `build/client/assets/` get immutable caching
- General static files in `build/client/` get 1h cache
- In dev, Vite handles static files through its middleware
- The consumer controls ordering in custom server setups

### Verdict
Similar to SvelteKit adapter-node pattern. Default server handles static before framework. Custom server: consumer's responsibility.

---

## Cross-Cutting Analysis

### Is "assets served before framework" universal?

**No.**

| Platform/Framework | Default Behavior | Static-First? |
|---|---|---|
| CF Workers (assets-first) | Assets checked first, worker only on miss | Yes |
| CF Workers (worker-first) | Worker always runs first | **No** |
| Vercel/Next.js | Proxy/middleware runs before filesystem | **No** |
| Netlify | Edge functions run before static files | **No** |
| Express/Fastify/Hono | Consumer decides ordering | Depends |
| Vite dev server | Vite middlewares (incl. static) before SSR | Yes |
| SvelteKit adapter-node | sirv serves static before SSR handler | Yes |
| React Router @react-router/serve | express.static before handler | Yes |

### Who provides "skip static" config/matcher?

| Platform/Framework | Mechanism | Type |
|---|---|---|
| CF Workers | `run_worker_first` array with glob + `!` negation | Config (wrangler.toml) |
| Next.js/Vercel | `matcher` in proxy.ts with regex negative lookahead | Code (proxy.ts) |
| Netlify | Edge function declarations (path patterns), `preferStatic` | Config (netlify.toml) |
| SvelteKit adapter-cloudflare | `routes.exclude` with `<build>`, `<files>` placeholders | Config (svelte.config.js) |
| SvelteKit adapter-node | N/A (auto-handled by sirv ordering) | Built-in |
| Express/Node | Middleware ordering (place express.static first) | Code |
| React Router | Middleware ordering in custom server | Code |

### In worker-first / self-hosted scenarios, who handles static files?

| Scenario | Responsible Party |
|---|---|
| CF Workers worker-first | Worker must call `env.ASSETS.fetch()` explicitly |
| CF Workers assets-first | Platform handles it (worker never sees static requests) |
| Next.js self-hosted | Next.js internal server handles it automatically |
| SvelteKit adapter-node | Framework handler (sirv) handles it automatically |
| React Router @react-router/serve | Built-in Express server handles it |
| Custom Express/Fastify/Hono | **Consumer** must set up express.static / serveStatic |
| Vercel platform | Platform CDN handles static from `.vercel/output/static` |
| Netlify platform | Platform CDN handles static from publish directory |

---

## Implications for Framework Design

### If building a framework that deploys to multiple targets:

1. **CF Workers**: Use `run_worker_first` patterns to avoid processing static requests in the worker. Or use assets-first default and only handle dynamic routes.

2. **Vercel**: Generate proper `config.json` routes with `{ handle: "filesystem" }` placed after middleware routes. The framework's build step should output the right routing config.

3. **Netlify**: Generate `_redirects` and edge function declarations that account for the pipeline order. Use `preferStatic` where appropriate.

4. **Node.js self-hosted**: The framework should export a handler, but also provide guidance (or a utility) for static file serving. Consider SvelteKit's approach: the handler itself includes sirv-based static serving.

5. **Vite dev**: Use `vite.middlewares` before SSR handler. This is standard across all Vite-based frameworks.

### The cleanest pattern (SvelteKit model):
- Export a `handler` that auto-includes static file serving (via sirv)
- For platform adapters, generate platform-specific routing configs that exclude static paths from the handler
- Consumer never needs to think about static file ordering

### The CF Workers pattern for framework adapters:
- Default to assets-first (`run_worker_first = false`)
- Let the framework's wrangler config generator add API/dynamic route patterns to `run_worker_first` array
- Use `env.ASSETS.fetch()` as fallback in worker code for unmatched routes

---

## Sources

- [Cloudflare Workers Static Assets - Binding](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Workers Static Assets - Overview](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Workers - Worker Script Routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [Cloudflare Workers - Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Next.js proxy.ts File Convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Next.js Self-Hosting Guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js Middleware/Proxy Discussion #36308](https://github.com/vercel/next.js/discussions/36308)
- [Next.js 16 - Middleware to Proxy Rename](https://nextjs.org/docs/messages/middleware-to-proxy)
- [Vercel Build Output API - Primitives](https://vercel.com/docs/build-output-api/primitives)
- [Vercel Build Output API - Configuration](https://vercel.com/docs/build-output-api/configuration)
- [Vercel Build Output API - Features](https://vercel.com/docs/build-output-api/features)
- [Netlify Request Chain](https://docs.netlify.com/start/core-concepts/request-chain/)
- [Netlify Edge Functions Declarations](https://docs.netlify.com/build/edge-functions/declarations/)
- [Netlify Redirects](https://docs.netlify.com/routing/redirects/)
- [Vite SSR Guide](https://vite.dev/guide/ssr)
- [SvelteKit adapter-node](https://svelte.dev/docs/kit/adapter-node)
- [SvelteKit adapter-cloudflare](https://svelte.dev/docs/kit/adapter-cloudflare)
- [SvelteKit adapter-node handler.js Source](https://github.com/sveltejs/kit/blob/master/packages/adapter-node/src/handler.js)
- [React Router @react-router/serve API](https://reactrouter.com/api/other-api/serve)
- [React Router Node Custom Server Template](https://github.com/remix-run/react-router-templates/tree/main/node-custom-server)
- [React Router Custom Server server.js Source](https://raw.githubusercontent.com/remix-run/react-router-templates/refs/heads/main/node-custom-server/server.js)
- [Express.js Middleware Guide](https://expressjs.com/en/guide/using-middleware.html)
- [Fastify Static Plugin](https://github.com/fastify/fastify-static)
- [Hono Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Hono serveStatic Discussion](https://github.com/orgs/honojs/discussions/1465)
- [Clerk Blog - Skip Next.js Middleware for Static Files](https://clerk.com/blog/skip-nextjs-middleware-static-and-public-files)
