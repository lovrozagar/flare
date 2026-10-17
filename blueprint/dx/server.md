# createServer

```ts
createServer({ router, site?, authenticate?, locale?, middleware?, mounts?, rewrite?, security?, sameSite?, bodyLimit?, store?, static?, serverContext?, serverFns?, documentResponseDefer?, retireServiceWorker? })
```

The return value's `fetch(request, env, ctx)` is the production entry, and its `bodyLimit` is the cap in bytes. `buildId` is the id of the build that serves, the one `flare-build` names on every answer, and `cache.key({ to, params })` is the store key a request to that page stores under, for a key purge outside a request (`store.md` revalidate, plan 21 4.5). `ctx.waitUntil` is how background work is scheduled. On Node and Bun the adapter tracks that promise. On Workers it is `ctx.waitUntil`.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `router` | yes | — | the object from `createRouter` | | | `tests/integration/skeleton.test.ts` |
| `site` | required when any route is `ssg`, `isr`, or shared `ssr`, and when `sitemap` is built | — | absolute `https` origin, no path | written into stored HTML and canonical URLs. A shared render requests `site` plus the canonical pathname, with no search and no request headers. The body stored is the body served for that miss. The request `Host` is never used | `http://` is rejected outside dev. `store` without `site` throws at `createServer` (`create.test.ts` `store without site`). A page whose HTML depends on search or headers is private | `server/cache/write.test.ts` `host`, `shared request` |
| `authenticate` | no | absent | `(ctx) => session \| null` | the context below. `redirect()`, `notFound()`, `unauthenticated()`, and `unauthorized()` keep their status. Any other throw is 500 and is not 401 (B82). Returning `null` is the only anonymous signal. The function runs once per request | returning `undefined` is a type error, with or without a registered `auth`; one that gets through, a cast or JavaScript, is a 500 the server logs as `authenticate returned undefined` (`auth/gate.test.ts` `authenticate undefined`, `tests/integration/auth.test.ts` `authenticate undefined logged`, BUGS.md 329). Null means anonymous. `callerData` is the leaf's arguments, not the first route's | `server/auth/gate.test.ts` `missing session`, `authenticate throw`; `server/auth/caller.test.ts` `leaf` |
| `locale` | no | absent | the object `i18n()` returns | runs in the locale slot. It is not a middleware | passing it to `middleware` does not type-check | `features/i18n/server/middleware.test.ts` `slot` |
| `middleware` | no | `[]` | `Middleware[]` | the order declared. A `redirect()` one throws answers as a loader's does, by the request's kind: a document the 3xx, a data request the one `x` frame, a server function the envelope redirect, none stored; any other throw is the projected 500 (BUGS.md 281) | | `server/middleware/run.test.ts`, `tests/integration/middleware.test.ts` `middleware throws redirect` |
| `mounts` | no | `[]` | `{ prefix, fetch }[]` | `prefix` is a canonical path. The longer prefix wins | `prefix` of `"/"` handles every request and the router never runs. That throws at startup | `server/mount/mount.test.ts` |
| `rewrite` | no | absent | `(path) => string \| undefined` | a changed path redirects to the replacement, canonicalized again: 301 for GET and HEAD, else 308, with the query kept. The replacement must stay put: one the function changes again throws, and that, like any throw from it, is a projected 500. `path` is the canonical pathname; a path a mount handles never reaches it. This is not the client rewrite. A server function's endpoint is never rewritten, so a locale rewrite that prefixes every path leaves the calls answering (`tests/integration/server-fn.test.ts` `rewrite skips functions`, BUGS.md 194) | returning a location object does not type-check. The client function takes a location (`router.md`) | `server/lifecycle/canonical-redirect.test.ts` `rewrite recanonical`, `path string`, `rewrite loop`, `rewrite option` |
| `security` | no | the defaults below | `SecurityConfig` or `(ctx) => SecurityConfig` | the base policy. A route `.security()` merges on top (`builder.md`). A callback runs once per request, after `serverContext` | a string CSP replaces the nonce policy (B68). Prefer the directives object. A 400 or a canonical redirect, answered before `serverContext`, carries an object config, or the defaults when the config is a callback | `server/security/apply.test.ts` `callback override`, `every key`, `server security` |
| `sameSite` | no | `[]` | hostnames | `Sec-Fetch-Site: same-site` is accepted only for these hosts | an empty list rejects `same-site` | `server/server-fn/csrf.test.ts` `same site unlisted` |
| `bodyLimit` | no | `1 MiB` | bytes, `1`–`32 MiB` | the server-function POST cap: a body over it is 413, from `Content-Length` or while reading, on every runtime. The returned server carries it as `bodyLimit`. A value that is not an integer in range throws at the call | a page POST is 405 and the body is drained. `.response()` reads the stream itself. Bun's `maxRequestBodySize` is a fixed 128 MiB ceiling, not this cap (`adapters.md`) | `adapters/node/body.test.ts`; `adapters/bun/serve.test.ts` `server limit`, `bun oversized post` |
| `store` | no | absent | `FlareStore` or `(env) => FlareStore` | ISR and SSR storage. Absent means those modes render and are not stored. A function is called once per request with that request's `env` | a function that calls `createMemoryStore()` returns an empty map on every request. Construct that store outside | `server/lifecycle/create.test.ts` `store function` |
| `static` | no | absent | `FlareStore` or `(env) => FlareStore` | read-only SSG artifacts (`store.md`). A function is called once per request with that request's `env` | a store that implements `put` is still only read. `createFilesystemStore` reads a different directory layout, so pointing it at the client output misses every seed | `vite/prerender/run.test.ts` `no static store`; `create.test.ts` `static function` |
| `serverContext` | when `FlareRegister` declares it | absent. The value is `{}` | `(ctx: { request, env }) => FlareRegister["serverContext"]` | runs once after the canonical path is accepted and before mounts. `serverCtx()` returns that value (B75) | a redirect or a 400 does not call it. The argument has no `locals`. A throw is the projected 500, logged once (`tests/integration/fetch-boundary.test.ts` `server context`, BUGS.md 202). Omitting it when the register declares the type does not type-check | `server/context/ctx.test.ts` `returns the value`, `not the event`, `redirect skips`, `required`, `throw is 500` |
| `serverFns` | when the app has a server function | `{}`, every `/_flare/fn/<id>` is 404 | `serverFns` from `src/_gen/server-fns.gen.ts`: `Record<id, () => Promise<ServerFn>>`, one lazy import per exported `createServerFn`, keyed by the B41 id | dispatch looks the id up; an unknown id is 404 before the method check (B42). It is separate from `routes.gen.ts`, which the client graph imports, so no server-function module reaches a client chunk | a hand-written map drifts from the files. Codegen writes it | `server/server-fn/dispatch.test.ts` `unknown id`; `vite/codegen/server-fns.test.ts` |
| `documentResponseDefer` | no | `"stream"` | `"stream"`, `"buffer"` | a rendered HTML document only (B92). `stream` sends the shell, then the deferred values. `buffer` holds the document until every defer running for that render has settled, then sends one HTML that contains the values | a stored hit ignores it and replays the stored body. A data request, a prefetch, and a client navigation ignore it. It does not change `cache.ssr.defer`, `cache.ssg.defer`, or `cache.isr.defer`. A stored `stream` write still stores the placeholder and does not run the function | `server/navigation/response.test.ts` `document buffer`, `document stream`, `data ignores buffer`, `stored stream stays a hole` |
| `retireServiceWorker` | no | absent | a pathname or a list of them, such as `"/service-worker.js"` | a GET or HEAD for each is the retiring worker (Migrating from v0): JavaScript, `private, no-store`, with the security set, never redirected by the trailing-slash, rewrite, or case rules or by the locale slot, since a worker's update fetch fails on a redirect (BUGS.md 270). The app's middleware runs first and may answer the path itself | a query, fragment, space, empty segment, trailing slash, or dot segment, raw or escaped, which no parsed request path holds (BUGS.md 328) throws at startup | `server/lifecycle/retire-worker.test.ts` `retired path`, `middleware first`, `checked`, `script`; e2e `minimal.test.ts` `retired service worker` |

### Planned (plan 15)

Not in v1. Plan 15 adds these, and `ServerOptions` has no such key until then (BUGS.md 113).

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `logger`, `onError`, `requestLog`, `tracer` | no | see `observability.md` | see `observability.md` | logging, error reporting, the request log, and tracing (B98, B99) | | `observability.md` |

### authenticate

The function runs when the matched chain reads identity (`authenticate`, `authenticateOptional`, or `authorize`). It runs once, after validation. A validation failure is 400 and does not call it. A public chain does not call it. Preloader, `authorize`, and loader receive the session or `null`. Render does not. A null session skips those three on the first required match and on everything inside it. Public matches outside that match still run. A chain that has `authorize` runs preloader, then `authorize`, before a shared hit is served. `false` is 403 and the stored body is not used. A route with no `authorize` still hits the cache (B73).

```ts
createServer({
  authenticate({ request, env, clientIp, secure, callerData, callerChain }) {
    return sessionOrNull;
  },
});
```

| field | outcome | pitfall | test |
| --- | --- | --- | --- |
| `request` | the canonical request | | `caller.test.ts` `leaf` |
| `env` | the fetch env, typed by `FlareRegister["env"]` | | same |
| `callerData` | the leaf route's arguments. `.authenticate("admin")` is `["admin"]`. A call with no arguments is `[]` | a layout `.authenticate("admin")` and a page that does not call `authenticate` leaves this `[]`. The layout's arguments are on `callerChain`. v0 passed the first route's arguments | `caller.test.ts` `leaf`, `layout only`, `leaf empty` |
| `callerChain` | `{ route, args }[]` from the root down, one entry per route that called `authenticate` or `authenticateOptional`. `route` is the route id | an `authorize` with no authenticate call still runs the function, with `callerData` `[]` and `callerChain` `[]` | `caller.test.ts` `chain`, `authorize only` |

#### Planned (plan 15)

| field | outcome | pitfall | test |
| --- | --- | --- | --- |
| `clientIp` | the address the adapter resolved (Client address below) | the Node listener computes it and no context carries it yet | `request.test.ts` `forwarded for` |
| `secure` | true when the adapter trusts the hop as https | the request URL already carries it as `https:` | `request.test.ts` `trustProxy one` |

A server function that calls `.authenticate()` uses the same function. `callerData` is `[]`, because that method takes no arguments. `callerChain` is one entry whose `route` is the function's `name` (`caller.test.ts` `server fn`).

### rewrite

```ts
createServer({
  rewrite(path) {
    if (path === "/old") return "/new";
    return undefined;
  },
});
```

`path` is a pathname. `undefined` means no change. A change answers a redirect to the replacement, canonicalized once. The function runs again on the replacement, and a second change is a projected 500 (`rewrite loop`): a chain of redirects would otherwise follow, or a loop. It runs after mounts, so a path a mount handles is never rewritten (`rewrite option`).

### mounts

Each entry:

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `prefix` | yes | — | a canonical path other than `"/"`, spelled as a parsed request path spells it | the longer prefix wins. Two equal prefixes throw at startup. Match is on a segment boundary | `"/api"` does not take `"/apiv2"`. A raw `startsWith` was the bug. A dot segment, a space, or a character outside ASCII, which a request path never holds, throws at startup (BUGS.md 327) | `server/mount/mount.test.ts` `segment boundary`, `equal prefix`, `root prefix` |
| `fetch` | yes | — | `(request: Request, env, ctx: { waitUntil }) => Response \| Promise<Response>`, so `app.fetch` of a fetch app mounts unchanged | that function handles the request, with `createServer`'s env and the adapter's `ctx`. A sync throw is the projected 500, and so is an answer that is not a Response, logged as `mount <prefix> answered <type>, not a Response` (`mount.test.ts` `answer type`, BUGS.md 202). The URL path is the canonical path with this prefix removed and the query kept. After the strip, `//`, a backslash, or a control character is 400, raw or as the escape a parsed URL turns it into (`%00` to `%1F`, `%7F`, `%5C`; BUGS.md 326). Finalize still runs | the function does not receive the raw target | `mount.test.ts` `match`, `strip` |

## SecurityConfig

**Warning: enforce path rules in Flare, not in front of it.** A rule in a proxy, load balancer, or WAF that matches the raw request path can be walked around: Bun and Workers read a backslash as `/` (WHATWG URL parsing) before Flare runs, so `/a\b` reaches Flare as `/a/b` while the proxy saw a path it did not match. Flare reads every runtime's path the same way (B22, BUGS.md 163), so a middleware `filter` sees the one path that routes, with the basePath and locale stripped too (BUGS.md 159). Put an access rule in Flare middleware, or make the proxy normalize the path exactly as WHATWG does before it matches.

Every key is optional. Omission keeps the default. `false` removes the header. A string replaces the header value.

The callback `ctx` is `{ request, env, nonce, serverContext }`. It runs once per request, after `serverContext`, and a throw is a projected 500. The callback cannot choose the nonce. The framework appends it after the callback returns, and a route's `.security()` keeps it, so `ctx.nonce` is the one the header and every tag carry (`apply.test.ts` `server security`). Route `.security()` `ctx` has no `nonce` field (`builder.md`).

| key | default | accepts besides the default |
| --- | --- | --- |
| `Content-Security-Policy` | the directives below | a directives object, a string, or `false` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | a string. `preload` is not in the default |
| `X-Content-Type-Options` | `nosniff` | a string |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | a string |
| `X-Frame-Options` | `DENY` | a string |
| `Cross-Origin-Opener-Policy` | `same-origin` | a string |
| `Cross-Origin-Resource-Policy` | `same-origin` on every answer Flare sends, so another origin cannot pull one in as an image, script, or media (B135) | a string, such as `cross-origin` for a share image or widget other sites embed, or `false` |
| `Permissions-Policy` | every feature below is `false` | the object, a string, or `false` |
| `X-Powered-By` | absent | a string, which is the only way the header appears: one an answer brings, from `.headers()`, a `.response()` page, a mount, or a middleware, is dropped (`tests/integration/ingress.test.ts` `powered by only from security`, BUGS.md 333) |

`X-XSS-Protection` is not a key. Tests: `server/security/defaults.test.ts`; `apply.test.ts` `every key` (each key's string, its `false`, `X-Powered-By` absent by default, and `Cross-Origin-Resource-Policy` `same-origin` until set); `defaults.test.ts` `corp`.

Dev sends the same headers as production but two, each for a reason: it drops `Strict-Transport-Security`, which on `localhost` would pin https for every other local server the browser visits, and its CSP adds what Vite's client needs: `'unsafe-eval'` in `script-src` for its module evaluation, `ws:` and `http:` on `localhost` and `127.0.0.1` in `connect-src` for HMR, and `blob:` in `worker-src`. `Cross-Origin-Opener-Policy` is the same in both, so an opener a popup or OAuth flow relies on breaks in dev as it would in production (`csp.test.ts` `dev extras`, plan 21 14.2, BUGS.md 220).

### CSP directives

A key not in this table does not type-check. A directive with no default appears once the object names it, and `upgrade-insecure-requests` follows the URL's scheme unless named (`csp.test.ts` `named directives`). Naming one directive replaces that directive. Every directive the object does not name stays at the default in this table (`csp.test.ts` `partial keeps defaults`). The nonce is appended to `script-src` and `style-src-elem` after any user list. The user cannot remove it by listing sources. If `style-src` is set and `style-src-elem` is not, the element list is the `style-src` list plus the nonce. A set `style-src-elem` is not copied (`csp.test.ts` `style copy`). `upgrade-insecure-requests` is omitted when the request URL is `http`, so a local dev server is not upgraded (`csp.test.ts` `dev http`). In dev the policy also adds `ws://localhost:*`, `ws://127.0.0.1:*`, `http://localhost:*`, and `http://127.0.0.1:*` to `connect-src`, `'unsafe-eval'` to `script-src`, and `blob:` to `worker-src`, and it skips HSTS and COOP. The nonce stays (`csp.test.ts` `dev extras`).

| directive | default | accepts | why |
| --- | --- | --- | --- |
| `default-src` | `'self'` | `string[]` | |
| `script-src` | `'self'` plus the nonce | `string[]` | the nonce is appended |
| `style-src` | `'self'` | `string[]` | no nonce. A nonce here blocks Solid's CSSOM `style={}` (B68) |
| `style-src-elem` | `'self'` plus the nonce | `string[]` | the same nonce as `script-src` |
| `style-src-attr` | `'unsafe-inline'` | `string[]` | Solid sets `style={}` through CSSOM. Dropping this breaks that |
| `base-uri` | `'self'` | `string[]` | |
| `object-src` | `'none'` | `string[]` | |
| `img-src` | `'self'`, `data:`, `https:` | `string[]` | images and blur placeholders |
| `font-src` | `'self'`, `data:`, `https:` | `string[]` | |
| `connect-src` | `'self'`, `https:` | `string[]` | without it, `default-src 'self'` blocks an https API |
| `worker-src` | `'self'` | `string[]` | |
| `frame-src` | absent | `string[]` | |
| `frame-ancestors` | the answer's `X-Frame-Options` restated: `'none'` for `DENY` (the default), `'self'` for `SAMEORIGIN`, none when `X-Frame-Options` is `false` | `string[]` | the CSP form of `X-Frame-Options`, which browsers that read both obey instead, so the default is never looser than the header and an app that removes the header to be embedded is not blocked by a directive it never wrote (BUGS.md 221, 268) |
| `form-action` | `'self'` | `string[]` | a form posts only to the page's own origin unless the app names more (BUGS.md 221) |
| `media-src` | absent | `string[]` | |
| `upgrade-insecure-requests` | `true` on https | boolean | |
| `block-all-mixed-content` | absent | boolean | |

A source holding a `;` or a line break would end its directive and inject policy of its own, so it throws, naming the directive (`csp.test.ts` `injected source`). A route's `.security()` directives add their sources to the policy the server sends, its defaults included, each once, so a page that allows one more origin keeps the server's policy: `script-src: ["https://cdn.example"]` with no server CSP sends `script-src 'self' https://cdn.example 'nonce-…'`. A list that is only `'none'` takes the route's sources instead, and a flag takes the route's value. Over a server string the route's sources go into that string the same way, a directive it does not name is appended, and the string still carries no nonce (`apply.test.ts` `route csp over server string`, BUGS.md 331); a route string or `false` replaces the whole policy (`apply.test.ts` `route csp merge`, `route csp adds to defaults`, plan 21 14.1, BUGS.md 221, 330). A string policy is sent as written and has no nonce (`csp.test.ts` `string drops nonce`). `false` sends no CSP header (`csp.test.ts` `false drops header`). Neither case stamps a nonce on a tag (`tests/integration/nonce.test.ts` `string omits`, `false omits`).

### One nonce

A public page a CDN keeps carries the nonce its render chose for as long as the CDN keeps it: the header and the HTML are cached together. That is decided, not missed (B144): the copy's content was fixed when the nonce was chosen and all of it is escaped, so the nonce lets nothing in, while a hash-only policy would block the nonced styles and scripts Flare's client inserts on a navigation. A page that needs a nonce per visitor is not given `cdn.maxAge`.

The nonce is one string. Head, render, features, the hydration capture script, the state script, and the CSP header carry that string or they carry no nonce. A second nonce is a bug.

It is generated when the merged policy is a directives object, including when the object is omitted and the defaults apply. Generation is 16 random bytes, hex, once per document response. It is not chosen by the app, not stored as the live value, and not generated per route. The `createServer({ security })` callback receives it and cannot remove it from a directives object. When the callback or a route `.security()` returns a string or `false`, the nonce is discarded before render and `nonce()` is `""`.

`renderToStream` receives that string. Flare emitters read `nonce()` and set it. Solid `useHead` stamps a `script`, a `style`, and a stylesheet or preload link from the same `renderToStream` option unless the tag already has a `nonce` prop. The emitters are:

- `.head()` `jsonLd`, custom inline scripts, and custom styles (`head.md`)
- `ThemeScript`, `LocaleScript`, `DirectionScript`, `FontCSS`, `ViewTransitionCSS`, the production stylesheet swap script, and `<style id="flare-critical">`
- the state script that assigns `self.flare`
- the hydration capture script from `generateHydrationScript` (B91)

The shell `head` includes that capture script once, before `<style id="flare-critical">`. The listeners are `click` and `input`. It assigns `window._$HY` and is followed by `<!--xs-->`. `hydrate` reads that object, so a document without it does not hydrate. A click or an input that fires before hydrate is stored on `_$HY.events` and replayed after the target is claimed. A string or `false` CSP still emits the script, with no nonce attribute. A data or prefetch response does not include it. The root layout does not render `<HydrationScript>` (`server/render/document.test.ts` `hydration capture`).

An external script `src` is emitted without a nonce attribute. `extra.nonce` on a custom tag is ignored.

```tsx
import { nonce } from "@lovrozagar/flare"

function Analytics() {
  return <script nonce={nonce()}>{js}</script>
}
```

`nonce()` is the accessor. A layout, a page, a nested child, an effect, and an event handler call it the same way. So does a component that renders after an async boundary, a `<Loading>` fragment that streams after the shell (`tests/integration/nonce.test.ts` `after loading`, BUGS.md 181). Nothing in the tree receives the nonce as a prop, and there is no provider to wrap. Flare's own emitters call this function.

On the server the document pipeline writes the string onto the request event before `renderToStream`, and `nonce()` reads that field. The event is the one `serverCtx()` already uses. The nonce is not a field of `serverContext`, so the app does not take it out of there and pass it down. A call outside a request throws. A server-function request does not render the document, so `nonce()` throws there too.

On the client the state script has assigned `self.flare.nonce` before hydrate. `nonce()` reads that field. A client navigation keeps the document that set it.

| side | outcome | pitfall | test |
| --- | --- | --- | --- |
| server | the string this request passed to `renderToStream`. `""` when the policy has no nonce | outside a request, and inside a server function, it throws | `shared/csp/nonce.test.ts` `server read`, `server outside`, `server fn` |
| client | `self.flare.nonce`, or `""` when that field is absent | a data navigation does not get a new document policy. The original document nonce is the one client-applied tags use | `nonce.test.ts` `client`, `client absent`; `client/head/apply.test.ts` `nonce` |
| any depth | a child of a child returns the same string as the page | a prop or a context is not how it arrives | `tests/integration/nonce.test.ts` `nested` |

`""` means omit the attribute. A raw `<script>` or `<style>` in app JSX is not stamped on its own. The app sets `nonce={nonce()}`. A tag that skips both `nonce()` and `useHead` is blocked when the policy has a nonce.

A response that is stored is a finished body. The write replaces nonce attribute values equal to the request nonce, and the state object's `nonce` field, with the entry's sentinel (`__FLARE_NONCE_` plus 16 random bytes in hex, made at each write and recorded in the entry; only that value becomes the hit nonce). Other text is left as it is, including a text node that happens to equal the nonce, and text or another attribute's value that spells ` nonce="<nonce>"`: only a start tag's own `nonce` attribute is one (`nonce.test.ts` `text`, BUGS.md 332). A hit replaces the sentinel with the new request nonce before the body is sent, in one pass over the body when the nonce needs no escaping, as the server's hex nonce does, since the sentinel stands nowhere else (`nonce.test.ts` `one pass`, plan 21 15.2), and finalize builds the CSP from that new nonce. Two hits carry two nonces. Each body's attributes equal that response's header. The stored bytes contain the sentinel. A hit whose policy has no nonce removes the sentinel attributes and sets the state field to `""`. A streaming response that is not stored is sent with the real nonce and is not rewritten.

Stored markup cannot carry the entry's sentinel, because it is random and made after the render's inputs exist. A nonce attribute holding any other value, a fixed `__FLARE_NONCE__` included, is left as it is on a hit, so stored HTML is never granted the CSP nonce (`server/cache/nonce.test.ts` `attribute`, `text`, `state field`, `strip`, `per entry`, `planted sentinel`).

The document test is `tests/integration/nonce.test.ts` `same value`: a head inline script, a `jsonLd` script, a custom style, and a render that prints `nonce()` all equal the CSP header nonce. `second request` uses two different nonces. `stored sentinel` and `hit matches` cover the cache. Later bits add the stylesheet swap and the feature scripts to the same file.

### Permissions-Policy

Keys, all default `false`: `accelerometer`, `browsing-topics`, `camera`, `geolocation`, `gyroscope`, `interest-cohort`, `magnetometer`, `microphone`, `payment`, `usb`.

| value | header | pitfall | test |
| --- | --- | --- | --- |
| `false` | `feature=()` | | `csp.test.ts` `permissions deny` |
| `"self"` | `feature=(self)` | | `csp.test.ts` `permission values` |
| `string[]` | `feature=("https://origin" ...)` | a value with a quote, a space, or `;` throws | `csp.test.ts` `origin quote` |
| `true` | `feature=*` | this allows every origin. It is not "on for this site" | `csp.test.ts` `star` |
| a string | sent as written | | `csp.test.ts` `permission values` |

v0 defaulted `payment` to `"self"`. v1 defaults it to `false`.

## Response headers

Finalize sets these. A request header of the same name is ignored (`packages/core/lint/no-flare-header-branching.test.ts` `request header`).

| header | value | when | test |
| --- | --- | --- | --- |
| `flare-build` | the build id | every response | `server/lifecycle/finalize.test.ts` `flare-build` |
| `flare-render` | `ssr`, `ssg`, or `isr` | the mode that produced the body. A live render is `ssr`. A static hit is `ssg`. An ISR hit or populate is `isr` | `finalize.test.ts` `flare-render` |
| `flare-cache` | `hit` or `miss` | a shared lookup ran. Absent when the route is not stored | `server/cache/read.test.ts` `hit`, `miss` |
| `Cache-Control` | `cache.md` | | `policies.test.ts` `header` |
| `Cache-Tag` | `cache.md` | `cdn.tags` is set and the public header is sent (`cache.md` How the decision is made) | `policies.test.ts` `cache tag` |
| `Allow` | the methods | an `OPTIONS` response and a `405` | `methods.test.ts` `OPTIONS` |
| `Server-Timing` | absent | Flare writes no `Server-Timing` field. Solid owns tracing and may set the header. The `tracing/` module does not come back | `finalize.test.ts` `no server timing` |

## serverCtx and withFetchDedupe

`serverCtx()` returns the value `createServer({ serverContext })` stored on the request event (B75). Outside a request it throws (`server/context/ctx.test.ts` `outside a request`). The value is typed by `FlareRegister["serverContext"]`. It is not the event, and it is not `locals`.

```ts
withFetchDedupe(target, { maxBytes? })
```

| prop | required | default | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- |
| `target` | yes | — | a function or `{ fetch }`. The key is method, URL, and the sorted headers except `traceparent`, `tracestate`, `x-correlation-id`, and `x-request-id`, plus `redirect`, `cache`, `credentials`, `integrity`, `mode`, `referrer`, and `referrerPolicy`. HEAD and GET are separate entries. Each caller gets its own body | a new arrow on every call is a new target and does not dedupe. Pass the binding itself | `server/context/fetch-dedupe.test.ts` `binding`, `arrow misses`, `key` |
| `maxBytes` | no | `1 MiB` | bodies larger than this are not memoized. The first caller streams and every other caller fetches on its own. The same rule applies to `text/event-stream` | | `fetch-dedupe.test.ts` `over cap`, `event stream` |

Anything other than GET or HEAD clears the request map and is not memoized. A rejection is not reused. Outside a request, calls pass through and do not throw (`fetch-dedupe.test.ts` `post clears`, `rejection`, `outside`). `globalThis.fetch` is not patched. A call that does not go through `withFetchDedupe` is not deduped (`fetch-dedupe.test.ts` `no global patch`).


The dedupe store belongs to the request, not to a loader: every loader, preloader, and render of one request shares it, and a non-GET from any of them resets it for all (BUGS.md B21).
## Client disconnect

When a client leaves mid-response, the render stops and Solid disposes it under the same request it rendered under, so an `onCleanup` that reads the request, `serverCtx()`, or the query client still sees it, and the server keeps serving (BUGS.md B28). An app `onCleanup` that throws during that disposal is reported by the runtime as an uncaught exception, because Solid disposes inside an abort dispatch that no caller can wrap. On Node and Bun that ends the process unless the app handles `uncaughtException`, as an app timer that throws would. Keep cleanup functions from throwing.

## Middleware

A middleware is `(ctx) => Promise<Response | void> | Response | void`. The user writes the function, either wrapped in `createMiddleware(fn)`, which returns `fn` typed as `Middleware` and does nothing else, or annotated `const m: Middleware = …`. Both are the same value. `createMiddleware` takes no filter: the filter is set where the middleware is listed, so one handler can be listed under several filters (`server/middleware/run.test.ts` `create middleware`). `createServer({ middleware })` takes a list whose entries are a middleware or `{ filter, handler }`, run in list order, each wrapping the rest. Middleware passes no typed context to handlers. Per-request data for every handler is `serverContext`, the user is `authenticate`, and per-section context is a layout's `.preloader()`. `ctx` is:

| field | outcome |
| --- | --- |
| `request` | the request, canonical URL |
| `path` | the canonical pathname |
| `env` | the fetch env, typed by `FlareRegister["env"]` |
| `kind` | `"page"` for a document, a data, or a prefetch request; `"serverFn"` for a server-function call; `"mount"` for a request a mount answers, whose `next()` resolves to the mount's answer (B138) |
| `next()` | resolves to the router `Response`. A second call is 500 |
| `respond(response)` | returns void, stashes that response, and skips `next()`. Finalize still runs |
| `bypass(response)` | the same stash. The name means "I produced the response" |

`filter` limits which paths enter. Comparison is case-folded and stops at a segment boundary. A filter matches the pathname as sent or the route path: the pathname without the `basePath`, and without a configured locale as its first segment. So a block on `/admin` also holds for `/hr/admin` and `/base/admin` (`tests/integration/middleware.test.ts` `filter route path`, BUGS.md 159).

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `exact` | no | `[]` | path strings | the pathname must equal one of them | | `server/middleware/filters.test.ts` `exact` |
| `prefix` | no | `[]` | path strings | the pathname equals the prefix or continues with `/` | `"/api"` does not match `"/apiv2"`. A regular expression does not type-check | `filters.test.ts` `prefix boundary` |
| `kind` | no | all three | `"page"`, `"serverFn"`, `"mount"` | the request kind must be one of them, so a guard on a sub-app alone is `kind: ["mount"]` (`tests/integration/middleware.test.ts` `mount middleware`) | a server-function filter does not name `/_flare/fn`, so it holds under any `basePath` | `filters.test.ts` `kind` |

`exact` and `prefix` together match a path that either one matches. `kind` must match as well. All omitted means every request. `onPage`, `onServerFn`, and `virtualPath` do not exist: a page-only or server-function-only middleware is a `kind` filter. A layout's pages, including a group or root layout that adds no URL segment, are reached through that layout's own chain, not a middleware filter.

A middleware that returns without calling `next()`, `respond()`, or `bypass()` continues the chain, as if it had returned `await ctx.next()`. That is how a middleware skips some paths (`run.test.ts` `skip continues`).

`onResponse` is not a separate hook. `next()` resolves to the `Response`, including a 3xx, 401, 403, 404, and a 500 the pipeline produced. Returning a `Response` replaces it. Returning void keeps it. Any other return is ignored. A throw before any response rejects `next()`, and the code after it does not run. A throw after a response is 500 and the original body is discarded (`server/middleware/run.test.ts` `onResponse throw`, `after sees redirect`, `throw before`, `return replaces`).

A `Response` from `fetch()`, returned as-is by a `.response()` page, a server function, a middleware, or a mount, leaves without its `Content-Encoding` and `Content-Length` when it has an encoding: the runtime's `fetch` already decoded the body, so the client reads it intact on Node, Bun, and Workers. Kept, Node would write a length the body overruns, Bun would label plain bytes gzip, and workerd would encode them again for a client that never asked. A fetched `Response` is one whose `url` is set. A `Response` the app builds from compressed bytes keeps its encoding, and so does a rewrap such as `new Response(res.body, res)`, which has no `url`: delete `content-encoding` there yourself. By default each runtime asks the upstream only for the encodings its `fetch` decodes (measured: Node every coding, Bun each single coding, workerd gzip and br), so a request that forwards the client's `Accept-Encoding` can get a body the runtime left encoded (`server/lifecycle/policies.test.ts` `decoded headers`, `tests/integration/fetched.test.ts` `node fetched`, `bun fetched`, `tests/workerd/server.test.ts` `worker fetched`, BUGS.md 197).

## proxy

```ts
proxy(request, upstream, { forwardCookies?, forwardAuthorization?, relaySetCookie? })
```

| prop | required | default | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- |
| `request` | yes | — | the incoming request | | `server/proxy/proxy.test.ts` |
| `upstream` | yes | — | absolute `https` URL | `//` and `http://` throw | `proxy.test.ts` `hostile location` |
| `forwardCookies` | no | `false` | `true` forwards the `Cookie` header | | `proxy.test.ts` `cookie off`, `cookie on` |
| `forwardAuthorization` | no | `false` | `true` forwards the `Authorization` header | | `proxy.test.ts` `authorization off`, `authorization on` |
| `relaySetCookie` | no | `false` | `true` appends each `getSetCookie()` value unchanged, including on a surfaced 3xx, and does not rewrite `Path` or `Domain`. A `Connection` token of `set-cookie` does not remove them. `false` deletes every `Set-Cookie` | `Set-Cookie` is not hop-by-hop | `proxy.test.ts` `set-cookie relay`, `set-cookie many` |

`proxy` reads the active mount's prefix and throws when there is none (`proxy.test.ts` `no mount`). The outbound URL is the stripped path plus the search, resolved against `upstream`. An upstream path on `upstream` is not kept. Hop-by-hop headers are dropped in both directions. The set is v0's: `connection`, `keep-alive`, `proxy-authenticate`, `proxy-authorization`, `proxy-connection`, `te`, `trailer`, `trailers`, `transfer-encoding`, `upgrade`, and every header named by the `Connection` header, except that `set-cookie` is not removed when `relaySetCookie` is true. The request never carries the client's `Host`, `Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Port`, `X-Forwarded-Proto`, or `X-Real-IP`: the upstream sees its own host, and no client picks its virtual host or claims an address (`tests/integration/middleware.test.ts` `proxy client headers`, BUGS.md 161). Upstream redirects stay redirects (`redirect: "manual"`). A `Location` that is only a single-slash path is prefixed with the mount. Any other `Location`, including an absolute `https` URL and a scheme-relative URL, is 502 and is not forwarded (`proxy.test.ts` `hostile location`, `absolute location`). The request body is streamed to the upstream as bytes (`duplex: "half"`) and is never read into memory, so a proxy mount holds no upload and needs no cap of its own; on Node a mount body is not under `bodyLimit` (`proxy.test.ts` `streamed body`). `fetch` decompresses the upstream body, so `Content-Encoding` and `Content-Length` are dropped on the way back (`proxy.test.ts` `decoded body`).

## Client address

`trustProxy` is the Node listener's and the Bun fetch's option (`adapters.md`). On Node, `trustProxy` of 0 uses the socket address and ignores `X-Forwarded-For`. A higher hop count splits that header on commas and trims each entry. Fewer entries than `trustProxy` uses the socket. Otherwise the entry at index `length - trustProxy` is `clientIp`. `secure` stays the `X-Forwarded-Proto` rule already tested. `resolvedOrigin` is `https` when `secure` is true, otherwise `http`, plus the `Host` header. `X-Forwarded-Host` is not read. The pipeline request URL uses that origin (`adapters/node/request.test.ts` `trustProxy default`, `forwarded for`, `no forwarded host`; through the listener, `listener.test.ts` `trust proxy`). Bun's request URL already carries the host, and a trusted `https` hop only changes its scheme. On Workers, `clientIp` is `CF-Connecting-IP`, or absent when the header is missing (`adapters/workers/handler.test.ts` `connecting ip`).

Match runs before the method rule (B87). A normal page allows GET, HEAD, and OPTIONS. A HEAD answers the page's status and headers with no body, and the render behind it is cancelled, so it runs its cleanups and never outlives the answer (`tests/integration/hostile.test.ts` `head stops the render`, BUGS.md 180). OPTIONS is 204 with `Allow: GET, HEAD, OPTIONS`. Anything else is 405 with that `Allow`, and a POST body is drained. A `.response()` page answers the methods it declares with `.response(fn, { methods })`, GET when it declares none: HEAD runs it as GET does and sends no body, OPTIONS is 204 unless declared, and any other method is 405 with `Allow` and never runs it. Codegen copies the literal list onto the route node, so a method it does not answer is refused before its code loads (`methods.test.ts` `response methods`, `create.test.ts` `method before load`, `tests/integration/hostile.test.ts` `response methods`, plan 21 13.5, BUGS.md 208). A declared method reaches the function, and the adapter does not drain first. An unmatched GET or HEAD is not-found. Any other unmatched method is 405 with that `Allow`. On Workers that 405 does not call the assets binding (`server/lifecycle/methods.test.ts` `order`, `response methods`, `unmatched post`).



## Deploying

A CDN keeps a public page for its `cdn.maxAge`, and `swr` past that, so after a deploy it can still hand out the previous build's HTML, which names that build's hashed `/assets/*` files. Every answer names its build in `flare-build`, and every public page also carries `flare-build-<id>` last in its `Cache-Tag` (`policies.test.ts` `cache tag`, plan 21 16.10, BUGS.md 228). A deploy runs in this order:

1. Before shipping, read the live build's id from any answer's `flare-build` header.
2. Ship the new build, keeping the previous build's `/assets/*` files beside the new ones. Hashed names never collide, so the two sets live side by side.
3. Purge the previous build's tag, `flare-build-<previous id>`, at the CDN: its pages leave the edge, and the next request renders on the new build. A CDN that cannot purge by tag keeps the old pages until their `maxAge` plus `swr` runs out.
4. Delete the previous build's assets only after that: once the purge has landed, or once the longest `maxAge` plus `swr` of any page has passed without one.

A tab that is already open on the old build needs neither. Its next client navigation reads the newer `flare-build` on the data answer and loads that URL as a document, and a route chunk the deploy deleted does the same (`docs-resilience.test.ts` `build mismatch reload`, `missing chunk reload`). Those reloads are the backstop for a step skipped, not the plan: without step 2, a visitor who gets old HTML from the edge before the purge loads a page whose scripts 404 until the reload lands. Stored pages need nothing either: the store key holds the build id, so the new build never serves the old one's entries (`dx/store.md`).
## Migrating from v0

v0 built the app's `src/service-worker.ts` to `/service-worker.js` and registered it at scope `/`, and earlier v0 builds left one at `/sw.js`. v1 registers no worker, so after the move a returning visitor's browser keeps the old one, which goes on serving the old build from its caches: the 404 v1 gives its script fails the update check and leaves it in place. List those paths for one release cycle, as long as returning visitors may still hold the old worker:

```ts
createServer({ router, retireServiceWorker: ["/service-worker.js", "/sw.js"] })
```

Each visit checks the registered worker's script for an update. That fetch now gets the retiring worker, which activates at once, deletes every cache of the origin, unregisters, and reloads each page the old worker controlled, so the reload and every later visit come from the network with no worker registered (`server/lifecycle/retire-worker.test.ts` `script`; e2e `minimal.test.ts` `retired service worker`: a page under a stand-in old worker shows this build after one visit, plan 21 16.1, BUGS.md 227). The option lives on `createServer`, not on the Vite plugin: the server answers the path, so it works the same in dev, on Node, Bun, and Workers, without a static file that a CDN could cache or a static server could skip. An app that ships a worker of its own at one of those paths does not list that path.
## Error boundary

`server.fetch` never rejects. A failure no stage answered, such as a server-function module that fails to import or loader data a navigation cannot serialize (a `BigInt`), is projected once, so it is logged with its digest, and answered as the 500 every exit shares: no body, the default security headers. Before this boundary Node sent such a failure as a bare unlogged 500 and Workers showed error 1101 (`server/lifecycle/exchange.test.ts` `bounded`, `tests/integration/fetch-boundary.test.ts`, `tests/workerd/server.test.ts` `worker boundary`, plan 21 9.1, BUGS.md 202).

## Logger

Only `server/lifecycle/logger.ts` may call `console` on the server (plan 15 moves it to `server/observe/logger.ts` with its files.tsv rows) (`00-rules.md`). The logger, its levels and formats, `ctx.log`, `log()`, and every field are `observability.md` (B98).
