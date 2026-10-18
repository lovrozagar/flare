# Generated types

Codegen writes `src/_gen/types.gen.ts`. The path is not an option (`dx/plugin.md`). It is a module that augments, not a `.d.ts`, so `skipLibCheck`, which the README's tsconfig sets, never skips it: a broken import in it is a compile error (BUGS.md 347). The file augments `FlareRegister` on `@lovrozagar/flare`, which is the interface `shared/route-builder/register.ts` exports. The published package leaves that interface empty. The app's generated file fills the maps below. Public types name no `virtual:` module and no `src/` path of the published package (B63). The relative imports in `routeModules` point at the app's own route files.

Do not copy the v0 generator. It augments `@lovrozagar/flare/codegen`. It keys `to` by the public URL. It drops `.response()` routes from `routeModules`. It infers `auth`, `env`, and `serverContext` from a phantom export. It sets `hasQueryClient` by searching source text for `queryClientGetter`. None of that is v1.

The propagation contract is this file (B74). A callback field v0 had and this file does not name is absent. That includes `location` on render, `router` on render, `parentHead`, `parentHeaders`, `abortController`, `locale()` on a context, `deps`, a `prefetch` boolean on a context, and `piggyback`.

## Maps codegen writes

| field | key | value | test |
| --- | --- | --- | --- |
| `routes` | the public URL, `/about` | `{ params }` from the brackets in `dx/routes.md`. A page with no params has `params: {}`. Layouts, the root layout, segments, and `.response()` routes are absent | `types-gen.test.ts` `param types`, `no params`, `response route` |
| `pageIds` | none | the union of every page id, `.response()` pages included, or `never`. `Link`, `navigate`, and `redirect` read their targets from it, so a loader that throws `redirect()` infers its own type without a loop through its own module (BUGS.md 105). A register written before it derives the targets from `routeModules` | `types-gen.test.ts` `page ids`; `tests/types/app.test.ts` `app compiles` (the `moved` page) |
| `routeModules` | the route id, `_root_/about` | `typeof` the route export. Includes pages, layouts, the root layout, segments, and `.response()` routes. The export's `_type` is `"page"`, `"layout"`, `"root"`, or `"segment"`. A `.response()` route stays `"page"` | `types-gen.test.ts` `loader type`, `response route` |
| `routeParents` | the route id | layout ids and the root id, outside-in, shortest prefix first, not including the route itself. A path segment is never a parent. A group is a parent only when that folder has a layout file | `types-gen.test.ts` `parents`, `segment parent`, `parents closed` |
| `authModes` | the route id, only when that file sets auth | `true` for `.authenticate()`, `"optional"` for `.authenticateOptional()`. `false` is omitted. The field itself is omitted when no route sets auth | `types-gen.test.ts` `auth mode` |
| `routeSearchParams` | the route id, for each file whose chain calls `.input()`, whatever its argument | `SearchOutput` of that route's type: the validator's output, or the raw record when it validates params only. A layout and a page each keep their own output | `types-gen.test.ts` `search`, `input call`, `keyed by route id` |
| `routeParams` | the route id, for each file whose chain calls `.input()`, whatever its argument | `ParamsOutput` of that route's type: the validator's output, which replaces the bracket types for that id. With search alone the brackets stay; that is read from whether the route's `.input()` has the params side, so a `never` output stays `never` | `types-gen.test.ts` `input params`, `input call`, `keyed by route id` |
| `hasQueryClient` | none | `true` when an app file imports `@lovrozagar/flare/query`. Otherwise the field is absent. A comment does not count. The value `false` is never written | `types-gen.test.ts` `query client` |

Every id in `routeParents` is a key of `routeModules` (`types-gen.test.ts` `parents closed`). A hand-written register that breaks this poisons that route's preloader context to `never`. It is not `{}`.

`"optional"` is a value in `authModes`. It is not an argument. `.authenticate("optional")` does not type-check, on a page or a layout, and it throws (`chain.test.ts` `optional argument`; `app`: `checks-data.ts` `optional argument`, plan 21 11.4). A caller name held in a `string` still type-checks.

## Graph

A type is born in one place. Later readers do not invent a second copy.

| born | carried by | read by |
| --- | --- | --- |
| brackets in the route id | the default params, and `routes[url].params` for a page that renders | `ExtractPathParams`. `InferParams` reads render props `params`, never `location.params` |
| `.input({ params })` on that file | `routeParams[routeId]`. The whole params type is replaced | the same `InferParams` |
| `.input({ searchParams })` on that file | `routeSearchParams[routeId]` | `InferSearchParams` reads render props `search` |
| no search validator on that file | the raw record `Record<string, string \| string[]>` | `useSearch`, `Link` `search`, `useLocation`, `loaderDeps`, `shouldRefetch` |
| the loader return | `Awaited` of that return, on that module's render `loaderData`, with no JSON reshaping: the value crosses the wire with its Date, BigInt, Map, Set, URL, and undefined keys, so the type is what the client reads (B145, plan 21 11.1) | `useLoaderData({ from: that id })`, and head, headers, and security on that route |
| each preloader return | `routeParents` outside-in, then this route's own return | `usePreloaderContext({ from })` and later callbacks on that route |
| `.authenticate()`, `.authenticateOptional()`, and the parent walk | `authModes[routeId]` plus `ParentAuthResolution` | `ctx.auth` on preloader, `authorize`, and loader |
| the app's augmentation | `auth`, `env`, `serverContext` | session, fetch env, `serverCtx()`, loader `env`, a server function's `serverContext` |
| an import of `@lovrozagar/flare/query` | `hasQueryClient: true` | `queryClient` on the loader context only |
| `typeof` the route export | `routeModules[routeId]` | `from` on the data hooks. Page ids, including a `.response()` page, are the legal `to` |

Codegen does not read `.input()`'s argument, only that the route's chain calls it: an object literal, a module-level `const`, an imported object, and a factory's result all give the route's validated params and search, read from its own type, so `Link`, `useSearch`, and `useParams` see what its own callbacks see (BUGS.md 346, 349). A route without `.input()` gets no entry, so its type is never read, and a loader that redirects to it cannot loop through its own type (BUGS.md 105).

A loader that redirects with params or search to a route that validates them, its own route included, annotates its return type: `.loader(({ params }): Data => …)`. The redirect's params check reads the target route's type, and when that read leads back to the loader whose return is still being inferred, tsc reports `TS7022` ('route' implicitly has type 'any' because it is referenced directly or indirectly in its own initializer), `TS7024` on the loader, and `TS2502` in `src/_gen/types.gen.ts`. The annotation gives the loader a type before its body is read, so nothing loops (BUGS.md 350, `app`: checks-input.ts `redirect to a validating route`).

`Link`, `navigate`, `redirect`, and `buildUrl` are generic on a page route id: a key of `routeModules` whose `_type` is `"page"`. A layout id, the root id, and a segment id are not `to`. `from` is any key of `routeModules`. An unknown id fails only after the register is augmented.

`hash`, `replace`, `revalidate`, `scroll`, `shallow`, `state`, `viewTransition`, `prefetch`, `status`, and anchor attributes are not generic on the route.

## Merge

| rule | result |
| --- | --- |
| params before `.input()` | `ExtractPathParams` of the route id, for a page, a layout, and the root. `[id]` is `string`. `[...path]` is `string[]`. `[[id]]` is `string \| undefined` and the key is required. `[[...path]]` is `string[] \| undefined` and the key is required. `[_]id]` and `(blog)` add no key. The root does not default to `Record<string, string>` |
| `.input({ params })` | replaces the whole params type with the validator output. The brackets are not intersected back in |
| `.input({ searchParams })` | replaces search with the validator output. The other side stays at its default when only one side is passed |
| `.input({})` | does not type-check. At least one side is required, and the call throws |
| search with no validator | optional raw record `Record<string, string \| string[]>`. Each key and value is decoded, `+` a space (B31). One occurrence of a key is `string`. Two or more, in appearance order, is `string[]` |
| search validator output has a required key | the `search` prop on `Link`, `navigate`, `redirect`, and `buildUrl` is required |
| every search key is optional | the `search` prop may be omitted. A passed object is still checked |
| validator output is `{}` | `search?: never`, the same as `params?: never` when params are `{}` |
| a parent `.input()` | stays on the parent. It is not merged into the child. The two files may disagree |
| params object | required when the type has any key, including `[[id]]`. Forbidden (`params?: never`) when the type is `{}` |
| `[[id]]` inside the object | the key is present. The value may be `undefined`. `{}` is missing that key |
| loader data | `Awaited` of this route's loader only. A parent loader is a second `useLoaderData({ from: parentId })`. No loader is `void` |
| `Promise<{ n: number }>` | `{ n: number }` |
| `Deferred<T>` | stays `Deferred<T>`: `{ __deferred: true; key: string; promise: Promise<T>; hole?: true }`. It has no `then`, so `Awaited` does not unwrap it. `T` is on `.promise`. `hole` is set only on a `"stream"` value a stored render did not run. `useDeferred(() => d)` returns `Accessor<T>`. A plain `Deferred` does not type-check |
| preloader | parents intersect with `&`, outside-in, self excluded, then this route's own return on later callbacks. The preloader callback and `authorize` see the parents only |
| the same preloader key | the narrower type survives. `("admin" \| "editor") & "admin"` is `"admin"` |
| incompatible preloader types | that property is `never`. Sibling keys stay. `{}` does not erase other keys |
| a preloader that returns a union | each member merges on its own, so a discriminant narrows to its member's keys, and an optional key stays optional (`app`: `checks-chain.ts` `preloader union narrows`, `preloader optional stays optional`, BUGS.md 275) |
| a missing parent module | the context is `never` |
| root preloader callback | no `preloaderContext` field. The root's own return replaces `{}` for later root callbacks. It is not `&` with a parent |
| auth seed | `ParentAuthResolution` walks `routeParents` outside-in. `true` beats `"optional"` beats `false`. The root starts at `false`. The strictness is computed. It is not a second map |
| `.authenticate()` | sets `true`. It only tightens |
| `.authenticateOptional()` | sets `"optional"` only when the seed is not `true`. On a `true` seed the method is absent from the type |
| neither auth method | keeps the parent seed |
| a middle file omits both methods | a grandchild still sees an outer `true` |
| `.authorize()` on a public route | the auth type becomes the registered session or `null`. It does not become required. A parent `true` stays `true`. A parent `"optional"` stays the session or `null` |
| `ResolvedAuth<true>` | the registered session, non-null after augmentation |
| `ResolvedAuth<"optional">` | the registered session or `null` |
| `ResolvedAuth<false>` | `null` |
| omitted `auth` | `null`, so `ctx.auth.userId` fails even on `.authenticate()` until the app augments |
| server function auth | a different chain. No `.authenticateOptional`. Skipping `.authenticate()` leaves `ctx.auth` as `null`, not the session or `null` |
| segment | `_type` is `"segment"`. It is not a `routeParents` entry. It adds no auth mode and no preloader key |

## What each callback receives

Validators receive the raw values. `.input({ params })` receives `Record<string, string \| string[]>`, each value still percent-encoded (B81). `.input({ searchParams })` receives the raw search record, decoded, not `URLSearchParams` (B31, BUGS.md 147). Later callbacks on that route see the validator output.

| callback | fields |
| --- | --- |
| `authorize` | `auth` (the resolved mode), `params`, `search`, `preloaderContext` (parents only; the root omits it), `env`, `request`. The request context is `serverCtx()` |
| preloader | the same fields as `authorize`. The return is not in this callback |
| loader | `auth`, `params`, `search`, `preloaderContext` (parents, then this return), `env`, `request`, `defer`. `queryClient` is present only when `hasQueryClient` is `true`. The request context is `serverCtx()`; `buildUrl`, `notFound`, `redirect`, `unauthenticated`, and `unauthorized` are imports from `@lovrozagar/flare`, and the four throw helpers return `never` |
| `.response()` | `auth`, `params`, `search`, `preloaderContext` (parents, then this return), `env`, `request`. No `loaderData`, no `defer`, no `queryClient`. `serverCtx()` and the imported helpers as for the loader |
| head | `{ params, search, loaderData, preloaderContext }`. Validated params and search, this route's loader data, the accumulated preloader context. No `auth`. `HeadConfig` is not generic. `jsonLd` stays the type in `dx/head.md` |
| headers | the same four fields. The return is `Record<string, string \| string[]>` |
| route `.security()` | the same four fields. No `nonce`. The `createServer({ security })` callback stays `{ request, env, nonce, serverContext }` (`dx/server.md`) |
| page render | `{ params, search, loaderData, preloaderContext }`. No `children`. No `auth` |
| layout and root render | the page fields plus `children: JSX.Element` |
| segment render | fixed `(props: { children?: JSX.Element }) => children`, optional as on any chain render |
| `errorRender` | `error: Error`, `params`, `search`, `reset: () => void`. `reset()` replaces the current URL in place and revalidates. It does not push (B82). In dev `message` and `stack` are the thrown ones. A non-Error uses `String(value)` and `stack` is `""`. In production `message` is the generic message, or the `markSafeError` message, and `stack` is `""` (B76). The function that runs is the walk in `dx/builder.md`. `params` and `search` are that function's route (B77) |
| `notFoundRender` | `params`, `search` |
| `unauthenticatedRender`, `unauthorizedRender` | `error: Error`, `params`, `search` |
| `loaderDeps` | `{ search, params }`, both raw. A key that exists only on the validator output is absent |
| `shouldRefetch` | `trigger` and `location.current` / `location.next`, each `{ hash, params, pathname, search }`. `params` and `search` are raw |
| server-fn handler | `input`, `auth`, `env`, `request`, `serverContext`, `revalidate`. No `signal` |
| server-fn stream | `input`, `auth`, `env`, `request`, `serverContext`, `signal`. No `revalidate` |

`env` and `serverContext` use `FlareRegister`. Render, head, headers, security, and the boundary renders do not receive them.

A method called before its step is absent from the type and throws (`chain.test.ts` `order`, `propagation.test.ts` `method order`). After `.errorRender()` that method is gone and the other boundary methods remain. After all four, none remain. After `.intercept()` that method is gone and `cache` remains. On a server function, `.authenticate()` removes itself and leaves `input`, `authorize`, `handler`, and `stream`.

## Matrix

Each row is one case in `packages/core/tests/types/propagation.test.ts`, except `hook from`, `hook unknown`, `use match untyped`, `use location raw`, and `use navigate`, which are in `packages/core/tests/types/navigation.test.ts`, and the ten `server fn` rows, which are in `packages/core/tests/types/server-fn.test.ts`. The case name is the first column. `expectTypeOf` covers the positive program. `@ts-expect-error` covers the negative program. Rows marked `app` are also assignments in `packages/core/tests/types/app/src/checks.ts`, `checks-data.ts`, `checks-fns.ts`, and `checks-chain.ts`. Rows marked `gen` are also text cases in `vite/codegen/types-gen.test.ts`. A row marked `only` has no case in `propagation.test.ts`: its type is a builder callback's, which reads the generated register, or the generated text itself, and a stand-in type written in the test would check nothing of the package (plan 21 11.5).

An augmented register is the precondition, except `unregistered fallback` and `auth unaugmented`.

| case | producer | consumer | positive | negative | where |
| --- | --- | --- | --- | --- | --- |
| `param types` | `[id]`, `[...path]`, `[[locale]]`, `[[...rest]]` | `params` on render, `Link`, `useParams({ from })` | `string`, `string[]`, `string \| undefined`, `string[] \| undefined` | `id` as `number`; the optional key omitted inside the object | app, gen |
| `no params` | `/about` | `Link` | `params` omitted | `params` passed | app, gen |
| `optional param` | `[[locale]]` | `Link` | `params: { locale: "en" }` and `params: { locale: undefined }` | `params` omitted; `params: {}` | app |
| `catch-all` | `[...path]` | `Link` | `params: { path: ["a", "b"] }` | `path: "a"` | app |
| `optional catch-all` | `[[...rest]]` | `Link` | `rest: undefined` | `params: {}` | app |
| `literal brackets` | `[_]id]` | `params` | `{}` | a key named `id` | app |
| `group is not a param` | `(blog)` | `params` | no key from the group | a key named `blog` | app |
| `param before root` | `[locale]/_root_/about` | `params` | `locale: string` | `locale` omitted | app |
| `input params` | `.input({ params })` returns `{ id: number }` | render `params`, `Link` | `id.toFixed(0)` | `id.toUpperCase()`; the bracket `string` assigned back | app, gen |
| `input one side` | `.input({ params })` only | `search` | search stays the raw record | search typed as the params output | app |
| `input empty` | `.input({})` | the builder | | does not type-check: `RouteInput` names `params`, `searchParams`, or both (`app`: `checks-data.ts` `input empty`, plan 21 11.4) | app only |
| `missing param` | `[id]` | `Link`, `navigate` | `params: { id: "1" }` | `params` omitted | app |
| `extra param` | `[id]` | `Link` | | `params: { id: "1", extra: "x" }` | app |
| `unknown route` | augmented `routeModules` | `to` | a page id | `"nope"` and a wide `string` | app |
| `layout to` | a layout id | `to` | | the layout id | app |
| `segment to` | a segment id | `to` | | the segment id | app |
| `response route id` | a `.response()` page | `to`, `routeModules` | the id is legal. Loader data is `void` | the id absent from `routeModules`; the id present in `routes` | app, gen |
| `unregistered fallback` | empty `FlareRegister` | `to`, `params`, `search` | `to` is `string`. `params` are not checked. `search` is the optional raw record | the maps are `any` | |
| `hash not generic` | any page | `hash`, `replace` | `hash: "top"`, `replace: true` | `hash` typed as a route-specific union | |
| `search raw` | no `.input({ searchParams })` | `Link` `search`, render `search` | `{ q: "a" }` and `{ q: ["a", "b"] }` omitted | `{ q: 1 }` | app |
| `search validated` | validator returns `{ page: number }` | render `search`, `useSearch({ from })` | `page` is `number` | `page` is `string` | app |
| `imported input` | `.input()` given an object imported by name, by default, through a namespace, or through a `paths` alias | `useParams`, `useSearch`, `Link`, `navigate`, `buildUrl` | the validator outputs | the bracket string; a required search key omitted | app |
| `factory input` | `.input()` given a factory's result | `useParams`, `useSearch`, `Link`, `buildUrl` | the validator outputs | the bracket string; a string for a number | app |
| `never output` | a params validator whose output is `never` | `useParams`, `Link` | `never` | the bracket params | app |
| `union output` | params output `{ n: number } \| { s: string }`, search output `{ a: string } \| { b: string }` | `Link` | either member's object for each | `params` or `search` omitted; a shape neither member has | app: checks-union.ts |
| `search required key` | output `{ q: string; page?: number }` | `Link` | `search: { q: "a" }` | `search` omitted; `page` required when `q` is passed is wrong, `page` may be omitted | app |
| `search optional keys` | output `{ tag?: string }` | `Link` | `search` omitted and `search: {}` | `search: { extra: "x" }` | app |
| `search extra key` | a validator object | `Link` | the known keys | a fresh extra key | app |
| `search empty` | validator returns `{}` | `Link` | `search` omitted | `search: {}` | app |
| `parent search hidden` | layout validates `{ section: string }`, page does not | page `search` | the page stays raw | the page requires `section` | app |
| `loader deep` | loader returns `{ user: { name: string } }` | `loaderData.user.name`, `useLoaderData({ from })` | `name` is `string` | `user.age`; `loaderData.missing` | app |
| `loader primitive` | loader returns `"text"` or `1` | the loader | an object or no return | a primitive return | app |
| `loader awaited` | loader returns `Promise<{ n: number }>` | `loaderData` | `{ n: number }` | the `Promise` remaining | app only |
| `loader absent` | render and no `.loader()` | `loaderData` | `void` | reading a field | app |
| `parent loader hidden` | layout loader `{ section: string }`, page loader `{ title: string }` | `useLoaderData({ from: pageId })` | `title` | `section` on the page call | app |
| `layout data` | the same pair | `useLoaderData({ from: layoutId })` | `section` | `title` on the layout call | app |
| `preloader accumulate` | root `{ requestId: string }`, layout `{ role: "admin" \| "editor" }`, page `{ n: 1 }` | page render and `usePreloaderContext({ from: pageId })` | all three keys | a parent key missing | app |
| `preloader narrow` | parent `role: "admin" \| "editor"`, own `role: "admin"` | later callbacks | `role` is `"admin"` | `role` assigned `"editor"` | app |
| `preloader clash` | parent `theme: string`, own `theme: number`; or literals that share nothing, a layout's `role: "admin" \| "editor"` under a page's `role: "viewer"` | later callbacks | a sibling key still reads: the context merges key by key, so only the clashing key is `never` (`app`: `checks-data.ts` `preloader literal clash`, `(blog)/viewer`, plan 21 11.2) | `theme` used as `string` or as `number`; `role` given any value | |
| `preloader empty keeps` | parent `{ requestId: string }`, own `{}` | later callbacks | `requestId` remains | `requestId` erased | app only |
| `preloader parents only` | own return `{ n: 1 }` | the preloader callback and `authorize` | parent keys | `n` on those two callbacks | app only |
| `root preloader` | root `.preloader()` returns `{ requestId: string }` | the root preloader callback; later root callbacks | the callback has no `preloaderContext`; later callbacks see `requestId` | `ctx.preloaderContext` on the root preloader callback; a parent key | app only |
| `missing parent` | `routeParents` names an id absent from `routeModules` | preloader context | | the context is `never`, not `{}` | |
| `auth required` | `.authenticate()` and `auth: { userId: string }` | loader `ctx.auth` | `userId` is `string` | `null` assigned to `auth` | app |
| `auth optional` | `.authenticateOptional()` | loader `ctx.auth` | the session or `null` | `ctx.auth.userId` with no check | app |
| `auth unaugmented` | `.authenticate()` and no `auth` field | loader `ctx.auth` | `null` | `ctx.auth.userId` | |
| `cannot loosen` | parent seed `true` | `.authenticateOptional()` | `.authenticate()` still type-checks | `.authenticateOptional()` does not type-check | app only |
| `omit keeps parent` | parent `true`, child calls neither method | child loader `ctx.auth` | `userId` | `null` assigned | app |
| `grandchild strict` | outer `true`, middle file omits both methods | grandchild loader | `userId` | the middle file's omission widening the grandchild to the session or `null` | app |
| `authorize reads` | `.authorize()` and no authenticate method, parent seed `false` | loader `ctx.auth` | the session or `null` | `null` only; `userId` with no check | app |
| `authorize keeps required` | parent `true`, child `.authorize()` only | child `ctx.auth` | the session, non-null | the session or `null` | app only |
| `authorize keeps optional` | an `"optional"` seed (`.authenticateOptional()` before it), then `.authorize()` | child `ctx.auth` | the session or `null` | `true` (non-null) forced by `authorize` | app only |
| `render auth` | `.authenticate()` | render props | | `props.auth` | app only |
| `auth mode` | `.authenticateOptional()` | `authModes` | `"optional"`. The file contains no `.authenticate("optional")` | the key present when the method was not called | gen |
| `server fn no optional` | `createServerFn` | the builder | `.authenticate()` | `.authenticateOptional` | |
| `server fn auth null` | no `.authenticate()` | handler `ctx.auth` | `null` | the session or `null`; `userId` | app |
| `server fn auth required` | `.authenticate()` | handler `ctx.auth` | `userId` after augmentation | an argument passed to `.authenticate()` | app |
| `hook from` | `routeModules` | `useLoaderData`, `useParams`, `useSearch`, `usePreloaderContext`, `useMatch` | `{ from: pageId }` | the call with no argument | app |
| `hook unknown` | augmented register | those hooks | | `{ from: "nope" }` | app |
| `use match untyped` | `useMatch({ from })` | the return | `{ id: string, routeId: string }` | `match.params`; `match.loaderData.user` | app |
| `use location raw` | `useLocation()` | `params`, `search` | the raw records. No `{ from }` | the validator output assigned to `search` | app |
| `use navigate` | `useNavigate()` | the return | the same generic as `navigate` | a separate untyped `(to: string) => void` | |
| `i18n t hooks` | `useLoaderT(translations)`, `usePreloaderT(translations)` | the binding | `t` for that loader or preloader: `(key, values?) => string`, plus `t.rich` | either hook used as `useLoaderData`; a call with no translations | app only |
| `defer field` | `ctx.defer(async () => ({ quote: string }))` | `loaderData.reviews` | `Deferred<{ quote: string }>` | the field assigned `{ quote: string }`; the field awaited | app |
| `defer nested` | the same | `.promise` | `(await reviews.promise).quote` is `string` | `reviews.quote`; `reviews.message` | app |
| `defer no then` | `Deferred<T>` | `Awaited` | the deferred field stays wrapped | `Awaited<Deferred<T>>` equals `T` | |
| `query options input` | a server function whose input is `{ q: string }` and whose handler returns `{ q: string }` | `serverFnQueryOptions(fn, { queryKey, input })` | `queryFn` is `() => Promise<{ q: string }>`. `input` is `{ q: string }` | `input` omitted; a fresh extra key | app only |
| `query options void` | a server function with no `.input()` | the same helper | `input` omitted. `queryFn` calls `fn()` | `input` passed | app only |
| `mutation options` | a handler that returns `{ id: string }` | `serverFnMutationOptions(fn, { mutationKey })` | `onSuccess` receives `{ id: string }` | the envelope type; `onSuccess` present when `mutationKey` is omitted | app only |
| `server fn input` | `.input()` with a schema whose input and output are `{ q: string }`; and a transforming one, input `string`, output `number` | the client argument and handler `ctx.input` | the argument is the input (`{ q: string }`, then `string`); `ctx.input` is the output (`{ q: string }`, then `number`) | a fresh extra key; the argument omitted | app |
| `server fn input void` | no `.input()` | the client function | called with no argument. `ctx.input` is `undefined` | a value passed | app |
| `server fn schema unknown` | a Standard Schema whose output is `unknown` | the client argument | | a bad key is not rejected. This row documents that limit | |
| `server fn return` | handler returns `{ secret: string }` | the client | `Promise<{ secret: string }>`. The field stays | the envelope type; `secret` stripped | app |
| `server fn stream` | `yield` of `{ n: number }` | the client iterator | `AsyncIterable<{ n: number }>`. The generator's return is dropped | `revalidate` on the stream context; `signal` on the handler | app |
| `server fn render call` | the client function | a render body | the call type-checks. The stub throws at runtime | a type error added to make the call illegal | |
| `server fn methods` | `.authenticate()` | the server-fn builder | `input`, `authorize`, `handler`, and `stream` remain | `.authenticate` still present | |
| `query client present` | `hasQueryClient: true` | loader `ctx` | `queryClient` is the query client | `queryClient` on preloader, render, or head | app, gen only |
| `query client absent` | the field omitted | loader `ctx` | | `ctx.queryClient` | gen only |
| `head loader` | this route's loader and preloader | head `ctx` | `loaderData` and the accumulated preloader, validated params and search | `ctx.auth`; a parent loader field; `parentHead` | app only |
| `headers record` | headers callback | the return and `ctx` | `Record<string, string \| readonly string[] \| undefined>` and the same four fields as head | `parentHeaders`; `ctx.auth` | app only |
| `security no nonce` | route `.security(ctx => …)` | `ctx` | the same four fields | `ctx.nonce` | app only |
| `loader deps raw` | a search validator `{ page: number }` | `loaderDeps` | raw `search` and raw `params` | `search.page` as `number` | app only |
| `should refetch raw` | the same | `ctx.search`; `location.current.search` | the raw record; the URL's query string | the validator output | app only |
| `error boundary` | `errorRender` | the props | `error` is `Error`, `params` and `search` are typed, `reset()` | `error` as `string`; `props.auth` | app only |
| `not found boundary` | `notFoundRender` | the props | typed `params` and `search` | an `error` prop | app only |
| `auth boundary` | `unauthenticatedRender` | the props | `error` is `Error`, not a narrower class | `reset` | app only |
| `method order` | `.loader()` then `.cache()` | the builder | | `.cache` is absent | |
| `boundary remains` | `.errorRender()` | the builder | `notFoundRender` remains | a second `errorRender` | |
| `boundaries done` | all four boundary methods | the builder | | any boundary method remaining | |
| `intercept remains` | `.intercept()` | the builder | `.cache()` remains | a second `.intercept()` | |
| `segment no data` | `createPathSegment` | the export | `_type` is `"segment"`. Render props are `{ children? }` | `.loader`, `.preloader`, `.authenticate`, `.input`, `.head` | app, gen only |
| `segment parent` | a segment file on the path | `routeParents` | the segment id is absent | the segment id listed as a parent | gen only |
| `parents closed` | `routeParents` | `routeModules` | every parent id is a key | a parent id missing | gen |
| `keyed by route id` | a layout and a page both call `.input()` | `routeParams`, `routeSearchParams` | both keys are route ids | the page entry carrying the layout's output; a public URL used as the key | gen |
| `no virtual` | the generated file | the text | no `virtual:` specifier | a `virtual:` module | gen only |
| `no phantom` | the generated file | `auth`, `env`, `serverContext` | those three fields are absent from the generated augmentation | `~flare` | gen only |
| `env omitted` | no `env` augmentation | loader `ctx.env` | `unknown` | a field read | |
| `server context omitted` | no `serverContext` augmentation | `serverCtx()` | `Record<string, unknown>` | a specific field required | |

`redirect()` returns `never`. A loader that redirects to its own route, when that route validates search or params, still loops through its own type, since the target's search or params type is that route's: annotate the loader's return type there (BUGS.md 105). `to` on `redirect` follows this matrix. The `href` form accepts any `http:` or `https:` string and rejects `params`, `search`, and `to` on that object (`dx/navigate.md`).

`buildUrl`, imported from `@lovrozagar/flare` and called from a loader, preloader, `authorize`, or `.response()`, uses the same `to`, `params`, and `search` generics.

The client type of a server function is `(input: TInput) => Promise<TOutput>` after `.input()`, and `() => Promise<TOutput>` when the input is still `void`. A stream's client type returns `AsyncIterable<TChunk>`. Calling it during render is a runtime stub throw, not a type error (`dx/server-fn.md`).

## Tests

`packages/core/tests/types/propagation.test.ts` is in the core typecheck program. Vitest executing the file is not enough. `expectTypeOf` and `@ts-expect-error` must fail the build when the row is wrong.

`packages/core/tests/types/app.test.ts` runs the types generator on `app/` and then `tsc --noEmit` with the fixture tsconfig. Exit 0 is the pass. A temp copy that adds an unused `@ts-expect-error` above a valid line must exit non-zero. The fixture is not a Playwright app (B70).

The fixture tsconfig sets `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `noPropertyAccessFromIndexSignature`. Those flags apply to the fixture program. A failure inside a Flare declaration under those flags is a Flare type bug.

`app/src/register.d.ts` augments `auth`, `env`, and `serverContext` only. The generator writes the maps. The committed app has no `_gen` directory. `app/src/query.ts` imports `@lovrozagar/flare/query`, so this app is the `query client present` case. The absent case is the generator fixture that does not import it.

## What the app writes

```ts
declare module "@lovrozagar/flare" {
  interface FlareRegister {
    auth: Session;
    env: Env;
    serverContext: Ctx;
  }
}
```

| field | when omitted |
| --- | --- |
| `auth` | `null`. A required route's session type is this field. An optional route's session is this field or `null` |
| `env` | `unknown`. This is the `env` on `fetch`, on loaders, and on `createServer({ authenticate })` |
| `serverContext` | `Record<string, unknown>`. `serverCtx()` returns it |

Codegen does not invent these three. An app that wants them typed writes the augmentation. Once it does, `createServer({ authenticate })` reads `ctx.env` as `env` and must answer `auth` or `null`, sync or async; a session of another shape does not type-check (`app`: `checks-data.ts` `server authenticate`, plan 21 11.3, BUGS.md 250). `fetch`'s own `env` stays `unknown`: an adapter hands it the platform's bindings, a Workers `env` say, whose static type is the platform's and not the app's.
