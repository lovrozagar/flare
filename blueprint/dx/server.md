# createServer

```ts
createServer({ router, site?, authenticate?, locale?, middleware?, mounts?, rewrite?, security?, sameSite?, trustProxy?, bodyLimit?, store?, static?, serverContext?, serverFns?, documentResponseDefer? })
```

The return value's `fetch(request, env, ctx)` is the production entry. `ctx.waitUntil` is how background work is scheduled. On Node and Bun the adapter tracks that promise. On Workers it is `ctx.waitUntil`.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `router` | yes | — | the object from `createRouter` | | | `tests/integration/skeleton.test.ts` |
| `site` | required when any route is `ssg`, `isr`, or shared `ssr`, and when `sitemap` is built | — | absolute `https` origin, no path | written into stored HTML and canonical URLs. A shared render requests `site` plus the canonical pathname, with no search and no request headers. The body stored is the body served for that miss. The request `Host` is never used | `http://` is rejected outside dev. A page whose HTML depends on search or headers is private | `server/cache/write.test.ts` `host`, `shared request` |
| `authenticate` | no | absent | `(ctx) => session \| null` | the context below. `redirect()`, `notFound()`, `unauthenticated()`, and `unauthorized()` keep their status. Any other throw is 500 and is not 401 (B82). Returning `null` is the only anonymous signal. The function runs once per request | returning `undefined` is a type error. Null means anonymous. `callerData` is the leaf's arguments, not the first route's | `server/auth/gate.test.ts` `missing session`, `authenticate throw`; `server/auth/caller.test.ts` `leaf` |
| `locale` | no | absent | the object `i18n()` returns | runs in the locale slot. It is not a middleware | passing it to `middleware` does not type-check | `features/i18n/server/middleware.test.ts` `slot` |
| `middleware` | no | `[]` | `Middleware[]` | the order declared | | `server/middleware/run.test.ts` |
| `mounts` | no | `[]` | `{ prefix, fetch }[]` | `prefix` is a canonical path. The longer prefix wins | `prefix` of `"/"` handles every request and the router never runs. That throws at startup | `server/mount/mount.test.ts` |
| `rewrite` | no | absent | `(path) => string \| undefined` | one replacement, then canonicalized again. A second change is 500. `path` is the canonical pathname. This is not the client rewrite | returning a location object does not type-check. The client function takes a location (`router.md`) | `server/lifecycle/canonical-redirect.test.ts` `rewrite recanonical`, `path string` |
| `security` | no | the defaults below | `SecurityConfig` or `(ctx) => SecurityConfig` | the base policy. A route `.security()` merges on top (`builder.md`) | a string CSP replaces the nonce policy (B68). Prefer the directives object | `server/security/apply.test.ts` `callback override` |
| `sameSite` | no | `[]` | hostnames | `Sec-Fetch-Site: same-site` is accepted only for these hosts | an empty list rejects `same-site` | `server/server-fn/csrf.test.ts` `same site unlisted` |
| `trustProxy` | no | `0` | hop count, integer `0`–`5` | how many `X-Forwarded-*` hops are trusted | `true` does not type-check. v0's boolean trusted the whole chain | `adapters/node/request.test.ts` `trustProxy default` |
| `bodyLimit` | no | `1 MiB` | bytes, `1`–`32 MiB` | server-fn POST cap and the Bun `maxRequestBodySize` | a page POST is 405 and the body is drained. `.response()` reads the stream itself | `adapters/node/body.test.ts` |
| `store` | no | absent | `FlareStore` or `(env) => FlareStore` | ISR and SSR storage. Absent means those modes render and are not stored. A function is called once per request with that request's `env` | a function that calls `createMemoryStore()` returns an empty map on every request. Construct that store outside | `server/lifecycle/create.test.ts` `store function` |
| `static` | no | absent | `FlareStore` or `(env) => FlareStore` | read-only SSG artifacts (`store.md`). A function is called once per request with that request's `env` | a store that implements `put` is still only read. `createFilesystemStore` reads a different directory layout, so pointing it at the client output misses every seed | `vite/prerender/run.test.ts` `no static store`; `create.test.ts` `static function` |
| `serverContext` | when `FlareRegister` declares it | absent. The value is `{}` | `(ctx: { request, env }) => FlareRegister["serverContext"]` | runs once after the canonical path is accepted and before mounts. `serverCtx()` returns that value (B75) | a redirect or a 400 does not call it. The argument has no `locals`. A throw is 500. Omitting it when the register declares the type does not type-check | `server/context/ctx.test.ts` `returns the value`, `not the event`, `redirect skips`, `required`, `throw is 500` |
| `serverFns` | when the app has a server function | `{}`, every `/_flare/fn/<id>` is 404 | `serverFns` from `src/_gen/server-fns.gen.ts`: `Record<id, () => Promise<ServerFn>>`, one lazy import per exported `createServerFn`, keyed by the B41 id | dispatch looks the id up; an unknown id is 404 before the method check (B42). It is separate from `routes.gen.ts`, which the client graph imports, so no server-function module reaches a client chunk | a hand-written map drifts from the files. Codegen writes it | `server/server-fn/dispatch.test.ts` `unknown id`; `vite/codegen/server-fns.test.ts` |
| `documentResponseDefer` | no | `"stream"` | `"stream"`, `"buffer"` | a rendered HTML document only (B92). `stream` sends the shell, then the deferred values. `buffer` holds the document until every defer running for that render has settled, then sends one HTML that contains the values | a stored hit ignores it and replays the stored body. A data request, a prefetch, and a client navigation ignore it. It does not change `cache.ssr.defer`, `cache.ssg.defer`, or `cache.isr.defer`. A stored `stream` write still stores the placeholder and does not run the function | `server/navigation/response.test.ts` `document buffer`, `document stream`, `data ignores buffer`, `stored stream stays a hole` |

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
| `clientIp` | the address the adapter resolved | | `request.test.ts` `trustProxy default` |
| `secure` | true when the adapter trusts the hop as https | hop count `0` ignores `X-Forwarded-Proto` | same |
| `callerData` | the leaf route's arguments. `.authenticate("admin")` is `["admin"]`. A call with no arguments is `[]` | a layout `.authenticate("admin")` and a page that does not call `authenticate` leaves this `[]`. The layout's arguments are on `callerChain`. v0 passed the first route's arguments | `caller.test.ts` `leaf`, `layout only`, `leaf empty` |
| `callerChain` | `{ route, args }[]` from the root down, one entry per route that called `authenticate` or `authenticateOptional`. `route` is the route id | an `authorize` with no authenticate call still runs the function, with `callerData` `[]` and `callerChain` `[]` | `caller.test.ts` `chain`, `authorize only` |

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

`path` is a pathname. `undefined` means no change. The replacement is canonicalized once. A replacement that itself rewrites is 500 (`rewrite recanonical`).

### mounts

Each entry:

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `prefix` | yes | — | a canonical path other than `"/"` | the longer prefix wins. Two equal prefixes throw at startup. Match is on a segment boundary | `"/api"` does not take `"/apiv2"`. A raw `startsWith` was the bug | `server/mount/mount.test.ts` `segment boundary`, `equal prefix` |
| `fetch` | yes | — | `(request: Request) => Promise<Response>` | that function handles the request. The URL path is the canonical path with this prefix removed and the query kept. After the strip, `//`, a backslash, or a control character is 400. Finalize still runs | the function does not receive the raw target | `mount.test.ts` `match`, `strip` |

## SecurityConfig

Every key is optional. Omission keeps the default. `false` removes the header. A string replaces the header value.

The callback `ctx` is `{ request, env, nonce, serverContext }`. The callback cannot choose the nonce. The framework appends it after the callback returns. Route `.security()` `ctx` has no `nonce` field (`builder.md`).

| key | default | accepts besides the default |
| --- | --- | --- |
| `Content-Security-Policy` | the directives below | a directives object, a string, or `false` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | a string. `preload` is not in the default |
| `X-Content-Type-Options` | `nosniff` | a string |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | a string |
| `X-Frame-Options` | `DENY` | a string |
| `Cross-Origin-Opener-Policy` | `same-origin` | a string |
| `Cross-Origin-Resource-Policy` | absent. The header is not sent | a string, which then sends it |
| `Permissions-Policy` | every feature below is `false` | the object, a string, or `false` |
| `X-Powered-By` | absent | a string, which is the only way the header appears |

`X-XSS-Protection` is not a key. Tests: `server/security/defaults.test.ts`.

### CSP directives

A key not in this table does not type-check. Naming one directive replaces that directive. Every directive the object does not name stays at the default in this table (`csp.test.ts` `partial keeps defaults`). The nonce is appended to `script-src` and `style-src-elem` after any user list. The user cannot remove it by listing sources. If `style-src` is set and `style-src-elem` is not, the element list is the `style-src` list plus the nonce. A set `style-src-elem` is not copied (`csp.test.ts` `style copy`). `upgrade-insecure-requests` is omitted when the request URL is `http`, so a local dev server is not upgraded (`csp.test.ts` `dev http`). In dev the policy also adds `ws://localhost:*`, `ws://127.0.0.1:*`, `http://localhost:*`, and `http://127.0.0.1:*` to `connect-src`, `'unsafe-eval'` to `script-src`, and `blob:` to `worker-src`, and it skips HSTS and COOP. The nonce stays (`csp.test.ts` `dev extras`).

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
| `frame-ancestors` | absent | `string[]` | `X-Frame-Options` is the default lock |
| `form-action` | absent | `string[]` | |
| `media-src` | absent | `string[]` | |
| `upgrade-insecure-requests` | `true` on https | boolean | |
| `block-all-mixed-content` | absent | boolean | |

A string policy is sent as written and has no nonce (`csp.test.ts` `string drops nonce`). `false` sends no CSP header (`csp.test.ts` `false drops header`). Neither case stamps a nonce on a tag (`tests/integration/nonce.test.ts` `string omits`, `false omits`).

### One nonce

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

`nonce()` is the accessor. A layout, a page, a nested child, an effect, and an event handler call it the same way. Nothing in the tree receives the nonce as a prop, and there is no provider to wrap. Flare's own emitters call this function.

On the server the document pipeline writes the string onto the request event before `renderToStream`, and `nonce()` reads that field. The event is the one `serverCtx()` already uses. The nonce is not a field of `serverContext`, so the app does not take it out of there and pass it down. A call outside a request throws. A server-function request does not render the document, so `nonce()` throws there too.

On the client the state script has assigned `self.flare.nonce` before hydrate. `nonce()` reads that field. A client navigation keeps the document that set it.

| side | outcome | pitfall | test |
| --- | --- | --- | --- |
| server | the string this request passed to `renderToStream`. `""` when the policy has no nonce | outside a request, and inside a server function, it throws | `shared/csp/nonce.test.ts` `server read`, `server outside`, `server fn` |
| client | `self.flare.nonce`, or `""` when that field is absent | a data navigation does not get a new document policy. The original document nonce is the one client-applied tags use | `nonce.test.ts` `client`, `client absent`; `client/head/apply.test.ts` `nonce` |
| any depth | a child of a child returns the same string as the page | a prop or a context is not how it arrives | `tests/integration/nonce.test.ts` `nested` |

`""` means omit the attribute. A raw `<script>` or `<style>` in app JSX is not stamped on its own. The app sets `nonce={nonce()}`. A tag that skips both `nonce()` and `useHead` is blocked when the policy has a nonce.

A response that is stored is a finished body. The write replaces nonce attribute values equal to the request nonce, and the state object's `nonce` field, with `__FLARE_NONCE__`. Other text is left as it is, including a text node that happens to equal the nonce. A hit replaces the sentinel with the new request nonce before the body is sent, and finalize builds the CSP from that new nonce. Two hits carry two nonces. Each body's attributes equal that response's header. The stored bytes contain the sentinel. A hit whose policy has no nonce removes the sentinel attributes and sets the state field to `""`. A streaming response that is not stored is sent with the real nonce and is not rewritten.

A nonce attribute whose value is already the sentinel is rewritten on the next hit. That is the collision case (`server/cache/nonce.test.ts` `attribute`, `text`, `state field`, `strip`).

The document test is `tests/integration/nonce.test.ts` `same value`: a head inline script, a `jsonLd` script, a custom style, and a render that prints `nonce()` all equal the CSP header nonce. `second request` uses two different nonces. `stored sentinel` and `hit matches` cover the cache. Later bits add the stylesheet swap and the feature scripts to the same file.

### Permissions-Policy

Keys, all default `false`: `accelerometer`, `browsing-topics`, `camera`, `geolocation`, `gyroscope`, `interest-cohort`, `magnetometer`, `microphone`, `payment`, `usb`.

| value | header | pitfall | test |
| --- | --- | --- | --- |
| `false` | `feature=()` | | `csp.test.ts` `permissions deny` |
| `"self"` | `feature=(self)` | | same |
| `string[]` | `feature=("https://origin" ...)` | a value with a quote, a space, or `;` throws | `csp.test.ts` `origin quote` |
| `true` | `feature=*` | this allows every origin. It is not "on for this site" | `csp.test.ts` `star` |

v0 defaulted `payment` to `"self"`. v1 defaults it to `false`.

## Response headers

Finalize sets these. A request header of the same name is ignored (`packages/core/lint/no-flare-header-branching.test.ts` `request header`).

| header | value | when | test |
| --- | --- | --- | --- |
| `flare-build` | the build id | every response | `server/lifecycle/finalize.test.ts` `flare-build` |
| `flare-render` | `ssr`, `ssg`, or `isr` | the mode that produced the body. A live render is `ssr`. A static hit is `ssg`. An ISR hit or populate is `isr` | `finalize.test.ts` `flare-render` |
| `flare-cache` | `hit` or `miss` | a shared lookup ran. Absent when the route is not stored | `server/cache/read.test.ts` `hit`, `miss` |
| `Cache-Control` | `cache.md` | | `policies.test.ts` `header` |
| `Cache-Tag` | `cache.md` | `cdn.tags` is set and the policy is `shared` | `policies.test.ts` `cache tag` |
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

## Middleware

A middleware is `(ctx) => Promise<Response | void> | Response | void`. The user writes the function. `ctx` is:

| field | outcome |
| --- | --- |
| `request` | the request, canonical URL |
| `path` | the canonical pathname |
| `env` | the fetch env |
| `next()` | resolves to the router `Response`. A second call is 500 |
| `respond(response)` | returns void, stashes that response, and skips `next()`. Finalize still runs |
| `bypass(response)` | the same stash. The name means "I produced the response" |

`filter` limits which paths enter. Comparison is case-folded and stops at a segment boundary.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `exact` | no | `[]` | path strings | the pathname must equal one of them | | `server/middleware/filters.test.ts` `exact` |
| `prefix` | no | `[]` | path strings | the pathname equals the prefix or continues with `/` | `"/api"` does not match `"/apiv2"`. A regular expression does not type-check | `filters.test.ts` `prefix boundary` |

Both omitted means every path. `onPage`, `onServerFn`, and `virtualPath` do not exist. A page-only or server-function-only middleware is an `exact` or `prefix` filter.

`onResponse` is not a separate hook. `next()` resolves to the `Response`, including a 3xx, 401, 403, 404, and a 500 the pipeline produced. Returning a `Response` replaces it. Returning void keeps it. Any other return is ignored. A throw before any response rejects `next()`, and the code after it does not run. A throw after a response is 500 and the original body is discarded (`server/middleware/run.test.ts` `onResponse throw`, `after sees redirect`, `throw before`, `return replaces`).

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

`proxy` reads the active mount's prefix and throws when there is none (`proxy.test.ts` `no mount`). The outbound URL is the stripped path plus the search, resolved against `upstream`. An upstream path on `upstream` is not kept. Hop-by-hop headers are dropped in both directions. The set is `connection`, `keep-alive`, `proxy-connection`, `transfer-encoding`, `te`, `trailer`, `upgrade`, and every header named by the `Connection` header, except that `set-cookie` is not removed when `relaySetCookie` is true. Upstream redirects stay redirects (`redirect: "manual"`). A `Location` that is only a single-slash path is prefixed with the mount. Any other `Location`, including an absolute `https` URL and a scheme-relative URL, is 502 and is not forwarded (`proxy.test.ts` `hostile location`, `absolute location`). The body is forwarded as bytes.

## Client address

`trustProxy` of 0 uses the socket address and ignores `X-Forwarded-For`. A higher hop count splits that header on commas and trims each entry. Fewer entries than `trustProxy` uses the socket. Otherwise the entry at index `length - trustProxy` is `clientIp`. `secure` stays the `X-Forwarded-Proto` rule already tested. `resolvedOrigin` is `https` when `secure` is true, otherwise `http`, plus the `Host` header. `X-Forwarded-Host` is not read. The pipeline request URL uses that origin (`adapters/node/request.test.ts` `trustProxy default`, `forwarded for`, `no forwarded host`). On Workers, `clientIp` is `CF-Connecting-IP`, or absent when the header is missing (`adapters/workers/handler.test.ts` `connecting ip`).

Match runs before the method rule (B87). A normal page allows GET, HEAD, and OPTIONS. OPTIONS is 204 with `Allow: GET, HEAD, OPTIONS`. Anything else is 405 with that `Allow`, and a POST body is drained. A `.response()` page has no method list. Every method, including OPTIONS and POST, reaches the function, and the adapter does not drain first. An unmatched GET or HEAD is not-found. Any other unmatched method is 405 with that `Allow`. On Workers that 405 does not call the assets binding (`server/lifecycle/methods.test.ts` `order`, `response methods`, `unmatched post`).

## Logger

Only `server/lifecycle/logger.ts` may call `console` (`00-rules.md`). The level is `warn` in dev and `error` in production. There is no `logLevel` option (B89). A line is `[flare:<tag>]`, the message, and data only when present. The functions are `error`, `warn`, and `log`. Production prints `error` only, so the digest, the boundary log, and the missing-store warning call `error` (`logger.test.ts` `dev warn`, `prod error`, `format`).
